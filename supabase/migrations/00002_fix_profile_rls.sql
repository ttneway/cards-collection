-- Fix profile reads used during login/profile bootstrap.
-- The original profiles_read_own policy queried profiles from inside a
-- profiles policy, which can fail with recursive RLS evaluation.

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

DROP POLICY IF EXISTS profiles_read_own ON profiles;

CREATE POLICY profiles_read_own ON profiles FOR SELECT
  USING (auth.uid() = id OR public.current_user_role() = 'teacher');
