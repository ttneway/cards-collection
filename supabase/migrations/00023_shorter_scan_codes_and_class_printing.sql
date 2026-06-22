ALTER TABLE public.student_rosters
  ADD COLUMN IF NOT EXISTS seat_no INTEGER;

CREATE OR REPLACE FUNCTION public.generate_scan_code(p_prefix TEXT DEFAULT 'SCN')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_bytes BYTEA;
  v_prefix TEXT;
BEGIN
  v_prefix := left(regexp_replace(upper(coalesce(p_prefix, 'SCN')), '[^A-Z0-9]', '', 'g'), 3);
  IF v_prefix = '' THEN
    v_prefix := 'SCN';
  ELSIF v_prefix = 'TASK' THEN
    v_prefix := 'TSK';
  END IF;

  BEGIN
    v_bytes := extensions.gen_random_bytes(5);
  EXCEPTION
    WHEN undefined_function OR invalid_schema_name THEN
      BEGIN
        v_bytes := gen_random_bytes(5);
      EXCEPTION
        WHEN undefined_function THEN
          RETURN v_prefix || upper(substr(md5(random()::text || clock_timestamp()::text || txid_current()::text), 1, 10));
      END;
  END;

  RETURN v_prefix || upper(substr(encode(v_bytes, 'hex'), 1, 10));
END;
$$;

ALTER TABLE public.profiles
  ALTER COLUMN scan_code SET DEFAULT public.generate_scan_code('USR');

ALTER TABLE public.student_rosters
  ALTER COLUMN scan_code SET DEFAULT public.generate_scan_code('STU');

UPDATE public.profiles
SET scan_code = public.generate_scan_code('USR');

UPDATE public.student_rosters
SET scan_code = public.generate_scan_code('STU');

UPDATE public.tasks
SET task_code = public.generate_scan_code('TSK')
WHERE task_code IS NOT NULL;

INSERT INTO public.scan_codes (code, code_type, action, label, is_active)
VALUES ('FNCTASK01', 'function', 'create_task', '建立任務', true)
ON CONFLICT (code) DO UPDATE
SET action = EXCLUDED.action,
    label = EXCLUDED.label,
    is_active = true;
