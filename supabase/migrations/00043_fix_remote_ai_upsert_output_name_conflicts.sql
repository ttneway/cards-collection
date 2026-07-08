CREATE OR REPLACE FUNCTION public.upsert_remote_ai_settings(
  p_provider TEXT,
  p_base_url TEXT,
  p_shared_secret TEXT,
  p_workflow_api_json TEXT,
  p_negative_prompt TEXT,
  p_seed_mode TEXT,
  p_fixed_seed BIGINT,
  p_is_enabled BOOLEAN
)
RETURNS TABLE (
  provider TEXT,
  base_url TEXT,
  workflow_api_json TEXT,
  negative_prompt TEXT,
  seed_mode TEXT,
  fixed_seed BIGINT,
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
  v_seed_mode TEXT := CASE WHEN COALESCE(NULLIF(trim(p_seed_mode), ''), 'random') = 'fixed' THEN 'fixed' ELSE 'random' END;
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can update shared AI settings.';
  END IF;

  SELECT s.shared_secret
    INTO v_existing_secret
  FROM public.remote_ai_settings AS s
  WHERE s.provider = v_provider;

  INSERT INTO public.remote_ai_settings AS s (
    "provider",
    "base_url",
    "shared_secret",
    "workflow_api_json",
    "negative_prompt",
    "seed_mode",
    "fixed_seed",
    "is_enabled",
    "updated_at",
    "updated_by"
  )
  VALUES (
    v_provider,
    trim(COALESCE(p_base_url, '')),
    COALESCE(NULLIF(trim(COALESCE(p_shared_secret, '')), ''), v_existing_secret),
    COALESCE(p_workflow_api_json, ''),
    COALESCE(p_negative_prompt, ''),
    v_seed_mode,
    CASE WHEN v_seed_mode = 'fixed' THEN p_fixed_seed ELSE NULL END,
    COALESCE(p_is_enabled, false),
    now(),
    auth.uid()
  )
  ON CONFLICT ("provider") DO UPDATE
  SET
    "base_url" = EXCLUDED.base_url,
    "shared_secret" = COALESCE(NULLIF(trim(COALESCE(p_shared_secret, '')), ''), s.shared_secret),
    "workflow_api_json" = EXCLUDED.workflow_api_json,
    "negative_prompt" = EXCLUDED.negative_prompt,
    "seed_mode" = EXCLUDED.seed_mode,
    "fixed_seed" = EXCLUDED.fixed_seed,
    "is_enabled" = EXCLUDED.is_enabled,
    "updated_at" = now(),
    "updated_by" = auth.uid();

  RETURN QUERY
  SELECT
    s.provider,
    s.base_url,
    s.workflow_api_json,
    s.negative_prompt,
    s.seed_mode,
    s.fixed_seed,
    s.is_enabled,
    (s.shared_secret IS NOT NULL AND length(trim(s.shared_secret)) > 0) AS shared_secret_configured,
    s.updated_at,
    s.updated_by
  FROM public.remote_ai_settings AS s
  WHERE s.provider = v_provider;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_remote_ai_settings(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, BOOLEAN) TO authenticated;
