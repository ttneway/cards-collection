-- Add admin as the highest-privilege role and grant management access.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('student', 'leader', 'teacher', 'admin'));

DROP POLICY IF EXISTS profiles_read_own ON public.profiles;
CREATE POLICY profiles_read_own ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS profiles_update_teacher ON public.profiles;
CREATE POLICY profiles_update_teacher ON public.profiles FOR UPDATE
  USING (public.current_user_role() IN ('teacher', 'admin'))
  WITH CHECK (public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS tasks_manage_staff ON public.tasks;
CREATE POLICY tasks_manage_staff ON public.tasks FOR ALL
  USING (public.current_user_role() IN ('teacher', 'leader', 'admin'))
  WITH CHECK (
    public.current_user_role() IN ('teacher', 'admin')
    OR (
      public.current_user_role() = 'leader'
      AND class_id IS NOT DISTINCT FROM public.current_user_class_id()
    )
  );

DROP POLICY IF EXISTS task_sessions_staff_select ON public.task_sessions;
CREATE POLICY task_sessions_staff_select ON public.task_sessions FOR SELECT
  USING (actor_id = auth.uid() OR public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS scan_codes_staff_select ON public.scan_codes;
CREATE POLICY scan_codes_staff_select ON public.scan_codes FOR SELECT
  USING (is_active = true AND public.current_user_role() IN ('teacher', 'leader', 'admin'));

DROP POLICY IF EXISTS student_rosters_select_staff ON public.student_rosters;
CREATE POLICY student_rosters_select_staff ON public.student_rosters FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR public.current_user_role() = 'teacher'
    OR (
      public.current_user_role() = 'leader'
      AND class_id = public.current_user_class_id()
    )
  );

DROP POLICY IF EXISTS student_rosters_manage_teacher ON public.student_rosters;
CREATE POLICY student_rosters_manage_teacher ON public.student_rosters FOR ALL
  USING (public.current_user_role() IN ('teacher', 'admin'))
  WITH CHECK (public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS classes_select_teacher ON public.classes;
CREATE POLICY classes_select_teacher ON public.classes FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR public.current_user_role() = 'teacher'
    OR id = public.current_user_class_id()
  );

DROP POLICY IF EXISTS classes_manage_teacher ON public.classes;
CREATE POLICY classes_manage_teacher ON public.classes FOR ALL
  USING (public.current_user_role() IN ('teacher', 'admin'))
  WITH CHECK (public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS class_leaders_select ON public.class_leaders;
CREATE POLICY class_leaders_select ON public.class_leaders FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.class_id = class_leaders.class_id OR p.role = 'teacher')
    )
  );

