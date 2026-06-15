-- Make scan-code generation work on Supabase projects where pgcrypto lives in the extensions schema.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.generate_scan_code(p_prefix TEXT DEFAULT 'SCN')
RETURNS TEXT
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_bytes BYTEA;
  v_fallback TEXT;
BEGIN
  BEGIN
    v_bytes := extensions.gen_random_bytes(12);
  EXCEPTION
    WHEN undefined_function OR invalid_schema_name THEN
      BEGIN
        v_bytes := gen_random_bytes(12);
      EXCEPTION
        WHEN undefined_function THEN
          v_fallback := upper(substr(md5(random()::text || clock_timestamp()::text || txid_current()::text), 1, 24));
          RETURN p_prefix || '_' || v_fallback;
      END;
  END;

  RETURN p_prefix || '_' || upper(encode(v_bytes, 'hex'));
END;
$$;
