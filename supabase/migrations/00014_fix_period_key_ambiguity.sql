-- Fix ambiguous period_key references inside task claim functions.

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
BEGIN
  SELECT * INTO v_user FROM public.profiles WHERE id = auth.uid();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION '請先登入再領取任務';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id AND is_active = true;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION '找不到可使用的任務';
  END IF;

  PERFORM public.assert_task_completion_method(v_task, p_method);
  PERFORM public.assert_task_scan_window(v_task);

  v_period_key := public.period_key_for_task(v_task.recurrence_type, NOW(), v_task.custom_reset_days);

  SELECT count(*)
  INTO v_claim_count
  FROM public.task_completions tc
  WHERE tc.task_id = v_task.id
    AND tc.user_id = v_user.id
    AND tc.status IN ('pending', 'approved')
    AND coalesce(tc.period_key, 'once') = v_period_key;

  IF v_claim_count >= greatest(v_task.per_period_limit, 1) THEN
    RAISE EXCEPTION '本週期已達領取上限';
  END IF;

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
      WHEN v_status = 'approved' THEN v_user.name || ' 已完成「' || v_task.title || '」，獲得 ' || v_task.points || ' 點'
      ELSE v_user.name || ' 已送出「' || v_task.title || '」，等待審核'
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
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF v_actor.id IS NULL OR v_actor.role NOT IN ('teacher', 'leader') THEN
    RAISE EXCEPTION '只有教師或幹部可以發點';
  END IF;

  IF v_actor.role = 'leader' AND v_actor.class_id IS NULL THEN
    RAISE EXCEPTION '幹部尚未設定班級';
  END IF;

  SELECT * INTO v_session
  FROM public.task_sessions
  WHERE id = p_session_id
    AND is_active = true;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION '找不到啟用中的任務工作階段';
  END IF;

  IF v_session.actor_id <> v_actor.id AND v_actor.role <> 'teacher' THEN
    RAISE EXCEPTION '你不能使用其他人的工作階段';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = v_session.task_id AND is_active = true;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION '找不到可使用的任務';
  END IF;

  PERFORM public.assert_task_completion_method(v_task, 'scanner');
  PERFORM public.assert_task_scan_window(v_task);

  SELECT * INTO v_profile FROM public.profiles WHERE scan_code = trim(p_student_scan_code);
  IF v_profile.id IS NOT NULL THEN
    IF v_profile.role = 'teacher' THEN
      RAISE EXCEPTION '教師帳號不能使用學生掃碼領取';
    END IF;

    IF v_actor.role = 'leader' AND v_actor.class_id IS DISTINCT FROM v_profile.class_id THEN
      RAISE EXCEPTION '幹部只能對同班學生發點';
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
      v_profile.name || ' 已完成「' || v_task.title || '」，獲得 ' || v_task.points || ' 點';
    RETURN;
  END IF;

  SELECT * INTO v_roster FROM public.student_rosters WHERE scan_code = trim(p_student_scan_code);
  IF v_roster.id IS NULL THEN
    RAISE EXCEPTION '找不到這個學生條碼';
  END IF;

  IF v_actor.role = 'leader' AND v_actor.class_id IS DISTINCT FROM v_roster.class_id THEN
    RAISE EXCEPTION '幹部只能對同班學生發點';
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
    v_roster.name || ' 已完成「' || v_task.title || '」，獲得 ' || v_task.points || ' 點';
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
BEGIN
  SELECT *
  INTO v_task
  FROM public.tasks
  WHERE task_code = trim(p_task_code)
    AND is_active = true;

  IF v_task.id IS NULL THEN
    RAISE EXCEPTION '找不到可使用的任務';
  END IF;

  PERFORM public.assert_task_completion_method(v_task, 'scanner');
  PERFORM public.assert_task_scan_window(v_task);

  SELECT * INTO v_profile FROM public.profiles WHERE scan_code = trim(p_student_scan_code);
  IF v_profile.id IS NOT NULL THEN
    IF v_profile.role = 'teacher' THEN
      RAISE EXCEPTION '教師帳號不能使用學生掃碼領取';
    END IF;

    IF v_task.class_id IS NOT NULL AND v_task.class_id IS DISTINCT FROM v_profile.class_id THEN
      RAISE EXCEPTION '這個任務不開放給這位學生';
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

    INSERT INTO public.task_completions (task_id, user_id, status, approved_by, awarded_by, session_id, period_key)
    VALUES (v_task.id, v_profile.id, 'approved', NULL, NULL, NULL, v_period_key)
    RETURNING id INTO v_completion_id;

    UPDATE public.profiles
    SET stars = stars + v_task.points
    WHERE id = v_profile.id;

    INSERT INTO public.transactions (user_id, type, amount, description, related_id)
    VALUES (v_profile.id, 'earn', v_task.points, '公開掃碼領取：' || v_task.title, v_task.id);

    RETURN QUERY
    SELECT
      v_completion_id,
      v_profile.id,
      v_profile.name,
      v_task.title,
      v_task.points,
      v_period_key,
      v_profile.name || ' 已完成「' || v_task.title || '」，獲得 ' || v_task.points || ' 點';
    RETURN;
  END IF;

  SELECT * INTO v_roster FROM public.student_rosters WHERE scan_code = trim(p_student_scan_code);
  IF v_roster.id IS NULL THEN
    RAISE EXCEPTION '找不到這個學生條碼';
  END IF;

  IF v_task.class_id IS NOT NULL AND v_task.class_id IS DISTINCT FROM v_roster.class_id THEN
    RAISE EXCEPTION '這個任務不開放給這位學生';
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
    v_roster.name || ' 已完成「' || v_task.title || '」，獲得 ' || v_task.points || ' 點';
END;
$$;
