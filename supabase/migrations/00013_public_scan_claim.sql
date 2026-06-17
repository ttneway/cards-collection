-- Allow students to claim scanner-enabled tasks without signing in by pairing a task code with a student scan code.

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
LANGUAGE PLPGSQL
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

  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE scan_code = trim(p_student_scan_code);

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
    FROM public.task_completions
    WHERE task_id = v_task.id
      AND user_id = v_profile.id
      AND status IN ('pending', 'approved')
      AND coalesce(period_key, 'once') = v_period_key;

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

  SELECT *
  INTO v_roster
  FROM public.student_rosters
  WHERE scan_code = trim(p_student_scan_code);

  IF v_roster.id IS NULL THEN
    RAISE EXCEPTION '找不到這個學生條碼';
  END IF;

  IF v_task.class_id IS NOT NULL AND v_task.class_id IS DISTINCT FROM v_roster.class_id THEN
    RAISE EXCEPTION '這個任務不開放給這位學生';
  END IF;

  v_period_key := public.period_key_for_task(v_task.recurrence_type, NOW(), v_task.custom_reset_days);

  SELECT count(*)
  INTO v_claim_count
  FROM public.roster_task_completions
  WHERE task_id = v_task.id
    AND roster_student_id = v_roster.id
    AND status = 'approved'
    AND coalesce(period_key, 'once') = v_period_key;

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

GRANT EXECUTE ON FUNCTION public.claim_task_by_public_scan(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.claim_task_by_public_scan(TEXT, TEXT) TO authenticated;
