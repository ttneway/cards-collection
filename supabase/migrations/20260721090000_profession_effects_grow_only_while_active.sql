-- Persist profession growth per unlocked profession. Switching back to an old
-- profession must not retroactively apply levels earned while another one was active.

ALTER TABLE public.player_professions
  ADD COLUMN IF NOT EXISTS effect_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS effect_growth_level INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.compute_profession_base_effect_snapshot(p_profession_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_object_agg(pe.effect_type, to_jsonb(round(pe.base_value, 4))),
    '{}'::jsonb
  )
  FROM public.profession_effects pe
  WHERE pe.profession_id = p_profession_id;
$$;

-- Preserve every player's currently visible value as the starting point for the
-- new model. Existing archived snapshots take precedence over the old formula.
UPDATE public.player_professions pp
SET effect_snapshot = CASE
      WHEN pp.frozen_effect_snapshot <> '{}'::jsonb THEN pp.frozen_effect_snapshot
      ELSE public.compute_profession_effect_snapshot(pp.profession_id, progress.level)
    END,
    effect_growth_level = progress.level,
    frozen_effect_snapshot = CASE
      WHEN pp.frozen_effect_snapshot <> '{}'::jsonb THEN pp.frozen_effect_snapshot
      ELSE public.compute_profession_effect_snapshot(pp.profession_id, progress.level)
    END
FROM public.player_progress progress
WHERE progress.user_id = pp.user_id;

