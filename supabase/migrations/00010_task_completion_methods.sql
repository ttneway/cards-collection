-- Allow teachers to choose how a task can be completed.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS allow_scanner BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_button_claim BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.assert_task_completion_method(p_task public.tasks, p_method TEXT)
RETURNS void
LANGUAGE PLPGSQL
SET search_path = public
AS $$
BEGIN
  IF coalesce(p_method, '') NOT IN ('scanner', 'button') THEN
    RAISE EXCEPTION '未知的任務完成方式';
  END IF;

  IF p_method = 'scanner' AND coalesce(p_task.allow_scanner, true) IS FALSE THEN
    RAISE EXCEPTION '此任務未開放掃描完成';
  END IF;

  IF p_method = 'button' AND coalesce(p_task.allow_button_claim, false) IS FALSE THEN
    RAISE EXCEPTION '此任務未開放登入後按鈕完成';
  END IF;

  IF coalesce(p_task.allow_scanner, true) IS FALSE
    AND coalesce(p_task.allow_button_claim, false) IS FALSE THEN
    RAISE EXCEPTION '此任務尚未設定可用的完成方式';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_task_by_user_action(p_task_id UUID, p_method TEXT)
RETURNS TABLE(completion_id UUID, task_title TEXT, points_awarded INTEGER, period_key TEXT, message TEXT)
LANGUAGE PLPGSQL
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
  SELECT * INTO v_user FROM profiles WHERE id = auth.uid();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION '請先登入後再完成任務';
  END IF;

  SELECT * INTO v_task FROM tasks WHERE id = p_task_id AND is_active = true;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION '找不到可用任務';
  END IF;

  PERFORM public.assert_task_completion_method(v_task, p_method);
  PERFORM public.assert_task_scan_window(v_task);

  v_period_key := public.period_key_for_task(v_task.recurrence_type, NOW(), v_task.custom_reset_days);

  SELECT count(*) INTO v_claim_count
  FROM task_completions
  WHERE task_id = v_task.id
    AND user_id = v_user.id
    AND status IN ('pending', 'approved')
    AND coalesce(period_key, 'once') = v_period_key;

  IF v_claim_count >= greatest(v_task.per_period_limit, 1) THEN
    RAISE EXCEPTION '已達本週期領取上限';
  END IF;

  v_status := CASE WHEN v_task.type = 'approve' THEN 'pending' ELSE 'approved' END;

  INSERT INTO task_completions (task_id, user_id, status, session_id, period_key)
  VALUES (v_task.id, v_user.id, v_status, NULL, v_period_key)
  RETURNING id INTO v_completion_id;

  IF v_status = 'approved' THEN
    UPDATE profiles SET stars = stars + v_task.points WHERE id = v_user.id;
    INSERT INTO transactions (user_id, type, amount, description, related_id)
    VALUES (v_user.id, 'earn', v_task.points, '任務獎勵：' || v_task.title, v_task.id);
    v_points := v_task.points;
  END IF;

  RETURN QUERY SELECT
    v_completion_id,
    v_task.title,
    v_points,
    v_period_key,
    CASE
      WHEN v_status = 'approved' THEN v_user.name || ' 已完成「' || v_task.title || '」，獲得 ' || v_task.points || ' 點'
      ELSE v_user.name || ' 已提交「' || v_task.title || '」，等待審核'
    END;
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

  PERFORM public.assert_task_completion_method(v_task, 'scanner');
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
