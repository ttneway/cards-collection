ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS scope_type TEXT NOT NULL DEFAULT 'school'
  CHECK (scope_type IN ('school', 'class'));

CREATE TABLE IF NOT EXISTS public.task_classes (
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, class_id)
);

CREATE INDEX IF NOT EXISTS task_classes_class_id_idx ON public.task_classes(class_id);

ALTER TABLE public.task_classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_classes_select_active ON public.task_classes;
CREATE POLICY task_classes_select_active ON public.task_classes FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = task_classes.task_id
        AND t.is_active = true
    )
  );

DROP POLICY IF EXISTS task_classes_manage_staff ON public.task_classes;
CREATE POLICY task_classes_manage_staff ON public.task_classes FOR ALL
  USING (
    public.current_user_role() IN ('teacher', 'admin')
    OR (
      public.current_user_role() = 'leader'
      AND class_id = public.current_user_class_id()
    )
  )
  WITH CHECK (
    public.current_user_role() IN ('teacher', 'admin')
    OR (
      public.current_user_role() = 'leader'
      AND class_id = public.current_user_class_id()
    )
  );

UPDATE public.tasks
SET scope_type = CASE WHEN class_id IS NULL THEN 'school' ELSE 'class' END;

INSERT INTO public.task_classes (task_id, class_id)
SELECT id, class_id
FROM public.tasks
WHERE class_id IS NOT NULL
ON CONFLICT (task_id, class_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.task_applies_to_class(p_task_id UUID, p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN t.scope_type = 'school' THEN true
    WHEN p_class_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.task_classes tc
      WHERE tc.task_id = t.id
        AND tc.class_id = p_class_id
    )
  END
  FROM public.tasks t
  WHERE t.id = p_task_id
$$;

CREATE OR REPLACE FUNCTION public.sync_task_primary_class()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id UUID;
  v_scope_type TEXT;
  v_primary_class_id UUID;
BEGIN
  v_task_id := coalesce(NEW.task_id, OLD.task_id);

  SELECT scope_type
  INTO v_scope_type
  FROM public.tasks
  WHERE id = v_task_id;

  IF v_scope_type = 'school' THEN
    UPDATE public.tasks
    SET class_id = NULL
    WHERE id = v_task_id;
    RETURN coalesce(NEW, OLD);
  END IF;

  SELECT tc.class_id
  INTO v_primary_class_id
  FROM public.task_classes tc
  WHERE tc.task_id = v_task_id
  ORDER BY tc.created_at, tc.class_id
  LIMIT 1;

  UPDATE public.tasks
  SET class_id = v_primary_class_id
  WHERE id = v_task_id;

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_task_primary_class_trigger ON public.task_classes;
CREATE TRIGGER sync_task_primary_class_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.task_classes
FOR EACH ROW
EXECUTE FUNCTION public.sync_task_primary_class();

CREATE OR REPLACE FUNCTION public.replace_task_classes(
  p_task_id UUID,
  p_scope_type TEXT,
  p_class_ids UUID[]
)
RETURNS TABLE(primary_class_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_scope_type TEXT := trim(lower(coalesce(p_scope_type, 'school')));
  v_class_ids UUID[];
  v_class_id UUID;
BEGIN
  SELECT *
  INTO v_actor
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_actor.id IS NULL OR v_actor.role NOT IN ('teacher', 'leader', 'admin') THEN
    RAISE EXCEPTION '只有教師、幹部或管理者可以設定任務班級範圍';
  END IF;

  IF v_scope_type NOT IN ('school', 'class') THEN
    RAISE EXCEPTION '任務範圍類型無效';
  END IF;

  IF v_actor.role = 'leader' AND v_scope_type <> 'class' THEN
    RAISE EXCEPTION '幹部只能建立班級任務';
  END IF;

  IF v_scope_type = 'school' THEN
    DELETE FROM public.task_classes WHERE task_id = p_task_id;

    UPDATE public.tasks
    SET scope_type = 'school',
        class_id = NULL
    WHERE id = p_task_id;

    RETURN QUERY SELECT NULL::UUID;
    RETURN;
  END IF;

  SELECT coalesce(array_agg(DISTINCT class_id), ARRAY[]::UUID[])
  INTO v_class_ids
  FROM unnest(coalesce(p_class_ids, ARRAY[]::UUID[])) AS class_id;

  IF coalesce(array_length(v_class_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION '班級任務至少要指定一個班級';
  END IF;

  IF v_actor.role = 'leader' THEN
    IF v_actor.class_id IS NULL THEN
      RAISE EXCEPTION '幹部尚未綁定班級';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_class_ids) AS class_id
      WHERE class_id IS DISTINCT FROM v_actor.class_id
    ) THEN
      RAISE EXCEPTION '幹部只能指定自己的班級';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_class_ids) AS input_class_id
    LEFT JOIN public.classes c ON c.id = input_class_id
    WHERE c.id IS NULL
  ) THEN
    RAISE EXCEPTION '指定的班級不存在';
  END IF;

  DELETE FROM public.task_classes WHERE task_id = p_task_id;

  FOREACH v_class_id IN ARRAY v_class_ids LOOP
    INSERT INTO public.task_classes (task_id, class_id)
    VALUES (p_task_id, v_class_id)
    ON CONFLICT (task_id, class_id) DO NOTHING;
  END LOOP;

  UPDATE public.tasks
  SET scope_type = 'class',
      class_id = v_class_ids[1]
  WHERE id = p_task_id;

  RETURN QUERY SELECT v_class_ids[1];
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_task_classes(UUID, TEXT, UUID[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_task_claim_statuses()
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
  WITH me AS (
    SELECT p.class_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
  ),
  task_status AS (
    SELECT
      t.id AS task_id,
      public.current_period_key_for_task_row(t) AS period_key,
      count(tc_period.id) AS claim_count,
      max(tc_all.completed_at) AS latest_completed_at,
      t.claim_cooldown_minutes
    FROM public.tasks t
    CROSS JOIN me
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
      AND t.is_active = true
      AND public.task_applies_to_class(t.id, me.class_id)
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

  IF NOT public.task_applies_to_class(v_task.id, v_user.class_id) THEN
    RAISE EXCEPTION '這個任務不適用於你的班級';
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

CREATE OR REPLACE FUNCTION public.toggle_task_session(p_task_code TEXT)
RETURNS TABLE(action TEXT, session_id UUID, task_id UUID, task_title TEXT, message TEXT)
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor profiles%ROWTYPE;
  v_task tasks%ROWTYPE;
  v_session task_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF v_actor.id IS NULL OR v_actor.role NOT IN ('teacher', 'leader', 'admin') THEN
    RAISE EXCEPTION '只有教師、幹部或管理者可以開關任務';
  END IF;
  IF v_actor.role = 'leader' AND v_actor.class_id IS NULL THEN
    RAISE EXCEPTION '幹部尚未綁定班級';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE task_code = trim(p_task_code) AND is_active = true;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION '找不到已啟用的任務';
  END IF;

  IF v_actor.role = 'leader' AND NOT public.task_applies_to_class(v_task.id, v_actor.class_id) THEN
    RAISE EXCEPTION '幹部只能開啟自己班級可使用的任務';
  END IF;

  SELECT * INTO v_session
  FROM public.task_sessions
  WHERE actor_id = v_actor.id AND task_id = v_task.id AND is_active = true
  ORDER BY opened_at DESC
  LIMIT 1;

  IF v_session.id IS NOT NULL THEN
    UPDATE public.task_sessions
    SET is_active = false, closed_at = NOW()
    WHERE id = v_session.id;

    RETURN QUERY SELECT 'closed', v_session.id, v_task.id, v_task.title, '已關閉任務：' || v_task.title;
    RETURN;
  END IF;

  UPDATE public.task_sessions
  SET is_active = false, closed_at = NOW()
  WHERE actor_id = v_actor.id AND is_active = true;

  INSERT INTO public.task_sessions (task_id, actor_id)
  VALUES (v_task.id, v_actor.id)
  RETURNING * INTO v_session;

  RETURN QUERY SELECT 'opened', v_session.id, v_task.id, v_task.title, '已開啟任務：' || v_task.title;
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
  IF v_actor.id IS NULL OR v_actor.role NOT IN ('teacher', 'leader', 'admin') THEN
    RAISE EXCEPTION '只有教師、幹部或管理者可以使用掃碼發點';
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

  IF v_session.actor_id <> v_actor.id AND v_actor.role NOT IN ('teacher', 'admin') THEN
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
    IF v_profile.role IN ('teacher', 'admin') THEN
      RAISE EXCEPTION '高權限帳號不可用學生掃碼領取';
    END IF;

    IF v_actor.role = 'leader' AND v_actor.class_id IS DISTINCT FROM v_profile.class_id THEN
      RAISE EXCEPTION '幹部只能為同班學生發點';
    END IF;

    IF NOT public.task_applies_to_class(v_task.id, v_profile.class_id) THEN
      RAISE EXCEPTION '這個任務不適用於該學生班級';
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

  IF NOT public.task_applies_to_class(v_task.id, v_roster.class_id) THEN
    RAISE EXCEPTION '這個任務不適用於該學生班級';
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
    IF v_profile.role IN ('teacher', 'admin') THEN
      RAISE EXCEPTION '高權限帳號不可用學生掃碼領取';
    END IF;

    IF NOT public.task_applies_to_class(v_task.id, v_profile.class_id) THEN
      RAISE EXCEPTION '這個任務不適用於你的班級';
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

  IF NOT public.task_applies_to_class(v_task.id, v_roster.class_id) THEN
    RAISE EXCEPTION '這個任務不適用於你的班級';
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
