ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'mixed',
  ADD COLUMN IF NOT EXISTS progress_mode TEXT NOT NULL DEFAULT 'cumulative',
  ADD COLUMN IF NOT EXISTS authoring_mode TEXT NOT NULL DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS claim_mode TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_preset BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.user_achievements
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS points_claimed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS card_claimed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.achievements
  DROP CONSTRAINT IF EXISTS achievements_category_check;
ALTER TABLE public.achievements
  ADD CONSTRAINT achievements_category_check
  CHECK (category IN ('task', 'card', 'points', 'mixed'));

ALTER TABLE public.achievements
  DROP CONSTRAINT IF EXISTS achievements_progress_mode_check;
ALTER TABLE public.achievements
  ADD CONSTRAINT achievements_progress_mode_check
  CHECK (progress_mode IN ('cumulative', 'streak', 'all_complete'));

ALTER TABLE public.achievements
  DROP CONSTRAINT IF EXISTS achievements_authoring_mode_check;
ALTER TABLE public.achievements
  ADD CONSTRAINT achievements_authoring_mode_check
  CHECK (authoring_mode IN ('simple', 'advanced'));

ALTER TABLE public.achievements
  DROP CONSTRAINT IF EXISTS achievements_claim_mode_check;
ALTER TABLE public.achievements
  ADD CONSTRAINT achievements_claim_mode_check
  CHECK (claim_mode IN ('manual'));

CREATE TABLE IF NOT EXISTS public.achievement_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  condition_type TEXT NOT NULL CHECK (
    condition_type IN (
      'tasks_completed_total',
      'tasks_completed_selected',
      'task_streak_any',
      'task_streak_selected',
      'cards_collected_total',
      'series_complete',
      'album_complete',
      'points_earned_total',
      'selected_tasks_all_complete',
      'rarity_collection'
    )
  ),
  target_value INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.achievement_condition_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_id UUID NOT NULL REFERENCES public.achievement_conditions(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(condition_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_achievement_conditions_achievement_id
  ON public.achievement_conditions(achievement_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_achievement_condition_tasks_condition_id
  ON public.achievement_condition_tasks(condition_id);

CREATE INDEX IF NOT EXISTS idx_achievement_condition_tasks_task_id
  ON public.achievement_condition_tasks(task_id);

ALTER TABLE public.achievement_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievement_condition_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS achievement_conditions_select_active ON public.achievement_conditions;
CREATE POLICY achievement_conditions_select_active
ON public.achievement_conditions
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.achievements a
    WHERE a.id = achievement_conditions.achievement_id
      AND (a.is_active = true OR public.current_user_role() IN ('teacher', 'admin'))
  )
);

DROP POLICY IF EXISTS achievement_conditions_manage_staff ON public.achievement_conditions;
CREATE POLICY achievement_conditions_manage_staff
ON public.achievement_conditions
FOR ALL
USING (public.current_user_role() IN ('teacher', 'admin'))
WITH CHECK (public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS achievement_condition_tasks_select_active ON public.achievement_condition_tasks;
CREATE POLICY achievement_condition_tasks_select_active
ON public.achievement_condition_tasks
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.achievement_conditions ac
    JOIN public.achievements a ON a.id = ac.achievement_id
    WHERE ac.id = achievement_condition_tasks.condition_id
      AND (a.is_active = true OR public.current_user_role() IN ('teacher', 'admin'))
  )
);

DROP POLICY IF EXISTS achievement_condition_tasks_manage_staff ON public.achievement_condition_tasks;
CREATE POLICY achievement_condition_tasks_manage_staff
ON public.achievement_condition_tasks
FOR ALL
USING (public.current_user_role() IN ('teacher', 'admin'))
WITH CHECK (public.current_user_role() IN ('teacher', 'admin'));

CREATE OR REPLACE FUNCTION public.get_achievement_condition_task_ids(p_condition_id UUID)
RETURNS UUID[]
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(array_agg(task_id ORDER BY task_id), ARRAY[]::UUID[])
  FROM public.achievement_condition_tasks
  WHERE condition_id = p_condition_id;
