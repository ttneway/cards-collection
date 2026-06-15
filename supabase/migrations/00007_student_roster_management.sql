-- Separate student roster records from authenticated user profiles.

CREATE TABLE IF NOT EXISTS public.student_rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  student_no TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'leader')),
  title TEXT,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  scan_code TEXT NOT NULL DEFAULT public.generate_scan_code('STU'),
  points INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(created_by, student_no)
);

CREATE UNIQUE INDEX IF NOT EXISTS student_rosters_scan_code_key ON public.student_rosters(scan_code);
CREATE INDEX IF NOT EXISTS student_rosters_class_id_idx ON public.student_rosters(class_id);

CREATE TABLE IF NOT EXISTS public.roster_task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  roster_student_id UUID NOT NULL REFERENCES public.student_rosters(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  awarded_by UUID REFERENCES public.profiles(id),
  session_id UUID REFERENCES public.task_sessions(id),
  period_key TEXT,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'rejected')),
  UNIQUE(task_id, roster_student_id, period_key, completed_at)
);

CREATE INDEX IF NOT EXISTS roster_task_completions_task_id_idx ON public.roster_task_completions(task_id);
CREATE INDEX IF NOT EXISTS roster_task_completions_student_id_idx ON public.roster_task_completions(roster_student_id);

ALTER TABLE public.student_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_task_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_rosters_select_staff ON public.student_rosters;
CREATE POLICY student_rosters_select_staff ON public.student_rosters FOR SELECT
  USING (
    public.current_user_role() = 'teacher'
    OR (
      public.current_user_role() = 'leader'
      AND class_id = (SELECT class_id FROM public.profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS student_rosters_manage_teacher ON public.student_rosters;
CREATE POLICY student_rosters_manage_teacher ON public.student_rosters FOR ALL
  USING (public.current_user_role() = 'teacher')
  WITH CHECK (public.current_user_role() = 'teacher');

DROP POLICY IF EXISTS roster_task_completions_select_staff ON public.roster_task_completions;
CREATE POLICY roster_task_completions_select_staff ON public.roster_task_completions FOR SELECT
  USING (public.current_user_role() IN ('teacher', 'leader'));

CREATE OR REPLACE FUNCTION public.resolve_scan_code(p_code TEXT)
RETURNS TABLE(code_type TEXT, target_id UUID, label TEXT, action TEXT)
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() NOT IN ('teacher', 'leader') THEN
    RAISE EXCEPTION '沒有掃碼權限';
  END IF;

  RETURN QUERY
  SELECT 'function', sc.id, sc.label, sc.action
  FROM scan_codes sc
  WHERE sc.code = trim(p_code) AND sc.is_active = true
  LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT 'task', t.id, t.title, NULL::TEXT
  FROM tasks t
  WHERE t.task_code = trim(p_code) AND t.is_active = true
  LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT 'student', p.id, p.name, 'profile'::TEXT
  FROM profiles p
  WHERE p.scan_code = trim(p_code)
  LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT 'student', sr.id, sr.name, 'roster'::TEXT
  FROM student_rosters sr
  WHERE sr.scan_code = trim(p_code)
  LIMIT 1;
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
