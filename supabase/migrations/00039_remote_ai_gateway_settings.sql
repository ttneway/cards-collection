CREATE TABLE IF NOT EXISTS public.remote_ai_settings (
  provider TEXT PRIMARY KEY CHECK (provider IN ('comfyui_gateway')),
  base_url TEXT NOT NULL DEFAULT '',
  shared_secret TEXT,
  workflow_api_json TEXT NOT NULL DEFAULT '',
  negative_prompt TEXT NOT NULL DEFAULT '',
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.remote_ai_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_remote_ai_settings()
RETURNS TABLE (
  provider TEXT,
  base_url TEXT,
  workflow_api_json TEXT,
  negative_prompt TEXT,
  is_enabled BOOLEAN,
  shared_secret_configured BOOLEAN,
  updated_at TIMESTAMPTZ,
  updated_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() NOT IN ('teacher', 'admin') THEN
    RAISE EXCEPTION '只有教師或管理者可以查看共享生圖設定。';
  END IF;

  RETURN QUERY
  SELECT
    s.provider,
    s.base_url,
    s.workflow_api_json,
    s.negative_prompt,
    s.is_enabled,
    (s.shared_secret IS NOT NULL AND length(trim(s.shared_secret)) > 0) AS shared_secret_configured,
    s.updated_at,
    s.updated_by
  FROM public.remote_ai_settings AS s
  WHERE s.provider = 'comfyui_gateway';

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      'comfyui_gateway'::TEXT,
      ''::TEXT,
      ''::TEXT,
      ''::TEXT,
      false,
      false,
      NULL::TIMESTAMPTZ,
      NULL::UUID;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_remote_ai_settings(
  p_provider TEXT,
  p_base_url TEXT,
  p_shared_secret TEXT,
  p_workflow_api_json TEXT,
  p_negative_prompt TEXT,
  p_is_enabled BOOLEAN
)
RETURNS TABLE (
  provider TEXT,
  base_url TEXT,
  workflow_api_json TEXT,
  negative_prompt TEXT,
  is_enabled BOOLEAN,
  shared_secret_configured BOOLEAN,
  updated_at TIMESTAMPTZ,
  updated_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider TEXT := COALESCE(NULLIF(trim(p_provider), ''), 'comfyui_gateway');
  v_existing_secret TEXT;
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION '只有管理者可以修改共享生圖設定。';
  END IF;

  SELECT shared_secret
    INTO v_existing_secret
  FROM public.remote_ai_settings
  WHERE provider = v_provider;

  INSERT INTO public.remote_ai_settings (
    provider,
    base_url,
    shared_secret,
    workflow_api_json,
    negative_prompt,
    is_enabled,
    updated_at,
    updated_by
  )
  VALUES (
    v_provider,
    trim(COALESCE(p_base_url, '')),
    COALESCE(NULLIF(trim(COALESCE(p_shared_secret, '')), ''), v_existing_secret),
    COALESCE(p_workflow_api_json, ''),
    COALESCE(p_negative_prompt, ''),
    COALESCE(p_is_enabled, false),
    now(),
    auth.uid()
  )
  ON CONFLICT (provider) DO UPDATE
  SET
    base_url = EXCLUDED.base_url,
    shared_secret = COALESCE(NULLIF(trim(COALESCE(p_shared_secret, '')), ''), public.remote_ai_settings.shared_secret),
    workflow_api_json = EXCLUDED.workflow_api_json,
    negative_prompt = EXCLUDED.negative_prompt,
    is_enabled = EXCLUDED.is_enabled,
    updated_at = now(),
    updated_by = auth.uid();

  RETURN QUERY
  SELECT
    s.provider,
    s.base_url,
    s.workflow_api_json,
    s.negative_prompt,
    s.is_enabled,
    (s.shared_secret IS NOT NULL AND length(trim(s.shared_secret)) > 0) AS shared_secret_configured,
    s.updated_at,
    s.updated_by
  FROM public.remote_ai_settings AS s
  WHERE s.provider = v_provider;
END;
$$;

REVOKE ALL ON public.remote_ai_settings FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_remote_ai_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_remote_ai_settings(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
