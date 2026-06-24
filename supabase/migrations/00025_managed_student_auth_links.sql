ALTER TABLE public.student_rosters
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS student_rosters_auth_user_id_key
  ON public.student_rosters(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_student_roster_to_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.auth_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.profiles
  SET
    name = NEW.name,
    email = COALESCE(NULLIF(trim(NEW.email), ''), public.profiles.email),
    student_id = NEW.student_no,
    role = NEW.role,
    title = NEW.title,
    class_id = NEW.class_id,
    scan_code = NEW.scan_code
  WHERE id = NEW.auth_user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_student_roster_to_profile_trigger ON public.student_rosters;
CREATE TRIGGER sync_student_roster_to_profile_trigger
AFTER INSERT OR UPDATE OF auth_user_id, name, student_no, email, role, title, class_id, scan_code
ON public.student_rosters
FOR EACH ROW
EXECUTE FUNCTION public.sync_student_roster_to_profile();
