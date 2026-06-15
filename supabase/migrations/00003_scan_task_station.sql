-- Task scan station v1: secure scan codes, recurring task limits, sessions, and RPCs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.generate_scan_code(p_prefix TEXT DEFAULT 'SCN')
RETURNS TEXT
LANGUAGE SQL
AS $$
  SELECT p_prefix || '_' || upper(encode(gen_random_bytes(12), 'hex'))
$$;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS scan_code TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT;

UPDATE profiles
SET scan_code = public.generate_scan_code('USR')
WHERE scan_code IS NULL;

ALTER TABLE profiles
  ALTER COLUMN scan_code SET DEFAULT public.generate_scan_code('USR'),
  ALTER COLUMN scan_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_scan_code_key ON profiles(scan_code);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recurrence_type TEXT NOT NULL DEFAULT 'once'
    CHECK (recurrence_type IN ('once', 'daily', 'weekly', 'semester', 'custom')),
  ADD COLUMN IF NOT EXISTS custom_reset_days INTEGER,
  ADD COLUMN IF NOT EXISTS per_period_limit INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS code_format TEXT NOT NULL DEFAULT 'code128'
    CHECK (code_format IN ('code128', 'qr', 'both'));

UPDATE tasks
SET task_code = public.generate_scan_code('TASK')
WHERE task_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tasks_task_code_key ON tasks(task_code);

CREATE TABLE IF NOT EXISTS task_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_task_sessions_actor_active ON task_sessions(actor_id, is_active);
CREATE INDEX IF NOT EXISTS idx_task_sessions_task_active ON task_sessions(task_id, is_active);

CREATE TABLE IF NOT EXISTS scan_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  code_type TEXT NOT NULL CHECK (code_type IN ('function')),
  action TEXT NOT NULL,
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO scan_codes (code, code_type, action, label)
VALUES ('FUNC_CREATE_TASK', 'function', 'create_task', '建立任務')
ON CONFLICT (code) DO UPDATE
SET action = EXCLUDED.action,
    label = EXCLUDED.label,
    is_active = true;

ALTER TABLE task_completions
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES task_sessions(id),
  ADD COLUMN IF NOT EXISTS period_key TEXT,
  ADD COLUMN IF NOT EXISTS awarded_by UUID REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_task_completions_task_user_period
  ON task_completions(task_id, user_id, period_key);

ALTER TABLE task_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_codes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_user_class_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT class_id FROM public.profiles WHERE id = auth.uid()
$$;

DROP POLICY IF EXISTS tasks_manage_teacher ON tasks;
DROP POLICY IF EXISTS tasks_manage_staff ON tasks;
CREATE POLICY tasks_manage_staff ON tasks FOR ALL
  USING (public.current_user_role() IN ('teacher', 'leader'))
  WITH CHECK (public.current_user_role() IN ('teacher', 'leader'));

DROP POLICY IF EXISTS task_sessions_staff_select ON task_sessions;
CREATE POLICY task_sessions_staff_select ON task_sessions FOR SELECT
  USING (actor_id = auth.uid() OR public.current_user_role() = 'teacher');

DROP POLICY IF EXISTS scan_codes_staff_select ON scan_codes;
CREATE POLICY scan_codes_staff_select ON scan_codes FOR SELECT
  USING (is_active = true AND public.current_user_role() IN ('teacher', 'leader'));

CREATE OR REPLACE FUNCTION public.period_key_for_task(p_recurrence TEXT, p_completed_at TIMESTAMPTZ, p_custom_days INTEGER)
RETURNS TEXT
LANGUAGE PLPGSQL
AS $$
DECLARE
  v_days INTEGER;
BEGIN
  IF p_recurrence = 'daily' THEN
    RETURN to_char(p_completed_at AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD');
  ELSIF p_recurrence = 'weekly' THEN
    RETURN to_char(p_completed_at AT TIME ZONE 'Asia/Taipei', 'IYYY-"W"IW');
  ELSIF p_recurrence = 'semester' THEN
    IF extract(month FROM p_completed_at AT TIME ZONE 'Asia/Taipei') BETWEEN 2 AND 7 THEN
      RETURN to_char(p_completed_at AT TIME ZONE 'Asia/Taipei', 'YYYY') || '-S2';
    END IF;
    RETURN to_char(p_completed_at AT TIME ZONE 'Asia/Taipei', 'YYYY') || '-S1';
  ELSIF p_recurrence = 'custom' THEN
    v_days := greatest(coalesce(p_custom_days, 1), 1);
    RETURN 'C' || floor(extract(epoch FROM p_completed_at) / (v_days * 86400))::TEXT;
  END IF;

  RETURN 'once';
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_scan_code(p_code TEXT)
RETURNS TABLE(code_type TEXT, target_id UUID, label TEXT, action TEXT)
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() NOT IN ('teacher', 'leader') THEN
    RAISE EXCEPTION '沒有使用掃碼工作站的權限';
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
  SELECT 'student', p.id, p.name, NULL::TEXT
  FROM profiles p
  WHERE p.scan_code = trim(p_code)
  LIMIT 1;
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