CREATE OR REPLACE FUNCTION public.grow_active_profession_effects(
  p_user_id UUID,
  p_levels_gained INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot JSONB;
BEGIN
  IF coalesce(p_levels_gained, 0) <= 0 THEN
    RETURN;
  END IF;

  SELECT pp.effect_snapshot
  INTO v_snapshot
  FROM public.player_professions pp
  WHERE pp.user_id = p_user_id
    AND pp.equipped_as_primary = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.player_professions pp
  SET effect_snapshot = coalesce(v_snapshot, '{}'::jsonb) || coalesce((
        SELECT jsonb_object_agg(
          pe.effect_type,
          to_jsonb(round(coalesce((v_snapshot ->> pe.effect_type)::NUMERIC, pe.base_value) + pe.per_level_value * p_levels_gained, 4))
        )
        FROM public.profession_effects pe
        WHERE pe.profession_id = pp.profession_id
      ), '{}'::jsonb),
      frozen_effect_snapshot = coalesce(v_snapshot, '{}'::jsonb) || coalesce((
        SELECT jsonb_object_agg(
          pe.effect_type,
          to_jsonb(round(coalesce((v_snapshot ->> pe.effect_type)::NUMERIC, pe.base_value) + pe.per_level_value * p_levels_gained, 4))
        )
        FROM public.profession_effects pe
        WHERE pe.profession_id = pp.profession_id
      ), '{}'::jsonb),
      effect_growth_level = effect_growth_level + p_levels_gained
  WHERE pp.user_id = p_user_id
    AND pp.equipped_as_primary = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_bonus_entries(p_user_id UUID)
RETURNS TABLE(source_category TEXT, source_name TEXT, effect_type TEXT, value NUMERIC)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH primary_profession AS (
    SELECT
      'primary'::TEXT AS source_category,
      pt.name AS source_name,
      effect_row.key AS effect_type,
      (effect_row.value)::NUMERIC AS value
    FROM public.player_professions pp
    JOIN public.profession_templates pt ON pt.id = pp.profession_id
    CROSS JOIN LATERAL jsonb_each_text(pp.effect_snapshot) AS effect_row(key, value)
    WHERE pp.user_id = p_user_id
      AND pp.equipped_as_primary = true
  ),
  archived_professions AS (
    SELECT
      'archived'::TEXT AS source_category,
      pt.name AS source_name,
      effect_row.key AS effect_type,
      (effect_row.value)::NUMERIC AS value
    FROM public.player_professions pp
    JOIN public.profession_templates pt ON pt.id = pp.profession_id
    CROSS JOIN LATERAL jsonb_each_text(pp.effect_snapshot) AS effect_row(key, value)
    WHERE pp.user_id = p_user_id
      AND pp.equipped_as_primary = false
  ),
  equipped_items AS (
    SELECT
      'equipment'::TEXT AS source_category,
      et.name AS source_name,
      ee.effect_type,
      ee.base_value AS value
    FROM public.player_equipped_items pei
    JOIN public.player_equipments pe ON pe.id = pei.player_equipment_id
      AND pe.user_id = pei.user_id AND pe.quantity > 0
    JOIN public.equipment_templates et ON et.id = pe.equipment_id
    JOIN public.equipment_effects ee ON ee.equipment_id = et.id
    WHERE pei.user_id = p_user_id
  ),
  active_titles AS (
    SELECT
      'title'::TEXT AS source_category,
      tt.name AS source_name,
      te.effect_type,
      te.base_value AS value
    FROM public.player_titles ptitle
    JOIN public.title_templates tt ON tt.id = ptitle.title_id AND tt.is_active = true
    JOIN public.title_effects te ON te.title_id = tt.id
    WHERE ptitle.user_id = p_user_id AND ptitle.revoked_at IS NULL
  )
  SELECT * FROM primary_profession
  UNION ALL SELECT * FROM archived_professions
  UNION ALL SELECT * FROM equipped_items
  UNION ALL SELECT * FROM active_titles;
$$;

CREATE OR REPLACE FUNCTION public.grant_task_points_to_user(
  p_user_id UUID,
  p_base_points INTEGER,
  p_method TEXT,
  p_recurrence_type TEXT,
  p_description TEXT,
  p_related_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_progress public.player_progress;
  v_adjusted_points INTEGER := p_base_points;
  v_bonus_points INTEGER := 0;
  v_total_percent NUMERIC := 0;
  v_new_total BIGINT;
  v_new_level INTEGER;
BEGIN
  SELECT * INTO v_progress FROM public.ensure_player_progress(p_user_id);

  SELECT adjusted_points, bonus_points, total_percent
  INTO v_adjusted_points, v_bonus_points, v_total_percent
  FROM public.calculate_task_reward_points(p_user_id, p_base_points, p_method, p_recurrence_type);

  UPDATE public.profiles SET stars = stars + v_adjusted_points WHERE id = p_user_id;

  v_new_total := v_progress.earned_points_total + v_adjusted_points;
  v_new_level := public.level_for_earned_points(v_new_total);

  UPDATE public.player_progress
  SET earned_points_total = v_new_total, level = v_new_level
  WHERE user_id = p_user_id;

  PERFORM public.grow_active_profession_effects(p_user_id, greatest(v_new_level - v_progress.level, 0));

  INSERT INTO public.transactions (user_id, type, amount, description, related_id)
  VALUES (
    p_user_id, 'earn', v_adjusted_points,
    CASE WHEN v_bonus_points > 0 THEN p_description || '（職業/裝備加成 +' || v_bonus_points || '）' ELSE p_description END,
    p_related_id
  );

  RETURN v_adjusted_points;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_profession_unlock(p_profession_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_progress public.player_progress;
  v_template public.profession_templates;
  v_available_choice_slots INTEGER;
  v_next_choice_number INTEGER;
  v_expected_tier INTEGER;
  v_current public.player_professions;
  v_base_snapshot JSONB;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION '請先登入'; END IF;
  SELECT * INTO v_progress FROM public.ensure_player_progress(v_user_id);
  v_available_choice_slots := least(floor(v_progress.level / 10.0)::INTEGER, 6);
  IF v_available_choice_slots <= 0 THEN RAISE EXCEPTION '10 級後才能選擇職業'; END IF;
  IF v_progress.profession_choice_count >= v_available_choice_slots THEN RAISE EXCEPTION '目前沒有可用的選職次數'; END IF;
  v_next_choice_number := v_progress.profession_choice_count + 1;
  v_expected_tier := public.profession_choice_tier(v_next_choice_number);
  SELECT * INTO v_template FROM public.profession_templates WHERE id = p_profession_id AND is_active = true;
  IF v_template.id IS NULL THEN RAISE EXCEPTION '找不到可選擇的職業'; END IF;
  IF v_template.unlock_tier <> v_expected_tier THEN RAISE EXCEPTION '這個職業不在本次可選的職業池中'; END IF;
  IF EXISTS (SELECT 1 FROM public.player_professions WHERE user_id = v_user_id AND profession_id = p_profession_id) THEN RAISE EXCEPTION '你已經解鎖過這個職業'; END IF;

  SELECT * INTO v_current FROM public.player_professions
  WHERE user_id = v_user_id AND equipped_as_primary = true ORDER BY unlocked_at DESC LIMIT 1;
  IF v_current.id IS NOT NULL THEN
    UPDATE public.player_professions
    SET equipped_as_primary = false, frozen_level = v_progress.level,
        frozen_effect_snapshot = effect_snapshot
    WHERE id = v_current.id;
  END IF;

  v_base_snapshot := public.compute_profession_base_effect_snapshot(p_profession_id);
  INSERT INTO public.player_professions (
    user_id, profession_id, unlocked_at_level, equipped_as_primary, frozen_level,
    frozen_effect_snapshot, effect_snapshot, effect_growth_level
  ) VALUES (
    v_user_id, p_profession_id, v_progress.level, true, v_progress.level,
    v_base_snapshot, v_base_snapshot, v_progress.level
  );

  UPDATE public.player_progress
  SET profession_choice_count = profession_choice_count + 1, current_profession_id = p_profession_id
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object('profession_id', v_template.id, 'profession_name', v_template.name, 'message', '已解鎖並裝備職業：' || v_template.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.switch_primary_profession(p_player_profession_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_target public.player_professions;
  v_name TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION '請先登入'; END IF;
  SELECT * INTO v_target FROM public.player_professions
  WHERE id = p_player_profession_id AND user_id = v_user_id;
  IF v_target.id IS NULL THEN RAISE EXCEPTION '找不到要切換的職業'; END IF;

  UPDATE public.player_professions
  SET equipped_as_primary = false, frozen_effect_snapshot = effect_snapshot
  WHERE user_id = v_user_id AND id <> v_target.id AND equipped_as_primary = true;
  UPDATE public.player_professions SET equipped_as_primary = true WHERE id = v_target.id;
  UPDATE public.player_progress SET current_profession_id = v_target.profession_id WHERE user_id = v_user_id;
  SELECT name INTO v_name FROM public.profession_templates WHERE id = v_target.profession_id;
  RETURN jsonb_build_object('profession_id', v_target.profession_id, 'profession_name', v_name, 'message', '目前主職業已切換為：' || v_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_profession_base_effect_snapshot(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grow_active_profession_effects(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_bonus_entries(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_task_points_to_user(UUID, INTEGER, TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_profession_unlock(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.switch_primary_profession(UUID) TO authenticated;
