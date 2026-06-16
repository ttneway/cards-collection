-- Allow login by display name or scan code by resolving them to the real auth email.

CREATE OR REPLACE FUNCTION public.resolve_login_identifier(p_identifier TEXT, p_mode TEXT)
RETURNS TABLE(email TEXT)
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_identifier TEXT := trim(coalesce(p_identifier, ''));
  v_mode TEXT := trim(coalesce(p_mode, ''));
  v_match_count INTEGER;
BEGIN
  IF v_identifier = '' THEN
    RAISE EXCEPTION '請輸入登入資訊';
  END IF;

  IF v_mode NOT IN ('name', 'scan_code') THEN
    RAISE EXCEPTION '不支援的登入方式';
  END IF;

  IF v_mode = 'name' THEN
    SELECT count(*) INTO v_match_count
    FROM public.profiles
    WHERE trim(name) = v_identifier;

    IF v_match_count = 0 THEN
      RAISE EXCEPTION '找不到對應姓名的帳號';
    ELSIF v_match_count > 1 THEN
      RAISE EXCEPTION '此姓名對應多個帳號，請改用 Email 或身分條碼登入';
    END IF;

    RETURN QUERY
    SELECT p.email
    FROM public.profiles p
    WHERE trim(p.name) = v_identifier
    LIMIT 1;
    RETURN;
  END IF;

  SELECT count(*) INTO v_match_count
  FROM public.profiles
  WHERE scan_code = v_identifier;

  IF v_match_count = 0 THEN
    RAISE EXCEPTION '找不到對應條碼的帳號';
  ELSIF v_match_count > 1 THEN
    RAISE EXCEPTION '此條碼對應多個帳號，請聯絡管理員';
  END IF;

  RETURN QUERY
  SELECT p.email
  FROM public.profiles p
  WHERE p.scan_code = v_identifier
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_identifier(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.resolve_login_identifier(TEXT, TEXT) TO authenticated;
