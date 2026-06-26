ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS allowed_opener_roles TEXT[] NOT NULL DEFAULT ARRAY['leader', 'teacher'];

CREATE OR REPLACE FUNCTION public.normalize_task_opener_roles(p_roles TEXT[])
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  WITH normalized AS (
    SELECT DISTINCT lower(trim(role_value)) AS role_value
    FROM unnest(coalesce(p_roles, ARRAY['leader', 'teacher'])) AS role_value
    WHERE lower(trim(role_value)) IN ('leader', 'teacher')
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM normalized) THEN
      ARRAY(
        SELECT role_value
        FROM normalized
        ORDER BY CASE role_value WHEN 'leader' THEN 1 WHEN 'teacher' THEN 2 ELSE 9 END
      )
    ELSE ARRAY['leader', 'teacher']
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_valid_task_opener_roles(p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_roles IS NOT NULL
    AND coalesce(array_length(p_roles, 1), 0) >= 1
    AND public.normalize_task_opener_roles(p_roles) = p_roles;
$$;

UPDATE public.tasks
SET allowed_opener_roles = public.normalize_task_opener_roles(allowed_opener_roles)
WHERE allowed_opener_roles IS NULL
   OR allowed_opener_roles <> public.normalize_task_opener_roles(allowed_opener_roles);

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_allowed_opener_roles_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_allowed_opener_roles_check
  CHECK (public.is_valid_task_opener_roles(allowed_opener_roles));

CREATE OR REPLACE FUNCTION public.task_operator_role_allowed(
  p_allowed_roles TEXT[],
  p_role TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(trim(coalesce(p_role, ''))) = 'admin' THEN true
    ELSE lower(trim(coalesce(p_role, ''))) = ANY(public.normalize_task_opener_roles(p_allowed_roles))
  END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_task_session_by_scan(
  p_task_code TEXT,
  p_operator_scan_code TEXT
)
RETURNS TABLE(
  action TEXT,
  session_id UUID,
  task_id UUID,
  task_title TEXT,
  operator_id UUID,
  operator_name TEXT,
  operator_role TEXT,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operator public.profiles%ROWTYPE;
  v_task public.tasks%ROWTYPE;
  v_session public.task_sessions%ROWTYPE;
  v_task_code TEXT := upper(trim(coalesce(p_task_code, '')));
  v_operator_code TEXT := upper(trim(coalesce(p_operator_scan_code, '')));
BEGIN
  IF v_task_code = '' THEN
    RAISE EXCEPTION '請先掃描任務條碼。';
  END IF;

  IF v_operator_code = '' THEN
    RAISE EXCEPTION '請掃描操作者身分條碼。';
  END IF;

  SELECT *
  INTO v_operator
  FROM public.profiles p
  WHERE upper(p.scan_code) = v_operator_code;

  IF v_operator.id IS NULL THEN
    RAISE EXCEPTION '找不到操作者身分條碼。';
  END IF;

  IF v_operator.role NOT IN ('leader', 'teacher', 'admin') THEN
    RAISE EXCEPTION '只有幹部、教師或管理者可以開啟任務。';
  END IF;

  IF v_operator.role = 'leader' AND v_operator.class_id IS NULL THEN
    RAISE EXCEPTION '此幹部帳號尚未綁定班級，無法開啟任務。';
  END IF;

  SELECT *
  INTO v_task
  FROM public.tasks t
  WHERE upper(t.task_code) = v_task_code
    AND t.is_active = true;

  IF v_task.id IS NULL THEN
    RAISE EXCEPTION '找不到可啟用的任務條碼。';
  END IF;

  IF coalesce(v_task.allow_scanner, false) = false THEN
    RAISE EXCEPTION '此任務未開放掃描完成。';
  END IF;

  IF NOT public.task_operator_role_allowed(v_task.allowed_opener_roles, v_operator.role) THEN
    RAISE EXCEPTION '此任務不允許 % 開啟或關閉。', v_operator.role;
  END IF;

  IF v_operator.role = 'leader'
     AND NOT public.task_applies_to_class(v_task.id, v_operator.class_id) THEN
    RAISE EXCEPTION '幹部只能開啟自己班級可執行的任務。';
  END IF;

  SELECT ts.*
  INTO v_session
  FROM public.task_sessions ts
  WHERE ts.task_id = v_task.id
    AND ts.is_active = true
  ORDER BY ts.opened_at DESC
  LIMIT 1;

  IF v_session.id IS NOT NULL THEN
    UPDATE public.task_sessions ts
    SET is_active = false,
        closed_at = now()
    WHERE ts.id = v_session.id;

    RETURN QUERY
    SELECT
      'closed'::TEXT,
      v_session.id,
      v_task.id,
      v_task.title,
      v_operator.id,
      v_operator.name,
      v_operator.role,
      v_operator.name || ' 已關閉任務：' || v_task.title;
    RETURN;
  END IF;

  INSERT INTO public.task_sessions (task_id, actor_id)
  VALUES (v_task.id, v_operator.id)
  RETURNING * INTO v_session;

  RETURN QUERY
  SELECT
    'opened'::TEXT,
    v_session.id,
    v_task.id,
    v_task.title,
    v_operator.id,
    v_operator.name,
    v_operator.role,
    v_operator.name || ' 已開啟任務：' || v_task.title;
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
    RAISE EXCEPTION '只有教師、幹部或管理者可以切換任務工作階段。';
  END IF;
  IF v_actor.role = 'leader' AND v_actor.class_id IS NULL THEN
    RAISE EXCEPTION '此幹部帳號尚未綁定班級。';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE task_code = trim(p_task_code) AND is_active = true;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION '找不到可啟用的任務條碼。';
  END IF;

  IF NOT public.task_operator_role_allowed(v_task.allowed_opener_roles, v_actor.role) THEN
    RAISE EXCEPTION '此任務不允許 % 開啟或關閉。', v_actor.role;
  END IF;

  IF v_actor.role = 'leader' AND NOT public.task_applies_to_class(v_task.id, v_actor.class_id) THEN
    RAISE EXCEPTION '幹部只能開啟自己班級可執行的任務。';
  END IF;

  SELECT *
  INTO v_session
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
