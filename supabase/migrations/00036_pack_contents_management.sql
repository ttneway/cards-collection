DROP POLICY IF EXISTS pack_contents_manage_teacher ON public.pack_contents;
CREATE POLICY pack_contents_manage_teacher ON public.pack_contents FOR ALL
  USING (public.current_user_role() IN ('teacher', 'admin'))
  WITH CHECK (public.current_user_role() IN ('teacher', 'admin'));