DROP POLICY IF EXISTS class_leaders_manage_teacher ON public.class_leaders;
CREATE POLICY class_leaders_manage_teacher ON public.class_leaders FOR ALL
  USING (public.current_user_role() IN ('teacher', 'admin'))
  WITH CHECK (public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS achievements_manage_teacher ON public.achievements;
CREATE POLICY achievements_manage_teacher ON public.achievements FOR ALL
  USING (public.current_user_role() IN ('teacher', 'admin'))
  WITH CHECK (public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS card_packs_manage_teacher ON public.card_packs;
CREATE POLICY card_packs_manage_teacher ON public.card_packs FOR ALL
  USING (public.current_user_role() IN ('teacher', 'admin'))
  WITH CHECK (public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS cards_manage_teacher ON public.cards;
CREATE POLICY cards_manage_teacher ON public.cards FOR ALL
  USING (public.current_user_role() IN ('teacher', 'admin'))
  WITH CHECK (public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS task_completions_select ON public.task_completions;
CREATE POLICY task_completions_select ON public.task_completions FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.current_user_role() IN ('teacher', 'admin', 'leader')
  );

DROP POLICY IF EXISTS task_completions_update_leader ON public.task_completions;
CREATE POLICY task_completions_update_leader ON public.task_completions FOR UPDATE
  USING (public.current_user_role() IN ('teacher', 'admin', 'leader'));

DROP POLICY IF EXISTS trades_select_related ON public.trades;
CREATE POLICY trades_select_related ON public.trades FOR SELECT
  USING (
    auth.uid() = from_user_id
    OR auth.uid() = to_user_id
    OR public.current_user_role() IN ('teacher', 'admin')
  );

CREATE OR REPLACE FUNCTION public.prevent_teacher_self_demotion()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
    AND OLD.id = auth.uid()
    AND OLD.role IN ('teacher', 'admin')
    AND NEW.role <> OLD.role
  THEN
    RAISE EXCEPTION '不能在這裡移除自己的高權限角色，請由其他管理者協助處理';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_profile_scan_code(p_profile_id UUID)
RETURNS TABLE(profile_id UUID, scan_code TEXT)
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_code TEXT;
BEGIN
  IF public.current_user_role() NOT IN ('teacher', 'admin') THEN
    RAISE EXCEPTION '只有教師或管理者可以重設身分條碼';
  END IF;

  v_new_code := public.generate_scan_code('USR');

  UPDATE public.profiles
  SET scan_code = v_new_code
  WHERE id = p_profile_id
  RETURNING id, profiles.scan_code INTO profile_id, scan_code;

  IF profile_id IS NULL THEN
    RAISE EXCEPTION '找不到指定帳號';
  END IF;

  RETURN NEXT;
END;
$$;

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
  SELECT * INTO v_actor
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
  FROM public.profiles
  WHERE role = 'admin';

  IF v_admin_count > 0 THEN
    RAISE EXCEPTION '系統中已經有管理者';
  END IF;

  UPDATE public.profiles
  SET role = 'admin'
  WHERE id = v_actor.id
  RETURNING id, profiles.role INTO profile_id, role;

  RETURN QUERY
  SELECT profile_id, role, '你已成為第一位管理者';
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_admin_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.toggle_task_session(p_task_code TEXT)
RETURNS TABLE(action TEXT, session_id UUID, task_id UUID, task_title TEXT, message TEXT)
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor profiles%ROWTYPE;
  v_task tasks%ROWTYPE;
  v_session task_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF v_actor.id IS NULL OR v_actor.role NOT IN ('teacher', 'leader', 'admin') THEN
    RAISE EXCEPTION '只有教師、幹部或管理者可以開關任務';
  END IF;
  IF v_actor.role = 'leader' AND v_actor.class_id IS NULL THEN
    RAISE EXCEPTION '幹部尚未綁定班級';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE task_code = trim(p_task_code) AND is_active = true;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION '找不到已啟用的任務';
  END IF;

  IF v_actor.role = 'leader' AND v_task.class_id IS NOT NULL AND v_actor.class_id IS DISTINCT FROM v_task.class_id THEN
    RAISE EXCEPTION '幹部只能開啟自己班級的任務';
  END IF;

  SELECT * INTO v_session
  FROM public.task_sessions
  WHERE actor_id = v_actor.id AND task_id = v_task.id AND is_active = true
  ORDER BY opened_at DESC
  LIMIT 1;

  IF v_session.id IS NOT NULL THEN
    UPDATE public.task_sessions
    SET is_active = false, closed_at = NOW()
    WHERE id = v_session.id;

    RETURN QUERY SELECT 'closed', v_session.id, v_task.id, v_task.title, '已關閉任務：' || v_task.title;
    RETURN;
  END IF;

  UPDATE public.task_sessions
  SET is_active = false, closed_at = NOW()
  WHERE actor_id = v_actor.id AND is_active = true;

  INSERT INTO public.task_sessions (task_id, actor_id)
  VALUES (v_task.id, v_actor.id)
  RETURNING * INTO v_session;

  RETURN QUERY SELECT 'opened', v_session.id, v_task.id, v_task.title, '已開啟任務：' || v_task.title;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_scan_code(p_code TEXT)
RETURNS TABLE(code_type TEXT, target_id UUID, label TEXT, action TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_roster public.student_rosters%ROWTYPE;
  v_task public.tasks%ROWTYPE;
  v_function public.scan_codes%ROWTYPE;
BEGIN
  IF public.current_user_role() NOT IN ('teacher', 'leader', 'admin') THEN
    RAISE EXCEPTION '只有教師、幹部或管理者可以使用掃碼工作站';
  END IF;

  SELECT * INTO v_task
  FROM public.tasks
  WHERE task_code = trim(p_code)
    AND is_active = true;

  IF v_task.id IS NOT NULL THEN
    RETURN QUERY SELECT 'task', v_task.id, v_task.title, NULL::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE scan_code = trim(p_code);

  IF v_profile.id IS NOT NULL THEN
    RETURN QUERY SELECT 'student', v_profile.id, v_profile.name, NULL::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_roster
  FROM public.student_rosters
  WHERE scan_code = trim(p_code);

  IF v_roster.id IS NOT NULL THEN
    RETURN QUERY SELECT 'student', v_roster.id, v_roster.name, NULL::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_function
  FROM public.scan_codes
  WHERE code = trim(p_code)
    AND is_active = true;

  IF v_function.id IS NOT NULL THEN
    RETURN QUERY SELECT 'function', v_function.id, v_function.label, v_function.action;
    RETURN;
  END IF;

  RAISE EXCEPTION '找不到可辨識的掃描碼';
END;
$$;

CREATE OR REPLACE FUNCTION public.award_task_by_scan(p_session_id UUID, p_student_scan_code TEXT)
RETURNS TABLE(completion_id UUID, student_id UUID, student_name TEXT, task_title TEXT, points_awarded INTEGER, period_key TEXT, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor profiles%ROWTYPE;
  v_profile profiles%ROWTYPE;
  v_roster student_rosters%ROWTYPE;
  v_session task_sessions%ROWTYPE;
  v_task tasks%ROWTYPE;
  v_period_key TEXT;
  v_claim_count INTEGER;
  v_completion_id UUID;
  v_latest_completed_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF v_actor.id IS NULL OR v_actor.role NOT IN ('teacher', 'leader', 'admin') THEN
    RAISE EXCEPTION '只有教師、幹部或管理者可以使用掃碼發點';
  END IF;

  IF v_actor.role = 'leader' AND v_actor.class_id IS NULL THEN
    RAISE EXCEPTION '幹部尚未綁定班級';
  END IF;

  SELECT * INTO v_session
  FROM public.task_sessions
  WHERE id = p_session_id
    AND is_active = true;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION '找不到啟用中的任務工作階段';
  END IF;

  IF v_session.actor_id <> v_actor.id AND v_actor.role NOT IN ('teacher', 'admin') THEN
    RAISE EXCEPTION '你不能操作其他人開啟的工作階段';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = v_session.task_id AND is_active = true;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION '找不到可發點的任務';
  END IF;

  PERFORM public.assert_task_completion_method(v_task, 'scanner');
  PERFORM public.assert_task_scan_window(v_task);

  SELECT * INTO v_profile FROM public.profiles WHERE scan_code = trim(p_student_scan_code);
  IF v_profile.id IS NOT NULL THEN
    IF v_profile.role IN ('teacher', 'admin') THEN
      RAISE EXCEPTION '高權限帳號不可用學生掃碼領取';
    END IF;

    IF v_actor.role = 'leader' AND v_actor.class_id IS DISTINCT FROM v_profile.class_id THEN
      RAISE EXCEPTION '幹部只能為同班學生發點';
    END IF;

    v_period_key := public.period_key_for_task(v_task.recurrence_type, NOW(), v_task.custom_reset_days);

    SELECT count(*)
    INTO v_claim_count
    FROM public.task_completions tc
    WHERE tc.task_id = v_task.id
      AND tc.user_id = v_profile.id
      AND tc.status = 'approved'
      AND coalesce(tc.period_key, 'once') = v_period_key;

    IF v_claim_count >= greatest(v_task.per_period_limit, 1) THEN
      RAISE EXCEPTION '本週期已達領取上限';
    END IF;

    SELECT max(tc.completed_at)
    INTO v_latest_completed_at
    FROM public.task_completions tc
    WHERE tc.task_id = v_task.id
      AND tc.user_id = v_profile.id
      AND tc.status = 'approved';

    PERFORM public.assert_task_cooldown(v_latest_completed_at, v_task.claim_cooldown_minutes);

    INSERT INTO public.task_completions (task_id, user_id, status, approved_by, awarded_by, session_id, period_key)
    VALUES (v_task.id, v_profile.id, 'approved', v_actor.id, v_actor.id, v_session.id, v_period_key)
    RETURNING id INTO v_completion_id;

    UPDATE public.profiles
    SET stars = stars + v_task.points
    WHERE id = v_profile.id;

    INSERT INTO public.transactions (user_id, type, amount, description, related_id)
    VALUES (v_profile.id, 'earn', v_task.points, '掃碼領取：' || v_task.title, v_task.id);

    RETURN QUERY
    SELECT
      v_completion_id,
      v_profile.id,
      v_profile.name,
      v_task.title,
      v_task.points,
      v_period_key,
      v_profile.name || ' 已完成 ' || v_task.title || '，獲得 ' || v_task.points || ' 點';
    RETURN;
  END IF;

  SELECT * INTO v_roster FROM public.student_rosters WHERE scan_code = trim(p_student_scan_code);
  IF v_roster.id IS NULL THEN
    RAISE EXCEPTION '找不到對應的學生條碼';
  END IF;

  IF v_actor.role = 'leader' AND v_actor.class_id IS DISTINCT FROM v_roster.class_id THEN
    RAISE EXCEPTION '幹部只能為同班學生發點';
  END IF;

  v_period_key := public.period_key_for_task(v_task.recurrence_type, NOW(), v_task.custom_reset_days);

  SELECT count(*)
  INTO v_claim_count
  FROM public.roster_task_completions rtc
  WHERE rtc.task_id = v_task.id
    AND rtc.roster_student_id = v_roster.id
    AND rtc.status = 'approved'
    AND coalesce(rtc.period_key, 'once') = v_period_key;

  IF v_claim_count >= greatest(v_task.per_period_limit, 1) THEN
    RAISE EXCEPTION '本週期已達領取上限';
  END IF;

  SELECT max(rtc.completed_at)
  INTO v_latest_completed_at
  FROM public.roster_task_completions rtc
  WHERE rtc.task_id = v_task.id
    AND rtc.roster_student_id = v_roster.id
    AND rtc.status = 'approved';

  PERFORM public.assert_task_cooldown(v_latest_completed_at, v_task.claim_cooldown_minutes);

  INSERT INTO public.roster_task_completions (task_id, roster_student_id, status, awarded_by, session_id, period_key)
  VALUES (v_task.id, v_roster.id, 'approved', v_actor.id, v_session.id, v_period_key)
  RETURNING id INTO v_completion_id;

  UPDATE public.student_rosters
  SET points = points + v_task.points
  WHERE id = v_roster.id;

  RETURN QUERY
  SELECT
    v_completion_id,
    v_roster.id,
    v_roster.name,
    v_task.title,
    v_task.points,
    v_period_key,
    v_roster.name || ' 已完成 ' || v_task.title || '，獲得 ' || v_task.points || ' 點';
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_task_by_public_scan(p_task_code TEXT, p_student_scan_code TEXT)
RETURNS TABLE(
  completion_id UUID,
  student_id UUID,
  student_name TEXT,
  task_title TEXT,
  points_awarded INTEGER,
  period_key TEXT,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_roster student_rosters%ROWTYPE;
  v_task tasks%ROWTYPE;
  v_period_key TEXT;
  v_claim_count INTEGER;
  v_completion_id UUID;
  v_latest_completed_at TIMESTAMPTZ;
BEGIN
  SELECT *
  INTO v_task
  FROM public.tasks
  WHERE task_code = trim(p_task_code)
    AND is_active = true;

  IF v_task.id IS NULL THEN
    RAISE EXCEPTION '找不到可領取的任務';
  END IF;

  PERFORM public.assert_task_completion_method(v_task, 'scanner');
  PERFORM public.assert_task_scan_window(v_task);

  SELECT * INTO v_profile FROM public.profiles WHERE scan_code = trim(p_student_scan_code);
  IF v_profile.id IS NOT NULL THEN
    IF v_profile.role IN ('teacher', 'admin') THEN
      RAISE EXCEPTION '高權限帳號不可用學生掃碼領取';
    END IF;

    IF v_task.class_id IS NOT NULL AND v_task.class_id IS DISTINCT FROM v_profile.class_id THEN
      RAISE EXCEPTION '這個任務僅限指定班級領取';
    END IF;

    v_period_key := public.period_key_for_task(v_task.recurrence_type, NOW(), v_task.custom_reset_days);

    SELECT count(*)
    INTO v_claim_count
    FROM public.task_completions tc
    WHERE tc.task_id = v_task.id
      AND tc.user_id = v_profile.id
      AND tc.status IN ('pending', 'approved')
      AND coalesce(tc.period_key, 'once') = v_period_key;

    IF v_claim_count >= greatest(v_task.per_period_limit, 1) THEN
      RAISE EXCEPTION '本週期已達領取上限';
    END IF;

    SELECT max(tc.completed_at)
    INTO v_latest_completed_at
    FROM public.task_completions tc
    WHERE tc.task_id = v_task.id
      AND tc.user_id = v_profile.id
      AND tc.status IN ('pending', 'approved');

    PERFORM public.assert_task_cooldown(v_latest_completed_at, v_task.claim_cooldown_minutes);

    INSERT INTO public.task_completions (task_id, user_id, status, approved_by, awarded_by, session_id, period_key)
    VALUES (v_task.id, v_profile.id, 'approved', NULL, NULL, NULL, v_period_key)
    RETURNING id INTO v_completion_id;

    UPDATE public.profiles
    SET stars = stars + v_task.points
    WHERE id = v_profile.id;

    INSERT INTO public.transactions (user_id, type, amount, description, related_id)
    VALUES (v_profile.id, 'earn', v_task.points, '公開掃碼：' || v_task.title, v_task.id);

    RETURN QUERY
    SELECT
      v_completion_id,
      v_profile.id,
      v_profile.name,
      v_task.title,
      v_task.points,
      v_period_key,
      v_profile.name || ' 已完成 ' || v_task.title || '，獲得 ' || v_task.points || ' 點';
    RETURN;
  END IF;

  SELECT * INTO v_roster FROM public.student_rosters WHERE scan_code = trim(p_student_scan_code);
  IF v_roster.id IS NULL THEN
    RAISE EXCEPTION '找不到對應的學生條碼';
  END IF;

  IF v_task.class_id IS NOT NULL AND v_task.class_id IS DISTINCT FROM v_roster.class_id THEN
    RAISE EXCEPTION '這個任務僅限指定班級領取';
  END IF;

  v_period_key := public.period_key_for_task(v_task.recurrence_type, NOW(), v_task.custom_reset_days);

  SELECT count(*)
  INTO v_claim_count
  FROM public.roster_task_completions rtc
  WHERE rtc.task_id = v_task.id
    AND rtc.roster_student_id = v_roster.id
    AND rtc.status = 'approved'
    AND coalesce(rtc.period_key, 'once') = v_period_key;

  IF v_claim_count >= greatest(v_task.per_period_limit, 1) THEN
    RAISE EXCEPTION '本週期已達領取上限';
  END IF;

  SELECT max(rtc.completed_at)
  INTO v_latest_completed_at
  FROM public.roster_task_completions rtc
  WHERE rtc.task_id = v_task.id
    AND rtc.roster_student_id = v_roster.id
    AND rtc.status = 'approved';

  PERFORM public.assert_task_cooldown(v_latest_completed_at, v_task.claim_cooldown_minutes);

  INSERT INTO public.roster_task_completions (task_id, roster_student_id, status, awarded_by, session_id, period_key)
  VALUES (v_task.id, v_roster.id, 'approved', NULL, NULL, v_period_key)
  RETURNING id INTO v_completion_id;

  UPDATE public.student_rosters
  SET points = points + v_task.points
  WHERE id = v_roster.id;

  RETURN QUERY
  SELECT
    v_completion_id,
    v_roster.id,
    v_roster.name,
    v_task.title,
    v_task.points,
    v_period_key,
    v_roster.name || ' 已完成 ' || v_task.title || '，獲得 ' || v_task.points || ' 點';
END;
$$;
