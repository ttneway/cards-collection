-- Improve login identifier resolution messages and make name login case-insensitive.

CREATE OR REPLACE FUNCTION public.resolve_login_identifier(p_identifier TEXT, p_mode TEXT)
RETURNS TABLE(email TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_identifier TEXT := trim(coalesce(p_identifier, ''));
  v_mode TEXT := trim(coalesce(p_mode, ''));
  v_match_count INTEGER;
BEGIN
  IF v_identifier = '' THEN
    RAISE EXCEPTION '請輸入登入資訊。';
  END IF;

  IF v_mode NOT IN ('name', 'scan_code') THEN
    RAISE EXCEPTION '不支援這種登入方式。';
  END IF;

  IF v_mode = 'name' THEN
    SELECT count(*)
    INTO v_match_count
    FROM public.profiles
    WHERE lower(trim(name)) = lower(v_identifier);

    IF v_match_count = 0 THEN
      RAISE EXCEPTION '找不到這個姓名對應的帳號。';
    ELSIF v_match_count > 1 THEN
      RAISE EXCEPTION '這個姓名有重複帳號，請改用 Email 登入。';
    END IF;

    RETURN QUERY
    SELECT p.email
    FROM public.profiles p
    WHERE lower(trim(p.name)) = lower(v_identifier)
    LIMIT 1;
    RETURN;
  END IF;

  SELECT count(*)
  INTO v_match_count
  FROM public.profiles
  WHERE scan_code = v_identifier;

  IF v_match_count = 0 THEN
    RAISE EXCEPTION '找不到這個身分條碼對應的帳號。';
  ELSIF v_match_count > 1 THEN
    RAISE EXCEPTION '這個身分條碼資料異常，請聯絡管理者。';
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
