-- Allow a teacher to promote themselves to the first admin while still
-- preventing accidental self-demotion from high-privilege roles.

CREATE OR REPLACE FUNCTION public.prevent_teacher_self_demotion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
    AND OLD.id = auth.uid()
  THEN
    IF OLD.role = 'admin'
      AND NEW.role <> 'admin'
    THEN
      RAISE EXCEPTION '不能在這裡移除自己的管理者角色，請由其他管理者協助處理';
    END IF;

    IF OLD.role = 'teacher'
      AND NEW.role NOT IN ('teacher', 'admin')
    THEN
      RAISE EXCEPTION '不能在這裡移除自己的教師角色，請由其他教師或管理者協助處理';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
