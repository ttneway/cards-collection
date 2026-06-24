CREATE OR REPLACE FUNCTION public.profile_scan_code_prefix(p_role TEXT, p_class_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_role IN ('teacher', 'admin') THEN
    RETURN 'TEA';
  END IF;

  IF p_role IN ('student', 'leader') AND p_class_id IS NOT NULL THEN
    RETURN 'STU';
  END IF;

  RETURN 'USR';
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_scan_code_prefix()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected_prefix TEXT;
  v_current_prefix TEXT;
BEGIN
  v_expected_prefix := public.profile_scan_code_prefix(NEW.role, NEW.class_id);
  v_current_prefix := upper(left(coalesce(NEW.scan_code, ''), 3));

  IF NEW.scan_code IS NULL OR NEW.scan_code = '' OR v_current_prefix <> v_expected_prefix THEN
    NEW.scan_code := public.generate_scan_code(v_expected_prefix);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_scan_code_prefix_trigger ON public.profiles;
CREATE TRIGGER sync_profile_scan_code_prefix_trigger
BEFORE INSERT OR UPDATE OF role, class_id, scan_code
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_scan_code_prefix();

UPDATE public.profiles
SET scan_code = public.generate_scan_code(public.profile_scan_code_prefix(role, class_id))
WHERE scan_code IS NULL
   OR left(scan_code, 3) <> public.profile_scan_code_prefix(role, class_id);

CREATE OR REPLACE FUNCTION public.reset_profile_scan_code(p_profile_id UUID)
RETURNS TABLE(profile_id UUID, scan_code TEXT)
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_code TEXT;
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF public.current_user_role() NOT IN ('teacher', 'admin') THEN
    RAISE EXCEPTION '只有教師或管理者可以重設身分條碼。';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_profile_id;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION '找不到要重設的帳號。';
  END IF;

  v_new_code := public.generate_scan_code(public.profile_scan_code_prefix(v_profile.role, v_profile.class_id));

  UPDATE public.profiles
  SET scan_code = v_new_code
  WHERE id = p_profile_id
  RETURNING id, profiles.scan_code INTO profile_id, scan_code;

  RETURN NEXT;
END;
$$;
