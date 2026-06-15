-- Teacher student management and stricter leader class checks.

DROP POLICY IF EXISTS profiles_update_teacher ON profiles;
CREATE POLICY profiles_update_teacher ON profiles FOR UPDATE
  USING (public.current_user_role() = 'teacher')
  WITH CHECK (public.current_user_role() = 'teacher');

CREATE OR REPLACE FUNCTION public.reset_profile_scan_code(p_profile_id UUID)
RETURNS TABLE(profile_id UUID, scan_code TEXT)
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_code TEXT;
BEGIN
  IF public.current_user_role() <> 'teacher' THEN
    RAISE EXCEPTION '只有教師可以重設身分條碼';
  END IF;

  v_new_code := public.generate_scan_code('USR');

  UPDATE profiles
  SET scan_code = v_new_code
  WHERE id = p_profile_id
  RETURNING id, profiles.scan_code INTO profile_id, scan_code;

  IF profile_id IS NULL THEN
    RAISE EXCEPTION '找不到使用者';
  END IF;

  RETURN NEXT;
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
  SELECT * INTO v_actor FROM profiles WHERE id = auth.uid();
  IF v_actor.id IS NULL OR v_actor.role NOT IN ('teacher', 'leader') THEN
    RAISE EXCEPTION '沒有開關任務的權限';
  END IF;
  IF v_actor.role = 'leader' AND v_actor.class_id IS NULL THEN
    RAISE EXCEPTION '尚未指派班級，無法開啟任務';
  END IF;

  SELECT * INTO v_task FROM tasks WHERE task_code = trim(p_task_code) AND is_active = true;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION '找不到可用任務條碼';
  END IF;

  IF v_actor.role = 'leader' AND v_task.class_id IS NOT NULL AND v_actor.class_id IS DISTINCT FROM v_task.class_id THEN
    RAISE EXCEPTION '只能開啟自己班級的任務';
  END IF;

  SELECT * INTO v_session
  FROM task_sessions
  WHERE actor_id = v_actor.id AND task_id = v_task.id AND is_active = true
  ORDER BY opened_at DESC
  LIMIT 1;

  IF v_session.id IS NOT NULL THEN
    UPDATE task_sessions
    SET is_active = false, closed_at = NOW()
    WHERE id = v_session.id;

    RETURN QUERY SELECT 'closed', v_session.id, v_task.id, v_task.title, '已關閉任務：' || v_task.title;
    RETURN;
  END IF;

  UPDATE task_sessions
  SET is_active = false, closed_at = NOW()
  WHERE actor_id = v_actor.id AND is_active = true;

  INSERT INTO task_sessions (task_id, actor_id)
  VALUES (v_task.id, v_actor.id)
  RETURNING * INTO v_session;

  RETURN QUERY SELECT 'opened', v_session.id, v_task.id, v_task.title, '已開啟任務：' || v_task.title;
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
  v_student profiles%ROWTYPE;
  v_session task_sessions%ROWTYPE;
  v_task tasks%ROWTYPE;
  v_period_key TEXT;
  v_claim_count INTEGER;
  v_completion_id UUID;
BEGIN
  SELECT * INTO v_actor FROM profiles WHERE id = auth.uid();
  IF v_actor.id IS NULL OR v_actor.role NOT IN ('teacher', 'leader') THEN
    RAISE EXCEPTION '沒有核發任務點數的權限';
  END IF;
  IF v_actor.role = 'leader' AND v_actor.class_id IS NULL THEN
    RAISE EXCEPTION '尚未指派班級，無法核發點數';
  END IF;

  SELECT * INTO v_session FROM task_sessions WHERE id = p_session_id AND is_active = true;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION '目前沒有開啟中的任務';
  END IF;
  IF v_session.actor_id <> v_actor.id AND v_actor.role <> 'teacher' THEN
    RAISE EXCEPTION '只能使用自己開啟的任務工作階段';
  END IF;

  SELECT * INTO v_task FROM tasks WHERE id = v_session.task_id AND is_active = true;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION '任務已停用';
  END IF;

  SELECT * INTO v_student FROM profiles WHERE scan_code = trim(p_student_scan_code);
  IF v_student.id IS NULL THEN
    RAISE EXCEPTION '找不到學生身分碼';
  END IF;
  IF v_student.role = 'teacher' THEN
    RAISE EXCEPTION '教師身分碼不能領取學生任務點數';
  END IF;
  IF v_actor.role = 'leader' AND v_actor.class_id IS DISTINCT FROM v_student.class_id THEN
    RAISE EXCEPTION '只能核發給同班學生';
  END IF;

  v_period_key := public.period_key_for_task(v_task.recurrence_type, NOW(), v_task.custom_reset_days);

  SELECT count(*) INTO v_claim_count
  FROM task_completions
  WHERE task_id = v_task.id
    AND user_id = v_student.id
    AND status = 'approved'
    AND coalesce(period_key, 'once') = v_period_key;

  IF v_claim_count >= greatest(v_task.per_period_limit, 1) THEN
    RAISE EXCEPTION '已達本週期領取上限';
  END IF;

  INSERT INTO task_completions (task_id, user_id, status, approved_by, awarded_by, session_id, period_key)
  VALUES (v_task.id, v_student.id, 'approved', v_actor.id, v_actor.id, v_session.id, v_period_key)
  RETURNING id INTO v_completion_id;

  UPDATE profiles SET stars = stars + v_task.points WHERE id = v_student.id;

  INSERT INTO transactions (user_id, type, amount, description, related_id)
  VALUES (v_student.id, 'earn', v_task.points, '掃碼任務獎勵：' || v_task.title, v_task.id);

  RETURN QUERY SELECT v_completion_id, v_student.id, v_student.name, v_task.title, v_task.points, v_period_key,
    v_student.name || ' 已完成「' || v_task.title || '」，獲得 ' || v_task.points || ' 點';
END;
$$;
