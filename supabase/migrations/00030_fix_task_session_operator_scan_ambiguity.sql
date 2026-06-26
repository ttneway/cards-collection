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
