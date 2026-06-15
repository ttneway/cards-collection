-- Prevent teachers from accidentally removing their own teacher access.

CREATE OR REPLACE FUNCTION public.prevent_teacher_self_demotion()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
    AND OLD.id = auth.uid()
    AND OLD.role = 'teacher'
    AND NEW.role <> 'teacher'
  THEN
    RAISE EXCEPTION '不能把目前登入的教師帳號改成非教師，請由另一位教師調整。';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_teacher_self_demotion_trigger ON public.profiles;
CREATE TRIGGER prevent_teacher_self_demotion_trigger
BEFORE UPDATE OF role ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_teacher_self_demotion();
