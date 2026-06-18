-- Add per-task cooldowns between claims and expose cooldown status to the frontend.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS claim_cooldown_minutes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_claim_cooldown_minutes_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_claim_cooldown_minutes_check
  CHECK (claim_cooldown_minutes >= 0);

CREATE OR REPLACE FUNCTION public.task_next_claim_at(
  p_latest_completed_at TIMESTAMPTZ,
  p_claim_cooldown_minutes INTEGER
)
RETURNS TIMESTAMPTZ
LANGUAGE SQL
STABLE
AS $$
  SELECT CASE
    WHEN p_latest_completed_at IS NULL OR greatest(coalesce(p_claim_cooldown_minutes, 0), 0) = 0 THEN NULL
    ELSE p_latest_completed_at + make_interval(mins => greatest(coalesce(p_claim_cooldown_minutes, 0), 0))
  END
$$;

CREATE OR REPLACE FUNCTION public.assert_task_cooldown(
  p_latest_completed_at TIMESTAMPTZ,
  p_claim_cooldown_minutes INTEGER
)
RETURNS void
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_next_claim_at TIMESTAMPTZ;
BEGIN
  v_next_claim_at := public.task_next_claim_at(p_latest_completed_at, p_claim_cooldown_minutes);

  IF v_next_claim_at IS NOT NULL AND v_next_claim_at > NOW() THEN
    RAISE EXCEPTION '尚未到下次可領取時間，請於 % 後再試一次',
      to_char(v_next_claim_at AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD HH24:MI');
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.get_my_task_claim_statuses();

CREATE FUNCTION public.get_my_task_claim_statuses()
RETURNS TABLE(
  task_id UUID,
  period_key TEXT,
  claim_count BIGINT,
  latest_completed_at TIMESTAMPTZ,
  next_claim_at TIMESTAMPTZ,
  cooldown_remaining_seconds INTEGER
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  WITH task_status AS (
    SELECT
      t.id AS task_id,
      public.current_period_key_for_task_row(t) AS period_key,
      count(tc_period.id) AS claim_count,
      max(tc_all.completed_at) AS latest_completed_at,
      t.claim_cooldown_minutes
    FROM public.tasks t
    LEFT JOIN public.task_completions tc_period
      ON tc_period.task_id = t.id
     AND tc_period.user_id = auth.uid()
     AND tc_period.status IN ('pending', 'approved')
     AND coalesce(tc_period.period_key, 'once') = public.current_period_key_for_task_row(t)
    LEFT JOIN public.task_completions tc_all
      ON tc_all.task_id = t.id
     AND tc_all.user_id = auth.uid()
     AND tc_all.status IN ('pending', 'approved')
    WHERE auth.uid() IS NOT NULL
    GROUP BY t.id, public.current_period_key_for_task_row(t), t.claim_cooldown_minutes
  )
  SELECT
    task_status.task_id,
    task_status.period_key,
    task_status.claim_count,
    task_status.latest_completed_at,
    public.task_next_claim_at(task_status.latest_completed_at, task_status.claim_cooldown_minutes) AS next_claim_at,
    greatest(
      coalesce(
        ceil(extract(epoch FROM (
          public.task_next_claim_at(task_status.latest_completed_at, task_status.claim_cooldown_minutes) - NOW()
        ))),
        0
      ),
      0
    )::INTEGER AS cooldown_remaining_seconds
  FROM task_status;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_task_claim_statuses() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_task_by_user_action(p_task_id UUID, p_method TEXT)
RETURNS TABLE(completion_id UUID, task_title TEXT, points_awarded INTEGER, period_key TEXT, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user profiles%ROWTYPE;
  v_task tasks%ROWTYPE;
  v_period_key TEXT;
  v_claim_count INTEGER;
  v_completion_id UUID;
  v_status TEXT;
  v_points INTEGER := 0;
  v_latest_completed_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_user FROM public.profiles WHERE id = auth.uid();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION '請先登入後再領取任務';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id AND is_active = true;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION '找不到可領取的任務';
  END IF;

  PERFORM public.assert_task_completion_method(v_task, p_method);
  PERFORM public.assert_task_scan_window(v_task);

  v_period_key := public.period_key_for_task(v_task.recurrence_type, NOW(), v_task.custom_reset_days);

  SELECT count(*), max(tc.completed_at)
  INTO v_claim_count, v_latest_completed_at
  FROM public.task_completions tc
  WHERE tc.task_id = v_task.id
    AND tc.user_id = v_user.id
    AND tc.status IN ('pending', 'approved')
    AND coalesce(tc.period_key, 'once') = v_period_key;

  IF v_claim_count >= greatest(v_task.per_period_limit, 1) THEN
    RAISE EXCEPTION '本週期已達領取上限';
  END IF;

  SELECT max(tc.completed_at)
  INTO v_latest_completed_at
  FROM public.task_completions tc
  WHERE tc.task_id = v_task.id
    AND tc.user_id = v_user.id
    AND tc.status IN ('pending', 'approved');

  PERFORM public.assert_task_cooldown(v_latest_completed_at, v_task.claim_cooldown_minutes);

  v_status := CASE WHEN v_task.type = 'approve' THEN 'pending' ELSE 'approved' END;

  INSERT INTO public.task_completions (task_id, user_id, status, session_id, period_key)
  VALUES (v_task.id, v_user.id, v_status, NULL, v_period_key)
  RETURNING id INTO v_completion_id;

  IF v_status = 'approved' THEN
    UPDATE public.profiles
    SET stars = stars + v_task.points
    WHERE id = v_user.id;

    INSERT INTO public.transactions (user_id, type, amount, description, related_id)
    VALUES (v_user.id, 'earn', v_task.points, '任務完成：' || v_task.title, v_task.id);

    v_points := v_task.points;
  END IF;

  RETURN QUERY
  SELECT
    v_completion_id,
    v_task.title,
    v_points,
    v_period_key,
    CASE
      WHEN v_status = 'approved' THEN v_user.name || ' 已完成 ' || v_task.title || '，獲得 ' || v_task.points || ' 點'
      ELSE v_user.name || ' 已送出 ' || v_task.title || '，等待審核'
    END;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_task_by_scan(p_session_id UUID, p_student_scan_code TEXT)
RETURNS TABLE(completion_id UUID, student_id UUID, student_name TEXT, task_title TEXT, points_awarded INTEGER, period_key TEXT, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor profiles%ROWTYPE;
  v_profile profiles%ROWTYPE;
  v_roster student_rosters%ROWTYPE;
  v_session task_sessions%ROWTYPE;
  v_task tasks%ROWTYPE;
  v_period_key TEXT;
  v_claim_count INTEGER;
  v_completion_id UUID;
  v_latest_completed_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF v_actor.id IS NULL OR v_actor.role NOT IN ('teacher', 'leader') THEN
    RAISE EXCEPTION '只有教師或幹部可以使用掃碼發點';
  END IF;

  IF v_actor.role = 'leader' AND v_actor.class_id IS NULL THEN
    RAISE EXCEPTION '幹部尚未綁定班級';
  END IF;

  SELECT * INTO v_session
  FROM public.task_sessions
  WHERE id = p_session_id
    AND is_active = true;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION '找不到啟用中的任務工作階段';
  END IF;

  IF v_session.actor_id <> v_actor.id AND v_actor.role <> 'teacher' THEN
    RAISE EXCEPTION '你不能操作其他人開啟的工作階段';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = v_session.task_id AND is_active = true;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION '找不到可發點的任務';
  END IF;

  PERFORM public.assert_task_completion_method(v_task, 'scanner');
  PERFORM public.assert_task_scan_window(v_task);

  SELECT * INTO v_profile FROM public.profiles WHERE scan_code = trim(p_student_scan_code);
  IF v_profile.id IS NOT NULL THEN
    IF v_profile.role = 'teacher' THEN
      RAISE EXCEPTION '教師帳號不可用學生掃碼領取';
    END IF;

    IF v_actor.role = 'leader' AND v_actor.class_id IS DISTINCT FROM v_profile.class_id THEN
      RAISE EXCEPTION '幹部只能為同班學生發點';
    END IF;

    v_period_key := public.period_key_for_task(v_task.recurrence_type, NOW(), v_task.custom_reset_days);

    SELECT count(*)
    INTO v_claim_count
    FROM public.task_completions tc
    WHERE tc.task_id = v_task.id
      AND tc.user_id = v_profile.id
      AND tc.status = 'approved'
      AND coalesce(tc.period_key, 'once') = v_period_key;

    IF v_claim_count >= greatest(v_task.per_period_limit, 1) THEN
      RAISE EXCEPTION '本週期已達領取上限';
    END IF;

    SELECT max(tc.completed_at)
    INTO v_latest_completed_at
    FROM public.task_completions tc
    WHERE tc.task_id = v_task.id
      AND tc.user_id = v_profile.id
      AND tc.status = 'approved';

    PERFORM public.assert_task_cooldown(v_latest_completed_at, v_task.claim_cooldown_minutes);

    INSERT INTO public.task_completions (task_id, user_id, status, approved_by, awarded_by, session_id, period_key)
    VALUES (v_task.id, v_profile.id, 'approved', v_actor.id, v_actor.id, v_session.id, v_period_key)
    RETURNING id INTO v_completion_id;

    UPDATE public.profiles
    SET stars = stars + v_task.points
    WHERE id = v_profile.id;

    INSERT INTO public.transactions (user_id, type, amount, description, related_id)
    VALUES (v_profile.id, 'earn', v_task.points, '掃碼領取：' || v_task.title, v_task.id);

    RETURN QUERY
    SELECT
      v_completion_id,
      v_profile.id,
      v_profile.name,
      v_task.title,
      v_task.points,
      v_period_key,
      v_profile.name || ' 已完成 ' || v_task.title || '，獲得 ' || v_task.points || ' 點';
    RETURN;
  END IF;

  SELECT * INTO v_roster FROM public.student_rosters WHERE scan_code = trim(p_student_scan_code);
  IF v_roster.id IS NULL THEN
    RAISE EXCEPTION '找不到對應的學生條碼';
  END IF;

  IF v_actor.role = 'leader' AND v_actor.class_id IS DISTINCT FROM v_roster.class_id THEN
    RAISE EXCEPTION '幹部只能為同班學生發點';
  END IF;

  v_period_key := public.period_key_for_task(v_task.recurrence_type, NOW(), v_task.custom_reset_days);

  SELECT count(*)
  INTO v_claim_count
  FROM public.roster_task_completions rtc
  WHERE rtc.task_id = v_task.id
    AND rtc.roster_student_id = v_roster.id
    AND rtc.status = 'approved'
    AND coalesce(rtc.period_key, 'once') = v_period_key;

  IF v_claim_count >= greatest(v_task.per_period_limit, 1) THEN
    RAISE EXCEPTION '本週期已達領取上限';
  END IF;

  SELECT max(rtc.completed_at)
  INTO v_latest_completed_at
  FROM public.roster_task_completions rtc
  WHERE rtc.task_id = v_task.id
    AND rtc.roster_student_id = v_roster.id
    AND rtc.status = 'approved';

  PERFORM public.assert_task_cooldown(v_latest_completed_at, v_task.claim_cooldown_minutes);

  INSERT INTO public.roster_task_completions (task_id, roster_student_id, status, awarded_by, session_id, period_key)
  VALUES (v_task.id, v_roster.id, 'approved', v_actor.id, v_session.id, v_period_key)
  RETURNING id INTO v_completion_id;

  UPDATE public.student_rosters
  SET points = points + v_task.points
  WHERE id = v_roster.id;

  RETURN QUERY
  SELECT
    v_completion_id,
    v_roster.id,
    v_roster.name,
    v_task.title,
    v_task.points,
    v_period_key,
    v_roster.name || ' 已完成 ' || v_task.title || '，獲得 ' || v_task.points || ' 點';
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_task_by_public_scan(p_task_code TEXT, p_student_scan_code TEXT)
RETURNS TABLE(
  completion_id UUID,
  student_id UUID,
  student_name TEXT,
  task_title TEXT,
  points_awarded INTEGER,
  period_key TEXT,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_roster student_rosters%ROWTYPE;
  v_task tasks%ROWTYPE;
  v_period_key TEXT;
  v_claim_count INTEGER;
  v_completion_id UUID;
  v_latest_completed_at TIMESTAMPTZ;
BEGIN
  SELECT *
  INTO v_task
  FROM public.tasks
  WHERE task_code = trim(p_task_code)
    AND is_active = true;

  IF v_task.id IS NULL THEN
    RAISE EXCEPTION '找不到可領取的任務';
  END IF;

  PERFORM public.assert_task_completion_method(v_task, 'scanner');
  PERFORM public.assert_task_scan_window(v_task);

  SELECT * INTO v_profile FROM public.profiles WHERE scan_code = trim(p_student_scan_code);
  IF v_profile.id IS NOT NULL THEN
    IF v_profile.role = 'teacher' THEN
      RAISE EXCEPTION '教師帳號不可用學生掃碼領取';
    END IF;

    IF v_task.class_id IS NOT NULL AND v_task.class_id IS DISTINCT FROM v_profile.class_id THEN
      RAISE EXCEPTION '這個任務僅限指定班級領取';
    END IF;

    v_period_key := public.period_key_for_task(v_task.recurrence_type, NOW(), v_task.custom_reset_days);

    SELECT count(*)
    INTO v_claim_count
    FROM public.task_completions tc
    WHERE tc.task_id = v_task.id
      AND tc.user_id = v_profile.id
      AND tc.status IN ('pending', 'approved')
      AND coalesce(tc.period_key, 'once') = v_period_key;

    IF v_claim_count >= greatest(v_task.per_period_limit, 1) THEN
      RAISE EXCEPTION '本週期已達領取上限';
    END IF;

    SELECT max(tc.completed_at)
    INTO v_latest_completed_at
    FROM public.task_completions tc
    WHERE tc.task_id = v_task.id
      AND tc.user_id = v_profile.id
      AND tc.status IN ('pending', 'approved');

    PERFORM public.assert_task_cooldown(v_latest_completed_at, v_task.claim_cooldown_minutes);

    INSERT INTO public.task_completions (task_id, user_id, status, approved_by, awarded_by, session_id, period_key)
    VALUES (v_task.id, v_profile.id, 'approved', NULL, NULL, NULL, v_period_key)
    RETURNING id INTO v_completion_id;

    UPDATE public.profiles
    SET stars = stars + v_task.points
    WHERE id = v_profile.id;

    INSERT INTO public.transactions (user_id, type, amount, description, related_id)
    VALUES (v_profile.id, 'earn', v_task.points, '公開掃碼：' || v_task.title, v_task.id);

    RETURN QUERY
    SELECT
      v_completion_id,
      v_profile.id,
      v_profile.name,
      v_task.title,
      v_task.points,
      v_period_key,
      v_profile.name || ' 已完成 ' || v_task.title || '，獲得 ' || v_task.points || ' 點';
    RETURN;
  END IF;

  SELECT * INTO v_roster FROM public.student_rosters WHERE scan_code = trim(p_student_scan_code);
  IF v_roster.id IS NULL THEN
    RAISE EXCEPTION '找不到對應的學生條碼';
  END IF;

  IF v_task.class_id IS NOT NULL AND v_task.class_id IS DISTINCT FROM v_roster.class_id THEN
    RAISE EXCEPTION '這個任務僅限指定班級領取';
  END IF;

  v_period_key := public.period_key_for_task(v_task.recurrence_type, NOW(), v_task.custom_reset_days);

  SELECT count(*)
  INTO v_claim_count
  FROM public.roster_task_completions rtc
  WHERE rtc.task_id = v_task.id
    AND rtc.roster_student_id = v_roster.id
    AND rtc.status = 'approved'
    AND coalesce(rtc.period_key, 'once') = v_period_key;

  IF v_claim_count >= greatest(v_task.per_period_limit, 1) THEN
    RAISE EXCEPTION '本週期已達領取上限';
  END IF;

  SELECT max(rtc.completed_at)
  INTO v_latest_completed_at
  FROM public.roster_task_completions rtc
  WHERE rtc.task_id = v_task.id
    AND rtc.roster_student_id = v_roster.id
    AND rtc.status = 'approved';

  PERFORM public.assert_task_cooldown(v_latest_completed_at, v_task.claim_cooldown_minutes);

  INSERT INTO public.roster_task_completions (task_id, roster_student_id, status, awarded_by, session_id, period_key)
  VALUES (v_task.id, v_roster.id, 'approved', NULL, NULL, v_period_key)
  RETURNING id INTO v_completion_id;

  UPDATE public.student_rosters
  SET points = points + v_task.points
  WHERE id = v_roster.id;

  RETURN QUERY
  SELECT
    v_completion_id,
    v_roster.id,
    v_roster.name,
    v_task.title,
    v_task.points,
    v_period_key,
    v_roster.name || ' 已完成 ' || v_task.title || '，獲得 ' || v_task.points || ' 點';
END;
$$;