$$;

CREATE OR REPLACE FUNCTION public.compute_task_streak_periods(
  p_user_id UUID,
  p_recurrence TEXT,
  p_task_ids UUID[] DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_periods DATE[] := ARRAY[]::DATE[];
  v_cursor DATE;
  v_streak INTEGER := 0;
  v_step INTERVAL;
BEGIN
  IF p_recurrence NOT IN ('daily', 'weekly') THEN
    RETURN 0;
  END IF;

  IF p_task_ids IS NOT NULL AND coalesce(array_length(p_task_ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(array_agg(period_start ORDER BY period_start DESC), ARRAY[]::DATE[])
  INTO v_periods
  FROM (
    SELECT DISTINCT
      CASE
        WHEN p_recurrence = 'daily' THEN (tc.completed_at AT TIME ZONE 'Asia/Taipei')::DATE
        ELSE date_trunc('week', tc.completed_at AT TIME ZONE 'Asia/Taipei')::DATE
      END AS period_start
    FROM public.task_completions tc
    JOIN public.tasks t ON t.id = tc.task_id
    WHERE tc.user_id = p_user_id
      AND tc.status = 'approved'
      AND t.recurrence_type = p_recurrence
      AND (p_task_ids IS NULL OR tc.task_id = ANY(p_task_ids))
  ) periods;

  IF array_length(v_periods, 1) IS NULL THEN
    RETURN 0;
  END IF;

  IF p_recurrence = 'daily' THEN
    v_cursor := (now() AT TIME ZONE 'Asia/Taipei')::DATE;
    v_step := INTERVAL '1 day';
  ELSE
    v_cursor := date_trunc('week', now() AT TIME ZONE 'Asia/Taipei')::DATE;
    v_step := INTERVAL '7 days';
  END IF;

  LOOP
    EXIT WHEN NOT (v_cursor = ANY(v_periods));
    v_streak := v_streak + 1;
    v_cursor := (v_cursor::timestamp - v_step)::DATE;
  END LOOP;

  RETURN v_streak;
END;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_achievement_condition(
  p_user_id UUID,
  p_condition_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_condition public.achievement_conditions%ROWTYPE;
  v_task_ids UUID[] := ARRAY[]::UUID[];
  v_current INTEGER := 0;
  v_target INTEGER := 1;
  v_complete BOOLEAN := false;
  v_label TEXT := '';
  v_series TEXT;
  v_album_id UUID;
  v_album_name TEXT;
  v_rarity TEXT;
  v_recurrence TEXT;
  v_selected_count INTEGER := 0;
BEGIN
  SELECT *
  INTO v_condition
  FROM public.achievement_conditions
  WHERE id = p_condition_id;

  IF v_condition.id IS NULL THEN
    RETURN jsonb_build_object(
      'id', p_condition_id,
      'condition_type', 'unknown',
      'current_value', 0,
      'target_value', 1,
      'complete', false,
      'label', '條件不存在'
    );
  END IF;

  v_task_ids := public.get_achievement_condition_task_ids(v_condition.id);
  v_target := greatest(coalesce(v_condition.target_value, 1), 1);

  CASE v_condition.condition_type
    WHEN 'tasks_completed_total' THEN
      SELECT count(*)
      INTO v_current
      FROM public.task_completions tc
      WHERE tc.user_id = p_user_id
        AND tc.status = 'approved';

      v_complete := v_current >= v_target;
      v_label := format('累積完成 %s / %s 次任務', v_current, v_target);

    WHEN 'tasks_completed_selected' THEN
      SELECT count(*)
      INTO v_current
      FROM public.task_completions tc
      WHERE tc.user_id = p_user_id
        AND tc.status = 'approved'
        AND tc.task_id = ANY(v_task_ids);

      v_complete := v_current >= v_target;
      v_label := format('指定任務累積完成 %s / %s 次', v_current, v_target);

    WHEN 'task_streak_any' THEN
      v_recurrence := coalesce(nullif(v_condition.config_json ->> 'recurrence_type', ''), 'daily');
      v_current := public.compute_task_streak_periods(p_user_id, v_recurrence, NULL);
      v_complete := v_current >= v_target;
      v_label := format('連續%s任務 %s / %s 期', CASE WHEN v_recurrence = 'weekly' THEN '每週' ELSE '每日' END, v_current, v_target);

    WHEN 'task_streak_selected' THEN
      v_recurrence := coalesce(nullif(v_condition.config_json ->> 'recurrence_type', ''), 'daily');
      v_current := public.compute_task_streak_periods(p_user_id, v_recurrence, v_task_ids);
      v_complete := v_current >= v_target;
      v_label := format('指定任務連續%s完成 %s / %s 期', CASE WHEN v_recurrence = 'weekly' THEN '每週' ELSE '每日' END, v_current, v_target);

    WHEN 'cards_collected_total' THEN
      SELECT coalesce(sum(uc.count), 0)
      INTO v_current
      FROM public.user_cards uc
      WHERE uc.user_id = p_user_id;

      v_complete := v_current >= v_target;
      v_label := format('累積收集 %s / %s 張卡牌', v_current, v_target);

    WHEN 'series_complete' THEN
      v_series := nullif(trim(v_condition.config_json ->> 'series'), '');

      SELECT count(*)
      INTO v_target
      FROM public.cards c
      WHERE c.is_active = true
        AND c.series = v_series;

      SELECT count(DISTINCT uc.card_id)
      INTO v_current
      FROM public.user_cards uc
      JOIN public.cards c ON c.id = uc.card_id
      WHERE uc.user_id = p_user_id
        AND uc.count > 0
        AND c.is_active = true
        AND c.series = v_series;

      v_complete := v_target > 0 AND v_current >= v_target;
      v_label := format('系列「%s」收集 %s / %s', coalesce(v_series, '未指定'), v_current, greatest(v_target, 0));

    WHEN 'album_complete' THEN
      v_album_id := nullif(v_condition.config_json ->> 'album_id', '')::UUID;

      SELECT name
      INTO v_album_name
      FROM public.card_albums
      WHERE id = v_album_id;

      SELECT count(*)
      INTO v_target
      FROM public.cards c
      WHERE c.is_active = true
        AND c.album_id = v_album_id;

      SELECT count(DISTINCT uc.card_id)
      INTO v_current
      FROM public.user_cards uc
      JOIN public.cards c ON c.id = uc.card_id
      WHERE uc.user_id = p_user_id
        AND uc.count > 0
        AND c.is_active = true
        AND c.album_id = v_album_id;

      v_complete := v_target > 0 AND v_current >= v_target;
      v_label := format('卡冊「%s」收集 %s / %s', coalesce(v_album_name, '未指定'), v_current, greatest(v_target, 0));

    WHEN 'points_earned_total' THEN
      SELECT coalesce(sum(greatest(amount, 0)), 0)
      INTO v_current
      FROM public.transactions
      WHERE user_id = p_user_id
        AND type = 'earn';

      v_complete := v_current >= v_target;
      v_label := format('累積獲得 %s / %s 星星', v_current, v_target);

    WHEN 'selected_tasks_all_complete' THEN
      v_selected_count := coalesce(array_length(v_task_ids, 1), 0);
      v_target := greatest(v_selected_count, 1);

      SELECT count(DISTINCT tc.task_id)
      INTO v_current
      FROM public.task_completions tc
      WHERE tc.user_id = p_user_id
        AND tc.status = 'approved'
        AND tc.task_id = ANY(v_task_ids);

      v_complete := v_selected_count > 0 AND v_current >= v_selected_count;
      v_label := format('指定任務全部完成 %s / %s', v_current, v_selected_count);

    WHEN 'rarity_collection' THEN
      v_rarity := nullif(v_condition.config_json ->> 'rarity', '');

      SELECT count(DISTINCT uc.card_id)
      INTO v_current
      FROM public.user_cards uc
      JOIN public.cards c ON c.id = uc.card_id
      WHERE uc.user_id = p_user_id
        AND uc.count > 0
        AND c.rarity = v_rarity;

      v_complete := v_current >= v_target;
      v_label := format('收集 %s 稀有度卡牌 %s / %s 張', coalesce(v_rarity, '未指定'), v_current, v_target);

    ELSE
      v_current := 0;
      v_complete := false;
      v_label := '尚未支援的條件';
  END CASE;

  RETURN jsonb_build_object(
    'id', v_condition.id,
    'condition_type', v_condition.condition_type,
    'current_value', greatest(coalesce(v_current, 0), 0),
    'target_value', greatest(coalesce(v_target, 1), 1),
    'complete', v_complete,
    'label', v_label
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_user_achievements_for_user(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_achievement public.achievements%ROWTYPE;
  v_condition public.achievement_conditions%ROWTYPE;
  v_eval JSONB;
  v_all_complete BOOLEAN;
  v_new_unlocks INTEGER := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_achievement IN
    SELECT *
    FROM public.achievements
    WHERE is_active = true
    ORDER BY sort_order, created_at, id
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.user_achievements ua
      WHERE ua.user_id = p_user_id
        AND ua.achievement_id = v_achievement.id
    ) THEN
      CONTINUE;
    END IF;

    v_all_complete := true;

    IF NOT EXISTS (
      SELECT 1
      FROM public.achievement_conditions ac
      WHERE ac.achievement_id = v_achievement.id
    ) THEN
      CONTINUE;
    END IF;

    FOR v_condition IN
      SELECT *
      FROM public.achievement_conditions ac
      WHERE ac.achievement_id = v_achievement.id
      ORDER BY ac.sort_order, ac.created_at, ac.id
    LOOP
      v_eval := public.evaluate_achievement_condition(p_user_id, v_condition.id);
      IF coalesce((v_eval ->> 'complete')::BOOLEAN, false) IS NOT TRUE THEN
        v_all_complete := false;
        EXIT;
      END IF;
    END LOOP;

    IF v_all_complete THEN
      INSERT INTO public.user_achievements (user_id, achievement_id)
      VALUES (p_user_id, v_achievement.id)
      ON CONFLICT (user_id, achievement_id) DO NOTHING;

      IF FOUND THEN
        v_new_unlocks := v_new_unlocks + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_new_unlocks;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_my_achievements()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '請先登入。';
  END IF;

  RETURN public.sync_user_achievements_for_user(auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_achievement_statuses()
RETURNS TABLE(
  achievement_id UUID,
  name TEXT,
  description TEXT,
  icon_url TEXT,
  category TEXT,
  progress_mode TEXT,
  claim_mode TEXT,
  points_reward INTEGER,
  card_reward UUID,
  equipment_reward_id UUID,
  status TEXT,
  unlocked_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  completed_condition_count INTEGER,
  total_condition_count INTEGER,
  progress_percent INTEGER,
  progress_summary TEXT,
  conditions JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_achievement public.achievements%ROWTYPE;
  v_unlock public.user_achievements%ROWTYPE;
  v_condition public.achievement_conditions%ROWTYPE;
  v_eval JSONB;
  v_conditions JSONB;
  v_completed_count INTEGER;
  v_total_count INTEGER;
  v_progress_total NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '請先登入。';
  END IF;

  FOR v_achievement IN
    SELECT *
    FROM public.achievements
    WHERE is_active = true
    ORDER BY sort_order, created_at, id
  LOOP
    SELECT *
    INTO v_unlock
    FROM public.user_achievements ua
    WHERE ua.user_id = auth.uid()
      AND ua.achievement_id = v_achievement.id;

    v_conditions := '[]'::JSONB;
    v_completed_count := 0;
    v_total_count := 0;
    v_progress_total := 0;

    FOR v_condition IN
      SELECT *
      FROM public.achievement_conditions ac
      WHERE ac.achievement_id = v_achievement.id
      ORDER BY ac.sort_order, ac.created_at, ac.id
    LOOP
      v_eval := public.evaluate_achievement_condition(auth.uid(), v_condition.id);
      v_conditions := v_conditions || jsonb_build_array(v_eval);
      v_total_count := v_total_count + 1;

      IF coalesce((v_eval ->> 'complete')::BOOLEAN, false) THEN
        v_completed_count := v_completed_count + 1;
      END IF;

      v_progress_total := v_progress_total + least(
        coalesce((v_eval ->> 'current_value')::NUMERIC, 0)
        / greatest(coalesce((v_eval ->> 'target_value')::NUMERIC, 1), 1),
        1
      );
    END LOOP;

    achievement_id := v_achievement.id;
    name := v_achievement.name;
    description := v_achievement.description;
    icon_url := v_achievement.icon_url;
    category := v_achievement.category;
    progress_mode := v_achievement.progress_mode;
    claim_mode := v_achievement.claim_mode;
    points_reward := v_achievement.points_reward;
    card_reward := v_achievement.card_reward;
    equipment_reward_id := v_achievement.equipment_reward_id;
    unlocked_at := v_unlock.unlocked_at;
    claimed_at := v_unlock.claimed_at;
    completed_condition_count := v_completed_count;
    total_condition_count := greatest(v_total_count, 1);
    progress_percent :=
      CASE
        WHEN v_unlock.id IS NOT NULL THEN 100
        WHEN v_total_count = 0 THEN 0
        ELSE round((v_progress_total / v_total_count) * 100)::INTEGER
      END;
    progress_summary :=
      CASE
        WHEN v_total_count = 0 THEN '尚未設定條件'
        WHEN v_total_count = 1 THEN coalesce(v_conditions -> 0 ->> 'label', '尚未設定條件')
        ELSE format('%s / %s 條件完成', v_completed_count, v_total_count)
      END;
    conditions := v_conditions;
    status :=
      CASE
        WHEN v_unlock.id IS NULL THEN 'locked'
        WHEN v_unlock.claimed_at IS NULL THEN 'claimable'
        ELSE 'claimed'
      END;

    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_achievement_reward(p_achievement_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_achievement public.achievements%ROWTYPE;
  v_unlock public.user_achievements%ROWTYPE;
  v_existing_count INTEGER;
  v_card_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '請先登入。';
  END IF;

  PERFORM public.sync_user_achievements_for_user(auth.uid());

  SELECT a.*
  INTO v_achievement
  FROM public.achievements a
  WHERE a.id = p_achievement_id
    AND a.is_active = true;

  IF v_achievement.id IS NULL THEN
    RAISE EXCEPTION '找不到這個成就。';
  END IF;

  SELECT *
  INTO v_unlock
  FROM public.user_achievements ua
  WHERE ua.user_id = auth.uid()
    AND ua.achievement_id = p_achievement_id;

  IF v_unlock.id IS NULL THEN
    RAISE EXCEPTION '尚未達成此成就。';
  END IF;

  IF v_unlock.claimed_at IS NOT NULL THEN
    RAISE EXCEPTION '這個成就已經領取過了。';
  END IF;

  IF coalesce(v_achievement.points_reward, 0) > 0 THEN
    UPDATE public.profiles
    SET stars = stars + v_achievement.points_reward
    WHERE id = auth.uid();

    INSERT INTO public.transactions (user_id, type, amount, description, related_id)
    VALUES (auth.uid(), 'earn', v_achievement.points_reward, '成就獎勵：' || v_achievement.name, v_achievement.id);
  END IF;

  IF v_achievement.card_reward IS NOT NULL THEN
    SELECT count(*)
    INTO v_existing_count
    FROM public.user_cards
    WHERE user_id = auth.uid()
      AND card_id = v_achievement.card_reward;

    IF v_existing_count > 0 THEN
      UPDATE public.user_cards
      SET count = count + 1
      WHERE user_id = auth.uid()
        AND card_id = v_achievement.card_reward;
    ELSE
      INSERT INTO public.user_cards (user_id, card_id, count)
      VALUES (auth.uid(), v_achievement.card_reward, 1);
    END IF;

    SELECT name
    INTO v_card_name
    FROM public.cards
    WHERE id = v_achievement.card_reward;
  END IF;

  IF v_achievement.equipment_reward_id IS NOT NULL THEN
    PERFORM public.upsert_player_equipment(auth.uid(), v_achievement.equipment_reward_id, 1, true);
  END IF;

  UPDATE public.user_achievements
  SET claimed_at = timezone('utc'::text, now()),
      points_claimed = coalesce(v_achievement.points_reward, 0) > 0,
      card_claimed = v_achievement.card_reward IS NOT NULL
  WHERE id = v_unlock.id;

  RETURN jsonb_build_object(
    'ok', true,
    'achievement_id', v_achievement.id,
    'points_awarded', coalesce(v_achievement.points_reward, 0),
    'card_reward', v_achievement.card_reward,
    'card_reward_name', v_card_name,
    'message', '已領取成就獎勵。'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_achievement_condition_task_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_task_streak_periods(UUID, TEXT, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_achievement_condition(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_my_achievements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_achievement_statuses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_achievement_reward(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_achievements_from_user_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'task_completions' THEN
    IF NEW.user_id IS NOT NULL AND NEW.status = 'approved' THEN
      PERFORM public.sync_user_achievements_for_user(NEW.user_id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'user_cards' THEN
    IF NEW.user_id IS NOT NULL THEN
      PERFORM public.sync_user_achievements_for_user(NEW.user_id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'transactions' THEN
    IF NEW.user_id IS NOT NULL AND NEW.type = 'earn' AND NEW.amount > 0 THEN
      PERFORM public.sync_user_achievements_for_user(NEW.user_id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_achievements_after_task_completion ON public.task_completions;
CREATE TRIGGER sync_achievements_after_task_completion
AFTER INSERT OR UPDATE OF status ON public.task_completions
FOR EACH ROW
EXECUTE FUNCTION public.sync_achievements_from_user_activity();

DROP TRIGGER IF EXISTS sync_achievements_after_user_card_change ON public.user_cards;
CREATE TRIGGER sync_achievements_after_user_card_change
AFTER INSERT OR UPDATE OF count ON public.user_cards
FOR EACH ROW
EXECUTE FUNCTION public.sync_achievements_from_user_activity();

DROP TRIGGER IF EXISTS sync_achievements_after_transaction_earn ON public.transactions;
CREATE TRIGGER sync_achievements_after_transaction_earn
AFTER INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_achievements_from_user_activity();

DO $$
DECLARE
  v_achievement RECORD;
  v_condition_id UUID;
BEGIN
  UPDATE public.achievements
  SET category = CASE
      WHEN condition_type = 'tasks_completed' THEN 'task'
      WHEN condition_type IN ('cards_collected', 'series_complete', 'rarity_collection') THEN 'card'
      WHEN condition_type = 'points' THEN 'points'
      ELSE category
    END,
    progress_mode = CASE
      WHEN condition_type = 'series_complete' THEN 'all_complete'
      ELSE progress_mode
    END,
    authoring_mode = COALESCE(authoring_mode, 'simple'),
    claim_mode = COALESCE(claim_mode, 'manual');

  FOR v_achievement IN
    SELECT a.*
    FROM public.achievements a
    LEFT JOIN public.achievement_conditions ac ON ac.achievement_id = a.id
    WHERE ac.id IS NULL
  LOOP
    INSERT INTO public.achievement_conditions (achievement_id, condition_type, target_value, sort_order, config_json)
    VALUES (
      v_achievement.id,
      CASE v_achievement.condition_type
        WHEN 'cards_collected' THEN 'cards_collected_total'
        WHEN 'points' THEN 'points_earned_total'
        WHEN 'tasks_completed' THEN 'tasks_completed_total'
        WHEN 'series_complete' THEN 'series_complete'
        WHEN 'rarity_collection' THEN 'rarity_collection'
        ELSE 'tasks_completed_total'
      END,
      greatest(coalesce(v_achievement.condition_value, 1), 1),
      0,
      CASE
        WHEN v_achievement.condition_type = 'series_complete' THEN jsonb_build_object('series', coalesce(v_achievement.condition_series, ''))
        WHEN v_achievement.condition_type = 'rarity_collection' THEN jsonb_build_object('rarity', coalesce(v_achievement.condition_rarity, ''))
        ELSE '{}'::jsonb
      END
    )
    RETURNING id INTO v_condition_id;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.achievements WHERE name = '初試身手') THEN
    INSERT INTO public.achievements (name, description, condition_type, condition_value, category, progress_mode, authoring_mode, claim_mode, points_reward, is_active, is_preset, sort_order)
    VALUES ('初試身手', '累積完成 1 次任務，踏出成長的第一步。', 'tasks_completed', 1, 'task', 'cumulative', 'simple', 'manual', 10, false, true, 100)
    RETURNING id INTO v_condition_id;
    INSERT INTO public.achievement_conditions (achievement_id, condition_type, target_value, sort_order)
    VALUES (v_condition_id, 'tasks_completed_total', 1, 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.achievements WHERE name = '任務新秀') THEN
    INSERT INTO public.achievements (name, description, condition_type, condition_value, category, progress_mode, authoring_mode, claim_mode, points_reward, is_active, is_preset, sort_order)
    VALUES ('任務新秀', '累積完成 10 次任務，開始習慣穩定完成挑戰。', 'tasks_completed', 10, 'task', 'cumulative', 'simple', 'manual', 30, false, true, 110)
    RETURNING id INTO v_condition_id;
    INSERT INTO public.achievement_conditions (achievement_id, condition_type, target_value, sort_order)
    VALUES (v_condition_id, 'tasks_completed_total', 10, 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.achievements WHERE name = '持之以恆') THEN
    INSERT INTO public.achievements (name, description, condition_type, condition_value, category, progress_mode, authoring_mode, claim_mode, points_reward, is_active, is_preset, sort_order)
    VALUES ('持之以恆', '累積完成 50 次任務，展現長期堅持。', 'tasks_completed', 50, 'task', 'cumulative', 'simple', 'manual', 80, false, true, 120)
    RETURNING id INTO v_condition_id;
    INSERT INTO public.achievement_conditions (achievement_id, condition_type, target_value, sort_order)
    VALUES (v_condition_id, 'tasks_completed_total', 50, 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.achievements WHERE name = '天天報到') THEN
    INSERT INTO public.achievements (name, description, condition_type, condition_value, category, progress_mode, authoring_mode, claim_mode, points_reward, is_active, is_preset, sort_order)
    VALUES ('天天報到', '連續 3 天完成至少 1 次每日任務。', 'tasks_completed', 3, 'task', 'streak', 'simple', 'manual', 25, false, true, 130)
    RETURNING id INTO v_condition_id;
    INSERT INTO public.achievement_conditions (achievement_id, condition_type, target_value, sort_order, config_json)
    VALUES (v_condition_id, 'task_streak_any', 3, 0, jsonb_build_object('recurrence_type', 'daily'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.achievements WHERE name = '一週不掉線') THEN
    INSERT INTO public.achievements (name, description, condition_type, condition_value, category, progress_mode, authoring_mode, claim_mode, points_reward, is_active, is_preset, sort_order)
    VALUES ('一週不掉線', '連續 7 天完成至少 1 次每日任務。', 'tasks_completed', 7, 'task', 'streak', 'simple', 'manual', 60, false, true, 140)
    RETURNING id INTO v_condition_id;
    INSERT INTO public.achievement_conditions (achievement_id, condition_type, target_value, sort_order, config_json)
    VALUES (v_condition_id, 'task_streak_any', 7, 0, jsonb_build_object('recurrence_type', 'daily'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.achievements WHERE name = '每週穩定成長') THEN
    INSERT INTO public.achievements (name, description, condition_type, condition_value, category, progress_mode, authoring_mode, claim_mode, points_reward, is_active, is_preset, sort_order)
    VALUES ('每週穩定成長', '連續 4 週完成至少 1 次每週任務。', 'tasks_completed', 4, 'task', 'streak', 'simple', 'manual', 90, false, true, 150)
    RETURNING id INTO v_condition_id;
    INSERT INTO public.achievement_conditions (achievement_id, condition_type, target_value, sort_order, config_json)
    VALUES (v_condition_id, 'task_streak_any', 4, 0, jsonb_build_object('recurrence_type', 'weekly'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.achievements WHERE name = '收藏起步') THEN
    INSERT INTO public.achievements (name, description, condition_type, condition_value, category, progress_mode, authoring_mode, claim_mode, points_reward, is_active, is_preset, sort_order)
    VALUES ('收藏起步', '累積收集 10 張卡牌。', 'cards_collected', 10, 'card', 'cumulative', 'simple', 'manual', 20, false, true, 200)
    RETURNING id INTO v_condition_id;
    INSERT INTO public.achievement_conditions (achievement_id, condition_type, target_value, sort_order)
    VALUES (v_condition_id, 'cards_collected_total', 10, 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.achievements WHERE name = '收藏入門') THEN
    INSERT INTO public.achievements (name, description, condition_type, condition_value, category, progress_mode, authoring_mode, claim_mode, points_reward, is_active, is_preset, sort_order)
    VALUES ('收藏入門', '累積收集 30 張卡牌。', 'cards_collected', 30, 'card', 'cumulative', 'simple', 'manual', 50, false, true, 210)
    RETURNING id INTO v_condition_id;
    INSERT INTO public.achievement_conditions (achievement_id, condition_type, target_value, sort_order)
    VALUES (v_condition_id, 'cards_collected_total', 30, 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.achievements WHERE name = '系列收藏家') THEN
    INSERT INTO public.achievements (name, description, condition_type, condition_value, condition_series, category, progress_mode, authoring_mode, claim_mode, points_reward, is_active, is_preset, sort_order)
    VALUES ('系列收藏家', '收齊 1 個指定系列。請先補上系列名稱。', 'series_complete', 1, '', 'card', 'all_complete', 'simple', 'manual', 80, false, true, 220)
    RETURNING id INTO v_condition_id;
    INSERT INTO public.achievement_conditions (achievement_id, condition_type, target_value, sort_order, config_json)
    VALUES (v_condition_id, 'series_complete', 1, 0, jsonb_build_object('series', ''));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.achievements WHERE name = '卡冊完封') THEN
    INSERT INTO public.achievements (name, description, condition_type, condition_value, condition_series, category, progress_mode, authoring_mode, claim_mode, points_reward, is_active, is_preset, sort_order)
    VALUES ('卡冊完封', '收齊 1 本指定卡冊。請先補上卡冊。', 'series_complete', 1, '', 'card', 'all_complete', 'simple', 'manual', 100, false, true, 230)
    RETURNING id INTO v_condition_id;
    INSERT INTO public.achievement_conditions (achievement_id, condition_type, target_value, sort_order, config_json)
    VALUES (v_condition_id, 'album_complete', 1, 0, jsonb_build_object('album_id', ''));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.achievements WHERE name = '星光初現') THEN
    INSERT INTO public.achievements (name, description, condition_type, condition_value, category, progress_mode, authoring_mode, claim_mode, points_reward, is_active, is_preset, sort_order)
    VALUES ('星光初現', '歷史累積獲得 100 星星。', 'points', 100, 'points', 'cumulative', 'simple', 'manual', 20, false, true, 300)
    RETURNING id INTO v_condition_id;
    INSERT INTO public.achievement_conditions (achievement_id, condition_type, target_value, sort_order)
    VALUES (v_condition_id, 'points_earned_total', 100, 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.achievements WHERE name = '星光旅人') THEN
    INSERT INTO public.achievements (name, description, condition_type, condition_value, category, progress_mode, authoring_mode, claim_mode, points_reward, is_active, is_preset, sort_order)
    VALUES ('星光旅人', '歷史累積獲得 500 星星。', 'points', 500, 'points', 'cumulative', 'simple', 'manual', 60, false, true, 310)
    RETURNING id INTO v_condition_id;
    INSERT INTO public.achievement_conditions (achievement_id, condition_type, target_value, sort_order)
    VALUES (v_condition_id, 'points_earned_total', 500, 0);
  END IF;
END;
$$;
