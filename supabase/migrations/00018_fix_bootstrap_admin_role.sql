-- Fix ambiguous output-column references inside bootstrap_admin_role().

CREATE OR REPLACE FUNCTION public.bootstrap_admin_role()
RETURNS TABLE(profile_id UUID, role TEXT, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_admin_count INTEGER;
BEGIN
  SELECT *
  INTO v_actor
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_actor.id IS NULL THEN
    RAISE EXCEPTION '請先登入';
  END IF;

  IF v_actor.role <> 'teacher' THEN
    RAISE EXCEPTION '只有教師可以啟用第一位管理者';
  END IF;

  SELECT count(*)
  INTO v_admin_count
  FROM public.profiles p
  WHERE p.role = 'admin';

  IF v_admin_count > 0 THEN
    RAISE EXCEPTION '系統中已經有管理者';
  END IF;

  UPDATE public.profiles p
  SET role = 'admin'
  WHERE p.id = v_actor.id;

  RETURN QUERY
  SELECT v_actor.id, 'admin'::TEXT, '你已成為第一位管理者';
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_admin_role() TO authenticated;
