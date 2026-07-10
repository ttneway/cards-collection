CREATE TABLE IF NOT EXISTS public.remote_ai_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'all' CHECK (target_type IN ('all', 'card', 'equipment', 'profession')),
  workflow_api_json TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS remote_ai_workflows_target_idx
  ON public.remote_ai_workflows (target_type, is_active, sort_order, created_at);

ALTER TABLE public.remote_ai_workflows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.remote_ai_workflows FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_remote_ai_workflows()
RETURNS TABLE (
  id UUID,
  name TEXT,
  target_type TEXT,
  workflow_api_json TEXT,
  is_active BOOLEAN,
  sort_order INTEGER,
  updated_at TIMESTAMPTZ,
  updated_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() NOT IN ('teacher', 'admin') THEN
    RAISE EXCEPTION 'Only teachers or admins can read shared AI workflows.';
  END IF;

  RETURN QUERY
  SELECT
    w.id,
    w.name,
    w.target_type,
    w.workflow_api_json,
    w.is_active,
    w.sort_order,
    w.updated_at,
    w.updated_by
  FROM public.remote_ai_workflows AS w
  ORDER BY w.sort_order ASC, w.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_remote_ai_workflow(
  p_id UUID,
  p_name TEXT,
  p_target_type TEXT,
  p_workflow_api_json TEXT,
  p_is_active BOOLEAN,
  p_sort_order INTEGER
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  target_type TEXT,
  workflow_api_json TEXT,
  is_active BOOLEAN,
  sort_order INTEGER,
  updated_at TIMESTAMPTZ,
  updated_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_type TEXT := CASE
    WHEN COALESCE(NULLIF(trim(p_target_type), ''), 'all') IN ('all', 'card', 'equipment', 'profession')
      THEN COALESCE(NULLIF(trim(p_target_type), ''), 'all')
    ELSE 'all'
  END;
  v_id UUID;
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can update shared AI workflows.';
  END IF;

  IF COALESCE(NULLIF(trim(p_name), ''), '') = '' THEN
    RAISE EXCEPTION 'Workflow name is required.';
  END IF;

  IF COALESCE(NULLIF(trim(p_workflow_api_json), ''), '') = '' THEN
    RAISE EXCEPTION 'Workflow JSON is required.';
  END IF;

  v_id := COALESCE(p_id, gen_random_uuid());

  INSERT INTO public.remote_ai_workflows AS w (
    id,
    name,
    target_type,
    workflow_api_json,
    is_active,
    sort_order,
    created_at,
    updated_at,
    created_by,
    updated_by
  )
  VALUES (
    v_id,
    trim(p_name),
    v_target_type,
    p_workflow_api_json,
    COALESCE(p_is_active, true),
    COALESCE(p_sort_order, 0),
    now(),
    now(),
    auth.uid(),
    auth.uid()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    name = EXCLUDED.name,
    target_type = EXCLUDED.target_type,
    workflow_api_json = EXCLUDED.workflow_api_json,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = auth.uid();

  RETURN QUERY
  SELECT
    w.id,
    w.name,
    w.target_type,
    w.workflow_api_json,
    w.is_active,
    w.sort_order,
    w.updated_at,
    w.updated_by
  FROM public.remote_ai_workflows AS w
  WHERE w.id = v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_remote_ai_workflow(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can delete shared AI workflows.';
  END IF;

  DELETE FROM public.remote_ai_workflows WHERE id = p_id;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_remote_ai_workflows() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_remote_ai_workflow(UUID, TEXT, TEXT, TEXT, BOOLEAN, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_remote_ai_workflow(UUID) TO authenticated;
