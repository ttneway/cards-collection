-- Add optional scan time windows for habit-building tasks such as on-time arrival.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS scan_window_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS window_start_time TIME,
  ADD COLUMN IF NOT EXISTS window_end_time TIME,
  ADD COLUMN IF NOT EXISTS window_timezone TEXT NOT NULL DEFAULT 'Asia/Taipei';

CREATE OR REPLACE FUNCTION public.assert_task_scan_window(p_task public.tasks)
RETURNS void
LANGUAGE PLPGSQL
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_local_time TIME;
  v_timezone TEXT;
BEGIN
  IF p_task.starts_at IS NOT NULL AND v_now < p_task.starts_at THEN
    RAISE EXCEPTION '任務尚未開始';
  END IF;

  IF p_task.ends_at IS NOT NULL AND v_now > p_task.ends_at THEN
    RAISE EXCEPTION '任務已結束';
  END IF;

  IF coalesce(p_task.scan_window_enabled, false) IS FALSE THEN
    RETURN;
  END IF;

  IF p_task.window_start_time IS NULL OR p_task.window_end_time IS NULL THEN
    RAISE EXCEPTION '任務尚未設定完整掃碼時間';
  END IF;

  v_timezone := coalesce(nullif(p_task.window_timezone, ''), 'Asia/Taipei');
  v_local_time := (v_now AT TIME ZONE v_timezone)::TIME;

  IF p_task.window_start_time <= p_task.window_end_time THEN
    IF v_local_time < p_task.window_start_time OR v_local_time > p_task.window_end_time THEN
      RAISE EXCEPTION '目前不在可掃碼時間內，可掃時間為 %-%',
        substr(p_task.window_start_time::TEXT, 1, 5),
        substr(p_task.window_end_time::TEXT, 1, 5);
    END IF;
  ELSE
    IF v_local_time < p_task.window_start_time AND v_local_time > p_task.window_end_time THEN
      RAISE EXCEPTION '目前不在可掃碼時間內，可掃時間為 %-%',
        substr(p_task.window_start_time::TEXT, 1, 5),
        substr(p_task.window_end_time::TEXT, 1, 5);
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_task_by_scan(p_session_id UUID, p_student_scan_code TEXT)
RETURNS TABLE(completion_id UUID, student_id UUID, student_name TEXT, task_title TEXT, points_awarded INTEGER, period_key TEXT, message TEXT)
LANGUAGE PLPGSQL
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
  SELECT * INTO v_actor FROM profiles WHERE id = auth.uid();
  IF v_actor.id IS NULL OR v_actor.role NOT IN ('teacher', 'leader') THEN
    RAISE EXCEPTION '沒有發點權限';
  END IF;
  IF v_actor.role = 'leader' AND v_actor.class_id IS NULL THEN
    RAISE EXCEPTION '幹部尚未設定班級，不能發點';
  END IF;

  SELECT * INTO v_session FROM task_sessions WHERE id = p_session_id AND is_active = true;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION '目前沒有開啟中的任務';
  END IF;
  IF v_session.actor_id <> v_actor.id AND v_actor.role <> 'teacher' THEN
    RAISE EXCEPTION '不能使用其他人的任務工作階段';
  END IF;

  SELECT * INTO v_task FROM tasks WHERE id = v_session.task_id AND is_active = true;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION '任務已關閉';
  END IF;

  PERFORM public.assert_task_scan_window(v_task);

  SELECT * INTO v_profile FROM profiles WHERE scan_code = trim(p_student_scan_code);
  IF v_profile.id IS NOT NULL THEN
    IF v_profile.role = 'teacher' THEN
      RAISE EXCEPTION '教師帳號不能作為學生領點';
    END IF;
    IF v_actor.role = 'leader' AND v_actor.class_id IS DISTINCT FROM v_profile.class_id THEN
      RAISE EXCEPTION '只能對同班學生發點';
    END IF;

    v_period_key := public.period_key_for_task(v_task.recurrence_type, NOW(), v_task.custom_reset_days);
    SELECT count(*) INTO v_claim_count
    FROM task_completions
    WHERE task_id = v_task.id
      AND user_id = v_profile.id
      AND status = 'approved'
      AND coalesce(period_key, 'once') = v_period_key;

    IF v_claim_count >= greatest(v_task.per_period_limit, 1) THEN
      RAISE EXCEPTION '已達本週期領取上限';
    END IF;

    INSERT INTO task_completions (task_id, user_id, status, approved_by, awarded_by, session_id, period_key)
    VALUES (v_task.id, v_profile.id, 'approved', v_actor.id, v_actor.id, v_session.id, v_period_key)
    RETURNING id INTO v_completion_id;

    UPDATE profiles SET stars = stars + v_task.points WHERE id = v_profile.id;
    INSERT INTO transactions (user_id, type, amount, description, related_id)
    VALUES (v_profile.id, 'earn', v_task.points, '掃碼任務獎勵：' || v_task.title, v_task.id);

    RETURN QUERY SELECT v_completion_id, v_profile.id, v_profile.name, v_task.title, v_task.points, v_period_key,
      v_profile.name || ' 已完成「' || v_task.title || '」，獲得 ' || v_task.points || ' 點';
    RETURN;
  END IF;

  SELECT * INTO v_roster FROM student_rosters WHERE scan_code = trim(p_student_scan_code);
  IF v_roster.id IS NULL THEN
    RAISE EXCEPTION '找不到學生條碼';
  END IF;
  IF v_actor.role = 'leader' AND v_actor.class_id IS DISTINCT FROM v_roster.class_id THEN
    RAISE EXCEPTION '只能對同班學生發點';
  END IF;

  v_period_key := public.period_key_for_task(v_task.recurrence_type, NOW(), v_task.custom_reset_days);
  SELECT count(*) INTO v_claim_count
  FROM roster_task_completions
  WHERE task_id = v_task.id
    AND roster_student_id = v_roster.id
    AND status = 'approved'
    AND coalesce(period_key, 'once') = v_period_key;

  IF v_claim_count >= greatest(v_task.per_period_limit, 1) THEN
    RAISE EXCEPTION '已達本週期領取上限';
  END IF;

  INSERT INTO roster_task_completions (task_id, roster_student_id, status, awarded_by, session_id, period_key)
  VALUES (v_task.id, v_roster.id, 'approved', v_actor.id, v_session.id, v_period_key)
  RETURNING id INTO v_completion_id;

  UPDATE student_rosters SET points = points + v_task.points WHERE id = v_roster.id;

  RETURN QUERY SELECT v_completion_id, v_roster.id, v_roster.name, v_task.title, v_task.points, v_period_key,
    v_roster.name || ' 已完成「' || v_task.title || '」，獲得 ' || v_task.points || ' 點';
END;
$$;
