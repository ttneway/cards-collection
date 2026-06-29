CREATE TABLE IF NOT EXISTS public.player_progress (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  earned_points_total BIGINT NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 60),
  current_profession_id UUID,
  profession_choice_count INTEGER NOT NULL DEFAULT 0 CHECK (profession_choice_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profession_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  theme_color TEXT NOT NULL DEFAULT '#6366f1',
  icon_url TEXT,
  image_prompt TEXT,
  image_style TEXT,
  unlock_tier INTEGER NOT NULL CHECK (unlock_tier IN (1, 2, 3)),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profession_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id UUID NOT NULL REFERENCES public.profession_templates(id) ON DELETE CASCADE,
  effect_type TEXT NOT NULL CHECK (
    effect_type IN (
      'task_points_percent',
      'daily_task_points_percent',
      'weekly_task_points_percent',
      'draw_ssr_rate_flat',
      'draw_ur_rate_flat',
      'points_on_scan_percent',
      'points_on_button_claim_percent',
      'pack_cost_discount_percent'
    )
  ),
  base_value NUMERIC(10, 4) NOT NULL DEFAULT 0,
  per_level_value NUMERIC(10, 4) NOT NULL DEFAULT 0,
  max_preview_value NUMERIC(10, 4) NOT NULL DEFAULT 0,
  stack_group TEXT NOT NULL DEFAULT 'general',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profession_id, effect_type)
);

CREATE TABLE IF NOT EXISTS public.player_professions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  profession_id UUID NOT NULL REFERENCES public.profession_templates(id) ON DELETE RESTRICT,
  unlocked_at_level INTEGER NOT NULL,
  equipped_as_primary BOOLEAN NOT NULL DEFAULT false,
  frozen_level INTEGER NOT NULL DEFAULT 0,
  frozen_effect_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, profession_id)
);

CREATE TABLE IF NOT EXISTS public.equipment_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slot_type TEXT NOT NULL CHECK (slot_type IN ('headwear', 'necklace', 'ring', 'pet')),
  rarity TEXT NOT NULL DEFAULT 'N' CHECK (rarity IN ('N', 'R', 'SR', 'SSR', 'UR')),
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  image_prompt TEXT,
  image_style TEXT,
  source_type TEXT NOT NULL DEFAULT 'teacher' CHECK (source_type IN ('teacher', 'task', 'achievement', 'shop', 'mixed')),
  shop_cost INTEGER CHECK (shop_cost IS NULL OR shop_cost >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.equipment_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES public.equipment_templates(id) ON DELETE CASCADE,
  effect_type TEXT NOT NULL CHECK (
    effect_type IN (
      'task_points_percent',
      'daily_task_points_percent',
      'weekly_task_points_percent',
      'draw_ssr_rate_flat',
      'draw_ur_rate_flat',
      'points_on_scan_percent',
      'points_on_button_claim_percent',
      'pack_cost_discount_percent'
    )
  ),
  base_value NUMERIC(10, 4) NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.player_equipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES public.equipment_templates(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  is_bound BOOLEAN NOT NULL DEFAULT false,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, equipment_id, is_bound)
);

CREATE TABLE IF NOT EXISTS public.player_equipped_items (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slot_type TEXT NOT NULL CHECK (slot_type IN ('headwear', 'necklace', 'ring', 'pet')),
  player_equipment_id UUID NOT NULL REFERENCES public.player_equipments(id) ON DELETE CASCADE,
  equipped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, slot_type)
);

ALTER TABLE public.player_progress
  ADD CONSTRAINT player_progress_current_profession_fk
  FOREIGN KEY (current_profession_id) REFERENCES public.profession_templates(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS equipment_reward_id UUID REFERENCES public.equipment_templates(id) ON DELETE SET NULL;

ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS equipment_reward_id UUID REFERENCES public.equipment_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS player_progress_level_idx ON public.player_progress(level DESC);
CREATE INDEX IF NOT EXISTS profession_templates_unlock_tier_idx ON public.profession_templates(unlock_tier, is_active);
CREATE INDEX IF NOT EXISTS player_professions_user_primary_idx ON public.player_professions(user_id, equipped_as_primary);
CREATE INDEX IF NOT EXISTS player_equipments_user_idx ON public.player_equipments(user_id);
CREATE INDEX IF NOT EXISTS equipment_templates_shop_idx ON public.equipment_templates(shop_cost) WHERE shop_cost IS NOT NULL AND is_active = true;

ALTER TABLE public.player_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profession_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profession_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_professions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_equipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_equipped_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS player_progress_select_policy ON public.player_progress;
CREATE POLICY player_progress_select_policy
  ON public.player_progress
  FOR SELECT
  USING (user_id = auth.uid() OR public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS profession_templates_select_policy ON public.profession_templates;
CREATE POLICY profession_templates_select_policy
  ON public.profession_templates
  FOR SELECT
  TO authenticated
  USING (is_active = true OR public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS profession_templates_manage_policy ON public.profession_templates;
CREATE POLICY profession_templates_manage_policy
  ON public.profession_templates
  FOR ALL
  TO authenticated
  USING (public.current_user_role() IN ('teacher', 'admin'))
  WITH CHECK (public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS profession_effects_select_policy ON public.profession_effects;
CREATE POLICY profession_effects_select_policy
  ON public.profession_effects
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profession_templates pt
      WHERE pt.id = profession_effects.profession_id
        AND (pt.is_active = true OR public.current_user_role() IN ('teacher', 'admin'))
    )
  );

DROP POLICY IF EXISTS profession_effects_manage_policy ON public.profession_effects;
CREATE POLICY profession_effects_manage_policy
  ON public.profession_effects
  FOR ALL
  TO authenticated
  USING (public.current_user_role() IN ('teacher', 'admin'))
  WITH CHECK (public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS player_professions_select_policy ON public.player_professions;
CREATE POLICY player_professions_select_policy
  ON public.player_professions
  FOR SELECT
  USING (user_id = auth.uid() OR public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS equipment_templates_select_policy ON public.equipment_templates;
CREATE POLICY equipment_templates_select_policy
  ON public.equipment_templates
  FOR SELECT
  TO authenticated
  USING (is_active = true OR public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS equipment_templates_manage_policy ON public.equipment_templates;
CREATE POLICY equipment_templates_manage_policy
  ON public.equipment_templates
  FOR ALL
  TO authenticated
  USING (public.current_user_role() IN ('teacher', 'admin'))
  WITH CHECK (public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS equipment_effects_select_policy ON public.equipment_effects;
CREATE POLICY equipment_effects_select_policy
  ON public.equipment_effects
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.equipment_templates et
      WHERE et.id = equipment_effects.equipment_id
        AND (et.is_active = true OR public.current_user_role() IN ('teacher', 'admin'))
    )
  );

DROP POLICY IF EXISTS equipment_effects_manage_policy ON public.equipment_effects;
CREATE POLICY equipment_effects_manage_policy
  ON public.equipment_effects
  FOR ALL
  TO authenticated
  USING (public.current_user_role() IN ('teacher', 'admin'))
  WITH CHECK (public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS player_equipments_select_policy ON public.player_equipments;
CREATE POLICY player_equipments_select_policy
  ON public.player_equipments
  FOR SELECT
  USING (user_id = auth.uid() OR public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS player_equipped_items_select_policy ON public.player_equipped_items;
CREATE POLICY player_equipped_items_select_policy
  ON public.player_equipped_items
  FOR SELECT
  USING (user_id = auth.uid() OR public.current_user_role() IN ('teacher', 'admin'));

CREATE OR REPLACE FUNCTION public.character_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS character_touch_player_progress ON public.player_progress;
CREATE TRIGGER character_touch_player_progress
BEFORE UPDATE ON public.player_progress
FOR EACH ROW
EXECUTE FUNCTION public.character_touch_updated_at();

DROP TRIGGER IF EXISTS character_touch_profession_templates ON public.profession_templates;
CREATE TRIGGER character_touch_profession_templates
BEFORE UPDATE ON public.profession_templates
FOR EACH ROW
EXECUTE FUNCTION public.character_touch_updated_at();

DROP TRIGGER IF EXISTS character_touch_player_professions ON public.player_professions;
CREATE TRIGGER character_touch_player_professions
BEFORE UPDATE ON public.player_professions
FOR EACH ROW
EXECUTE FUNCTION public.character_touch_updated_at();

DROP TRIGGER IF EXISTS character_touch_equipment_templates ON public.equipment_templates;
CREATE TRIGGER character_touch_equipment_templates
BEFORE UPDATE ON public.equipment_templates
FOR EACH ROW
EXECUTE FUNCTION public.character_touch_updated_at();

DROP TRIGGER IF EXISTS character_touch_player_equipments ON public.player_equipments;
CREATE TRIGGER character_touch_player_equipments
BEFORE UPDATE ON public.player_equipments
FOR EACH ROW
EXECUTE FUNCTION public.character_touch_updated_at();

CREATE OR REPLACE FUNCTION public.points_required_for_level(p_level INTEGER)
RETURNS BIGINT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_level <= 1 THEN 0::BIGINT
    ELSE (((p_level - 1)::BIGINT * p_level::BIGINT) / 2) * 120::BIGINT
  END;
$$;

CREATE OR REPLACE FUNCTION public.level_for_earned_points(p_earned_points BIGINT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_level INTEGER := 1;
BEGIN
  FOR v_level IN REVERSE 60..1 LOOP
    IF p_earned_points >= public.points_required_for_level(v_level) THEN
      RETURN v_level;
    END IF;
  END LOOP;

  RETURN 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.profession_choice_tier(p_choice_number INTEGER)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_choice_number <= 1 THEN 1
    WHEN p_choice_number = 2 THEN 2
    ELSE 3
  END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_player_progress(p_user_id UUID)
RETURNS public.player_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_progress public.player_progress;
BEGIN
  INSERT INTO public.player_progress (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT *
  INTO v_progress
  FROM public.player_progress
  WHERE user_id = p_user_id;

  RETURN v_progress;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_player_progress(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_player_progress_for_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.player_progress (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_player_progress_for_profile_trigger ON public.profiles;
CREATE TRIGGER create_player_progress_for_profile_trigger
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.create_player_progress_for_profile();

INSERT INTO public.player_progress (user_id)
SELECT id
FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.compute_profession_effects_for_level(
  p_profession_id UUID,
  p_level INTEGER
)
RETURNS TABLE(effect_type TEXT, value NUMERIC)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pe.effect_type,
    round(
      pe.base_value
      + greatest(floor((greatest(p_level, 1) / 10.0))::INTEGER - pt.unlock_tier, 0) * pe.per_level_value,
      4
    ) AS value
  FROM public.profession_effects pe
  JOIN public.profession_templates pt ON pt.id = pe.profession_id
  WHERE pe.profession_id = p_profession_id;
$$;

GRANT EXECUTE ON FUNCTION public.compute_profession_effects_for_level(UUID, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.compute_profession_effect_snapshot(
  p_profession_id UUID,
  p_level INTEGER
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_object_agg(effect_type, to_jsonb(value)),
    '{}'::jsonb
  )
  FROM public.compute_profession_effects_for_level(p_profession_id, p_level);
$$;

GRANT EXECUTE ON FUNCTION public.compute_profession_effect_snapshot(UUID, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_bonus_entries(p_user_id UUID)
RETURNS TABLE(
  source_category TEXT,
  source_name TEXT,
  effect_type TEXT,
  value NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH progress AS (
    SELECT public.ensure_player_progress(p_user_id) AS row_data
  ),
  primary_profession AS (
    SELECT
      'primary'::TEXT AS source_category,
      pt.name AS source_name,
      effects.effect_type,
      effects.value
    FROM progress
    JOIN public.player_professions pp
      ON pp.user_id = (progress.row_data).user_id
     AND pp.equipped_as_primary = true
    JOIN public.profession_templates pt
      ON pt.id = pp.profession_id
    CROSS JOIN LATERAL public.compute_profession_effects_for_level(
      pp.profession_id,
      (progress.row_data).level
    ) AS effects
  ),
  archived_professions AS (
    SELECT
      'archived'::TEXT AS source_category,
      pt.name AS source_name,
      frozen.key AS effect_type,
      (frozen.value)::NUMERIC AS value
    FROM public.player_professions pp
    JOIN public.profession_templates pt
      ON pt.id = pp.profession_id
    CROSS JOIN LATERAL jsonb_each_text(pp.frozen_effect_snapshot) AS frozen(key, value)
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
    JOIN public.player_equipments pe
      ON pe.id = pei.player_equipment_id
     AND pe.user_id = pei.user_id
     AND pe.quantity > 0
    JOIN public.equipment_templates et
      ON et.id = pe.equipment_id
    JOIN public.equipment_effects ee
      ON ee.equipment_id = et.id
    WHERE pei.user_id = p_user_id
  )
  SELECT * FROM primary_profession
  UNION ALL
  SELECT * FROM archived_professions
  UNION ALL
  SELECT * FROM equipped_items;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_bonus_entries(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.compute_player_bonus_context(
  p_user_id UUID,
  p_source_context TEXT DEFAULT NULL,
  p_recurrence_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH entries AS (
    SELECT *
    FROM public.get_user_bonus_entries(p_user_id)
  ),
  summary AS (
    SELECT
      coalesce(sum(value) FILTER (WHERE effect_type = 'task_points_percent'), 0)::NUMERIC(10, 4) AS task_points_percent,
      coalesce(sum(value) FILTER (WHERE effect_type = 'daily_task_points_percent'), 0)::NUMERIC(10, 4) AS daily_task_points_percent,
      coalesce(sum(value) FILTER (WHERE effect_type = 'weekly_task_points_percent'), 0)::NUMERIC(10, 4) AS weekly_task_points_percent,
      coalesce(sum(value) FILTER (WHERE effect_type = 'draw_ssr_rate_flat'), 0)::NUMERIC(10, 4) AS draw_ssr_rate_flat,
      coalesce(sum(value) FILTER (WHERE effect_type = 'draw_ur_rate_flat'), 0)::NUMERIC(10, 4) AS draw_ur_rate_flat,
      coalesce(sum(value) FILTER (WHERE effect_type = 'points_on_scan_percent'), 0)::NUMERIC(10, 4) AS points_on_scan_percent,
      coalesce(sum(value) FILTER (WHERE effect_type = 'points_on_button_claim_percent'), 0)::NUMERIC(10, 4) AS points_on_button_claim_percent,
      least(coalesce(sum(value) FILTER (WHERE effect_type = 'pack_cost_discount_percent'), 0), 30)::NUMERIC(10, 4) AS pack_cost_discount_percent
    FROM entries
  )
  SELECT jsonb_build_object(
    'summary',
    jsonb_build_object(
      'task_points_percent', summary.task_points_percent,
      'daily_task_points_percent', summary.daily_task_points_percent,
      'weekly_task_points_percent', summary.weekly_task_points_percent,
      'draw_ssr_rate_flat', summary.draw_ssr_rate_flat,
      'draw_ur_rate_flat', summary.draw_ur_rate_flat,
      'points_on_scan_percent', summary.points_on_scan_percent,
      'points_on_button_claim_percent', summary.points_on_button_claim_percent,
      'pack_cost_discount_percent', summary.pack_cost_discount_percent
    ),
    'breakdown',
    jsonb_build_object(
      'primary', coalesce((SELECT jsonb_agg(to_jsonb(entries) ORDER BY source_name, effect_type) FROM entries WHERE source_category = 'primary'), '[]'::jsonb),
      'archived', coalesce((SELECT jsonb_agg(to_jsonb(entries) ORDER BY source_name, effect_type) FROM entries WHERE source_category = 'archived'), '[]'::jsonb),
      'equipment', coalesce((SELECT jsonb_agg(to_jsonb(entries) ORDER BY source_name, effect_type) FROM entries WHERE source_category = 'equipment'), '[]'::jsonb)
    )
  )
  FROM summary;
$$;

GRANT EXECUTE ON FUNCTION public.compute_player_bonus_context(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.calculate_task_reward_points(
  p_user_id UUID,
  p_base_points INTEGER,
  p_method TEXT,
  p_recurrence_type TEXT
)
RETURNS TABLE(
  adjusted_points INTEGER,
  bonus_points INTEGER,
  total_percent NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bonus JSONB;
  v_summary JSONB;
  v_total_percent NUMERIC := 0;
  v_bonus_points INTEGER := 0;
BEGIN
  v_bonus := public.compute_player_bonus_context(p_user_id, p_method, p_recurrence_type);
  v_summary := coalesce(v_bonus -> 'summary', '{}'::jsonb);

  v_total_percent :=
    coalesce((v_summary ->> 'task_points_percent')::NUMERIC, 0)
    + CASE WHEN p_recurrence_type = 'daily' THEN coalesce((v_summary ->> 'daily_task_points_percent')::NUMERIC, 0) ELSE 0 END
    + CASE WHEN p_recurrence_type = 'weekly' THEN coalesce((v_summary ->> 'weekly_task_points_percent')::NUMERIC, 0) ELSE 0 END
    + CASE WHEN p_method = 'scanner' THEN coalesce((v_summary ->> 'points_on_scan_percent')::NUMERIC, 0) ELSE 0 END
    + CASE WHEN p_method = 'button' THEN coalesce((v_summary ->> 'points_on_button_claim_percent')::NUMERIC, 0) ELSE 0 END;

  IF v_total_percent > 0 THEN
    v_bonus_points := round(p_base_points * v_total_percent / 100.0);
    IF v_bonus_points < 1 THEN
      v_bonus_points := 1;
    END IF;
  END IF;

  RETURN QUERY
  SELECT p_base_points + v_bonus_points, v_bonus_points, v_total_percent;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_task_reward_points(UUID, INTEGER, TEXT, TEXT) TO authenticated;

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
BEGIN
  SELECT *
  INTO v_progress
  FROM public.ensure_player_progress(p_user_id);

  SELECT adjusted_points, bonus_points, total_percent
  INTO v_adjusted_points, v_bonus_points, v_total_percent
  FROM public.calculate_task_reward_points(p_user_id, p_base_points, p_method, p_recurrence_type);

  UPDATE public.profiles
  SET stars = stars + v_adjusted_points
  WHERE id = p_user_id;

  v_new_total := v_progress.earned_points_total + v_adjusted_points;

  UPDATE public.player_progress
  SET earned_points_total = v_new_total,
      level = public.level_for_earned_points(v_new_total)
  WHERE user_id = p_user_id;

  INSERT INTO public.transactions (user_id, type, amount, description, related_id)
  VALUES (
    p_user_id,
    'earn',
    v_adjusted_points,
    CASE
      WHEN v_bonus_points > 0 THEN p_description || '（職業/裝備加成 +' || v_bonus_points || '）'
      ELSE p_description
    END,
    p_related_id
  );

  RETURN v_adjusted_points;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_task_points_to_user(UUID, INTEGER, TEXT, TEXT, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_player_equipment(
  p_user_id UUID,
  p_equipment_id UUID,
  p_quantity INTEGER DEFAULT 1,
  p_is_bound BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_equipment_id UUID;
BEGIN
  IF coalesce(p_quantity, 0) <= 0 THEN
    RAISE EXCEPTION '裝備數量必須大於 0';
  END IF;

  INSERT INTO public.player_equipments (user_id, equipment_id, quantity, is_bound)
  VALUES (p_user_id, p_equipment_id, p_quantity, coalesce(p_is_bound, false))
  ON CONFLICT (user_id, equipment_id, is_bound)
  DO UPDATE
  SET quantity = public.player_equipments.quantity + EXCLUDED.quantity,
      updated_at = NOW()
  RETURNING id INTO v_player_equipment_id;

  RETURN v_player_equipment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_player_equipment(UUID, UUID, INTEGER, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_equipment_to_user(
  p_user_id UUID,
  p_equipment_id UUID,
  p_quantity INTEGER DEFAULT 1,
  p_is_bound BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role TEXT;
  v_equipment_name TEXT;
  v_player_equipment_id UUID;
BEGIN
  v_actor_role := public.current_user_role();
  IF v_actor_role NOT IN ('teacher', 'admin') THEN
    RAISE EXCEPTION '只有教師或管理者可以發放裝備';
  END IF;

  SELECT name
  INTO v_equipment_name
  FROM public.equipment_templates
  WHERE id = p_equipment_id
    AND is_active = true;

  IF v_equipment_name IS NULL THEN
    RAISE EXCEPTION '找不到可發放的裝備';
  END IF;

  v_player_equipment_id := public.upsert_player_equipment(p_user_id, p_equipment_id, p_quantity, p_is_bound);

  RETURN jsonb_build_object(
    'player_equipment_id', v_player_equipment_id,
    'equipment_name', v_equipment_name,
    'quantity', p_quantity,
    'message', '已發放裝備：' || v_equipment_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_equipment_to_user(UUID, UUID, INTEGER, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.purchase_equipment(p_equipment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_cost INTEGER;
  v_effective_discount NUMERIC := 0;
  v_effective_cost INTEGER;
  v_name TEXT;
  v_bonus JSONB;
  v_player_equipment_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '請先登入';
  END IF;

  SELECT shop_cost, name
  INTO v_cost, v_name
  FROM public.equipment_templates
  WHERE id = p_equipment_id
    AND is_active = true
    AND shop_cost IS NOT NULL;

  IF v_cost IS NULL THEN
    RAISE EXCEPTION '這個裝備目前不在商店販售';
  END IF;

  v_bonus := public.compute_player_bonus_context(v_user_id, 'shop', NULL);
  v_effective_discount := least(coalesce((v_bonus -> 'summary' ->> 'pack_cost_discount_percent')::NUMERIC, 0), 30);
  v_effective_cost := greatest(floor(v_cost * (100 - v_effective_discount) / 100.0), 1);

  IF (SELECT stars FROM public.profiles WHERE id = v_user_id) < v_effective_cost THEN
    RAISE EXCEPTION '星星不足';
  END IF;

  UPDATE public.profiles
  SET stars = stars - v_effective_cost
  WHERE id = v_user_id;

  INSERT INTO public.transactions (user_id, type, amount, description, related_id)
  VALUES (
    v_user_id,
    'spend',
    -v_effective_cost,
    '購買裝備：' || v_name || CASE WHEN v_effective_discount > 0 THEN '（折扣 ' || v_effective_discount || '%）' ELSE '' END,
    p_equipment_id
  );

  v_player_equipment_id := public.upsert_player_equipment(v_user_id, p_equipment_id, 1, false);

  RETURN jsonb_build_object(
    'player_equipment_id', v_player_equipment_id,
    'equipment_name', v_name,
    'cost', v_effective_cost,
    'discount_percent', v_effective_discount,
    'message', '已購買裝備：' || v_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_equipment(UUID) TO authenticated;

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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '請先登入';
  END IF;

  SELECT *
  INTO v_progress
  FROM public.ensure_player_progress(v_user_id);

  v_available_choice_slots := least(floor(v_progress.level / 10.0)::INTEGER, 6);
  IF v_available_choice_slots <= 0 THEN
    RAISE EXCEPTION '10 級後才能選擇職業';
  END IF;

  IF v_progress.profession_choice_count >= v_available_choice_slots THEN
    RAISE EXCEPTION '目前沒有可用的選職次數';
  END IF;

  v_next_choice_number := v_progress.profession_choice_count + 1;
  v_expected_tier := public.profession_choice_tier(v_next_choice_number);

  SELECT *
  INTO v_template
  FROM public.profession_templates
  WHERE id = p_profession_id
    AND is_active = true;

  IF v_template.id IS NULL THEN
    RAISE EXCEPTION '找不到可選擇的職業';
  END IF;

  IF v_template.unlock_tier <> v_expected_tier THEN
    RAISE EXCEPTION '這個職業不在本次可選的職業池中';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.player_professions
    WHERE user_id = v_user_id
      AND profession_id = p_profession_id
  ) THEN
    RAISE EXCEPTION '你已經解鎖過這個職業';
  END IF;

  UPDATE public.player_professions
  SET equipped_as_primary = false
  WHERE user_id = v_user_id
    AND equipped_as_primary = true;

  INSERT INTO public.player_professions (
    user_id,
    profession_id,
    unlocked_at_level,
    equipped_as_primary,
    frozen_level,
    frozen_effect_snapshot
  )
  VALUES (
    v_user_id,
    p_profession_id,
    v_progress.level,
    true,
    0,
    '{}'::jsonb
  );

  UPDATE public.player_progress
  SET profession_choice_count = profession_choice_count + 1,
      current_profession_id = p_profession_id
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'profession_id', v_template.id,
    'profession_name', v_template.name,
    'message', '已解鎖並裝備職業：' || v_template.name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_profession_unlock(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.switch_primary_profession(p_player_profession_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_progress public.player_progress;
  v_target public.player_professions;
  v_current public.player_professions;
  v_name TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '請先登入';
  END IF;

  SELECT *
  INTO v_progress
  FROM public.ensure_player_progress(v_user_id);

  SELECT *
  INTO v_target
  FROM public.player_professions
  WHERE id = p_player_profession_id
    AND user_id = v_user_id;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION '找不到要切換的職業';
  END IF;

  SELECT *
  INTO v_current
  FROM public.player_professions
  WHERE user_id = v_user_id
    AND equipped_as_primary = true
  ORDER BY unlocked_at DESC
  LIMIT 1;

  IF v_current.id IS NOT NULL AND v_current.id <> v_target.id THEN
    UPDATE public.player_professions
    SET equipped_as_primary = false,
        frozen_level = v_progress.level,
        frozen_effect_snapshot = public.compute_profession_effect_snapshot(v_current.profession_id, v_progress.level)
    WHERE id = v_current.id;
  END IF;

  UPDATE public.player_professions
  SET equipped_as_primary = false
  WHERE user_id = v_user_id
    AND id <> v_target.id;

  UPDATE public.player_professions
  SET equipped_as_primary = true
  WHERE id = v_target.id;

  UPDATE public.player_progress
  SET current_profession_id = v_target.profession_id
  WHERE user_id = v_user_id;

  SELECT name
  INTO v_name
  FROM public.profession_templates
  WHERE id = v_target.profession_id;

  RETURN jsonb_build_object(
    'profession_id', v_target.profession_id,
    'profession_name', v_name,
    'message', '目前主職業已切換為：' || v_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.switch_primary_profession(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.equip_item(p_player_equipment_id UUID, p_slot_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_equipment public.player_equipments;
  v_template public.equipment_templates;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '請先登入';
  END IF;

  SELECT *
  INTO v_equipment
  FROM public.player_equipments
  WHERE id = p_player_equipment_id
    AND user_id = v_user_id
    AND quantity > 0;

  IF v_equipment.id IS NULL THEN
    RAISE EXCEPTION '找不到可穿戴的裝備';
  END IF;

  SELECT *
  INTO v_template
  FROM public.equipment_templates
  WHERE id = v_equipment.equipment_id
    AND is_active = true;

  IF v_template.id IS NULL THEN
    RAISE EXCEPTION '裝備模板不存在或已停用';
  END IF;

  IF v_template.slot_type <> p_slot_type THEN
    RAISE EXCEPTION '裝備欄位不符合';
  END IF;

  INSERT INTO public.player_equipped_items (user_id, slot_type, player_equipment_id, equipped_at)
  VALUES (v_user_id, p_slot_type, p_player_equipment_id, NOW())
  ON CONFLICT (user_id, slot_type)
  DO UPDATE
  SET player_equipment_id = EXCLUDED.player_equipment_id,
      equipped_at = NOW();

  RETURN jsonb_build_object(
    'slot_type', p_slot_type,
    'equipment_name', v_template.name,
    'message', '已穿戴裝備：' || v_template.name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.equip_item(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.unequip_item(p_slot_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '請先登入';
  END IF;

  DELETE FROM public.player_equipped_items
  WHERE user_id = v_user_id
    AND slot_type = p_slot_type;

  RETURN jsonb_build_object(
    'slot_type', p_slot_type,
    'message', '已卸下裝備'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.unequip_item(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.preview_character_bonuses(
  p_profession_ids UUID[] DEFAULT ARRAY[]::UUID[],
  p_primary_profession_id UUID DEFAULT NULL,
  p_level INTEGER DEFAULT 1,
  p_equipment_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH profession_rows AS (
    SELECT
      CASE WHEN pt.id = p_primary_profession_id THEN 'primary' ELSE 'archived' END AS source_category,
      pt.name AS source_name,
      effects.effect_type,
      CASE
        WHEN pt.id = p_primary_profession_id THEN effects.value
        ELSE effects.value
      END AS value
    FROM public.profession_templates pt
    JOIN unnest(coalesce(p_profession_ids, ARRAY[]::UUID[])) AS selected_profession(id)
      ON selected_profession.id = pt.id
    CROSS JOIN LATERAL public.compute_profession_effects_for_level(pt.id, p_level) AS effects
  ),
  equipment_rows AS (
    SELECT
      'equipment'::TEXT AS source_category,
      et.name AS source_name,
      ee.effect_type,
      ee.base_value AS value
    FROM public.equipment_templates et
    JOIN unnest(coalesce(p_equipment_ids, ARRAY[]::UUID[])) AS selected_equipment(id)
      ON selected_equipment.id = et.id
    JOIN public.equipment_effects ee
      ON ee.equipment_id = et.id
  ),
  entries AS (
    SELECT * FROM profession_rows
    UNION ALL
    SELECT * FROM equipment_rows
  )
  SELECT jsonb_build_object(
    'entries', coalesce((SELECT jsonb_agg(to_jsonb(entries) ORDER BY source_category, source_name, effect_type) FROM entries), '[]'::jsonb),
    'summary', jsonb_build_object(
      'task_points_percent', coalesce((SELECT sum(value) FROM entries WHERE effect_type = 'task_points_percent'), 0),
      'daily_task_points_percent', coalesce((SELECT sum(value) FROM entries WHERE effect_type = 'daily_task_points_percent'), 0),
      'weekly_task_points_percent', coalesce((SELECT sum(value) FROM entries WHERE effect_type = 'weekly_task_points_percent'), 0),
      'draw_ssr_rate_flat', coalesce((SELECT sum(value) FROM entries WHERE effect_type = 'draw_ssr_rate_flat'), 0),
      'draw_ur_rate_flat', coalesce((SELECT sum(value) FROM entries WHERE effect_type = 'draw_ur_rate_flat'), 0),
      'points_on_scan_percent', coalesce((SELECT sum(value) FROM entries WHERE effect_type = 'points_on_scan_percent'), 0),
      'points_on_button_claim_percent', coalesce((SELECT sum(value) FROM entries WHERE effect_type = 'points_on_button_claim_percent'), 0),
      'pack_cost_discount_percent', least(coalesce((SELECT sum(value) FROM entries WHERE effect_type = 'pack_cost_discount_percent'), 0), 30)
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.preview_character_bonuses(UUID[], UUID, INTEGER, UUID[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_character_profile(p_user_id UUID DEFAULT auth.uid())
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_progress public.player_progress;
  v_user_id UUID := coalesce(p_user_id, auth.uid());
  v_available_unlocks INTEGER;
  v_next_choice_number INTEGER;
  v_next_choice_tier INTEGER;
  v_bonus JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '請先登入';
  END IF;

  IF v_user_id <> auth.uid() AND public.current_user_role() NOT IN ('teacher', 'admin') THEN
    RAISE EXCEPTION '沒有權限查看這個角色資料';
  END IF;

  SELECT *
  INTO v_progress
  FROM public.ensure_player_progress(v_user_id);

  v_available_unlocks := greatest(least(floor(v_progress.level / 10.0)::INTEGER, 6) - v_progress.profession_choice_count, 0);
  v_next_choice_number := v_progress.profession_choice_count + 1;
  v_next_choice_tier := public.profession_choice_tier(v_next_choice_number);
  v_bonus := public.compute_player_bonus_context(v_user_id, NULL, NULL);

  RETURN jsonb_build_object(
    'progress', jsonb_build_object(
      'user_id', v_progress.user_id,
      'earned_points_total', v_progress.earned_points_total,
      'level', v_progress.level,
      'profession_choice_count', v_progress.profession_choice_count,
      'available_unlocks', v_available_unlocks,
      'next_choice_tier', v_next_choice_tier,
      'current_profession_id', v_progress.current_profession_id
    ),
    'level_progress', jsonb_build_object(
      'current_level_start_points', public.points_required_for_level(v_progress.level),
      'next_level_points', CASE WHEN v_progress.level >= 60 THEN NULL ELSE public.points_required_for_level(v_progress.level + 1) END,
      'progress_percent',
      CASE
        WHEN v_progress.level >= 60 THEN 100
        ELSE round(
          (
            (v_progress.earned_points_total - public.points_required_for_level(v_progress.level))::NUMERIC
            / nullif((public.points_required_for_level(v_progress.level + 1) - public.points_required_for_level(v_progress.level))::NUMERIC, 0)
          ) * 100,
          2
        )
      END
    ),
    'current_profession',
    (
      SELECT to_jsonb(pt)
      FROM public.profession_templates pt
      WHERE pt.id = v_progress.current_profession_id
    ),
    'unlocked_professions',
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', pp.id,
          'profession_id', pp.profession_id,
          'unlocked_at_level', pp.unlocked_at_level,
          'equipped_as_primary', pp.equipped_as_primary,
          'frozen_level', pp.frozen_level,
          'frozen_effect_snapshot', pp.frozen_effect_snapshot,
          'profession', to_jsonb(pt),
          'effects', (
            SELECT coalesce(jsonb_agg(to_jsonb(pe) ORDER BY pe.effect_type), '[]'::jsonb)
            FROM public.profession_effects pe
            WHERE pe.profession_id = pt.id
          )
        )
        ORDER BY pp.unlocked_at
      )
      FROM public.player_professions pp
      JOIN public.profession_templates pt ON pt.id = pp.profession_id
      WHERE pp.user_id = v_user_id
    ), '[]'::jsonb),
    'available_profession_choices',
    CASE
      WHEN v_available_unlocks <= 0 THEN '[]'::jsonb
      ELSE coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', pt.id,
            'name', pt.name,
            'code', pt.code,
            'description', pt.description,
            'theme_color', pt.theme_color,
            'icon_url', pt.icon_url,
            'image_prompt', pt.image_prompt,
            'image_style', pt.image_style,
            'unlock_tier', pt.unlock_tier,
            'effects', (
              SELECT coalesce(jsonb_agg(to_jsonb(pe) ORDER BY pe.effect_type), '[]'::jsonb)
              FROM public.profession_effects pe
              WHERE pe.profession_id = pt.id
            )
          )
          ORDER BY pt.name
        )
        FROM public.profession_templates pt
        WHERE pt.is_active = true
          AND pt.unlock_tier = v_next_choice_tier
          AND NOT EXISTS (
            SELECT 1
            FROM public.player_professions existing
            WHERE existing.user_id = v_user_id
              AND existing.profession_id = pt.id
          )
      ), '[]'::jsonb)
    END,
    'bonuses', v_bonus
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_character_profile(UUID) TO authenticated;

INSERT INTO public.profession_templates (
  code,
  name,
  description,
  theme_color,
  unlock_tier,
  is_active,
  is_system
)
VALUES
  ('scholar', '學者', '偏向按鈕完成任務的穩定成長型職業。', '#4f46e5', 1, true, true),
  ('star_ranger', '巡星員', '偏向掃碼任務的實作型職業。', '#0ea5e9', 1, true, true),
  ('card_keeper', '藏卡師', '偏向收藏與抽卡的職業。', '#a855f7', 1, true, true),
  ('dawn_herald', '晨光使', '擅長每日任務，適合日常累積。', '#f59e0b', 2, true, true),
  ('exchange_merchant', '交換商', '擅長降低卡包與裝備商店消耗。', '#10b981', 2, true, true),
  ('record_officer', '記錄官', '提供穩定的任務點數加成。', '#14b8a6', 2, true, true),
  ('starmark_mage', '星痕術士', '30 級後才會出現的高階抽卡職業。', '#8b5cf6', 3, true, true),
  ('archive_mentor', '典藏導師', '小幅提升 SSR / UR 機率的高階職業。', '#ec4899', 3, true, true),
  ('rhythm_guardian', '節律守護者', '擅長每週任務與長線累積。', '#22c55e', 3, true, true)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  theme_color = EXCLUDED.theme_color,
  unlock_tier = EXCLUDED.unlock_tier,
  is_active = EXCLUDED.is_active,
  is_system = EXCLUDED.is_system;

DELETE FROM public.profession_effects
WHERE profession_id IN (
  SELECT id
  FROM public.profession_templates
  WHERE code IN (
    'scholar',
    'star_ranger',
    'card_keeper',
    'dawn_herald',
    'exchange_merchant',
    'record_officer',
    'starmark_mage',
    'archive_mentor',
    'rhythm_guardian'
  )
);

INSERT INTO public.profession_effects (profession_id, effect_type, base_value, per_level_value, max_preview_value, stack_group, description)
SELECT id, 'points_on_button_claim_percent', 1, 0.5, 3.5, 'task', '按鈕完成任務時額外加點'
FROM public.profession_templates
WHERE code = 'scholar'
UNION ALL
SELECT id, 'points_on_scan_percent', 1, 0.5, 3.5, 'task', '掃碼任務時額外加點'
FROM public.profession_templates
WHERE code = 'star_ranger'
UNION ALL
SELECT id, 'draw_ssr_rate_flat', 0.15, 0.05, 0.4, 'draw', '提升 SSR 抽中率'
FROM public.profession_templates
WHERE code = 'card_keeper'
UNION ALL
SELECT id, 'daily_task_points_percent', 2, 0.5, 4.5, 'task', '每日任務額外加點'
FROM public.profession_templates
WHERE code = 'dawn_herald'
UNION ALL
SELECT id, 'pack_cost_discount_percent', 2, 0.5, 4.5, 'shop', '降低卡包與裝備商店消耗'
FROM public.profession_templates
WHERE code = 'exchange_merchant'
UNION ALL
SELECT id, 'task_points_percent', 1.5, 0.5, 4, 'task', '所有任務小幅加點'
FROM public.profession_templates
WHERE code = 'record_officer'
UNION ALL
SELECT id, 'draw_ur_rate_flat', 0.08, 0.02, 0.18, 'draw', '提升 UR 抽中率'
FROM public.profession_templates
WHERE code = 'starmark_mage'
UNION ALL
SELECT id, 'draw_ssr_rate_flat', 0.08, 0.02, 0.18, 'draw', '提升 SSR 抽中率'
FROM public.profession_templates
WHERE code = 'archive_mentor'
UNION ALL
SELECT id, 'draw_ur_rate_flat', 0.03, 0.01, 0.08, 'draw', '小幅提升 UR 抽中率'
FROM public.profession_templates
WHERE code = 'archive_mentor'
UNION ALL
SELECT id, 'weekly_task_points_percent', 2, 0.5, 4.5, 'task', '每週任務額外加點'
FROM public.profession_templates
WHERE code = 'rhythm_guardian';

CREATE OR REPLACE FUNCTION public.claim_task_by_user_action(p_task_id UUID, p_method TEXT)
RETURNS TABLE(completion_id UUID, task_title TEXT, points_awarded INTEGER, period_key TEXT, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user profiles%ROWTYPE;
  v_task tasks%ROWTYPE;
  v_period_key TEXT;
  v_claim_count INTEGER;
  v_completion_id UUID;
  v_status TEXT;
  v_points INTEGER := 0;
  v_latest_completed_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_user FROM public.profiles WHERE id = auth.uid();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION '請先登入後再領取任務';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id AND is_active = true;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION '找不到可領取的任務';
  END IF;

  IF NOT public.task_applies_to_class(v_task.id, v_user.class_id) THEN
    RAISE EXCEPTION '這個任務不在你的可參與範圍';
  END IF;

  PERFORM public.assert_task_completion_method(v_task, p_method);
  PERFORM public.assert_task_scan_window(v_task);

  v_period_key := public.period_key_for_task(v_task.recurrence_type, NOW(), v_task.custom_reset_days);

  SELECT count(*), max(tc.completed_at)
  INTO v_claim_count, v_latest_completed_at
  FROM public.task_completions tc
  WHERE tc.task_id = v_task.id
    AND tc.user_id = v_user.id
    AND tc.status IN ('pending', 'approved')
    AND coalesce(tc.period_key, 'once') = v_period_key;

  IF v_claim_count >= greatest(v_task.per_period_limit, 1) THEN
    RAISE EXCEPTION '本週期已達領取上限';
  END IF;

  SELECT max(tc.completed_at)
  INTO v_latest_completed_at
  FROM public.task_completions tc
  WHERE tc.task_id = v_task.id
    AND tc.user_id = v_user.id
    AND tc.status IN ('pending', 'approved');

  PERFORM public.assert_task_cooldown(v_latest_completed_at, v_task.claim_cooldown_minutes);

  v_status := CASE WHEN v_task.type = 'approve' THEN 'pending' ELSE 'approved' END;

  INSERT INTO public.task_completions (task_id, user_id, status, session_id, period_key)
  VALUES (v_task.id, v_user.id, v_status, NULL, v_period_key)
  RETURNING id INTO v_completion_id;

  IF v_status = 'approved' THEN
    v_points := public.grant_task_points_to_user(
      v_user.id,
      v_task.points,
      p_method,
      v_task.recurrence_type,
      '任務完成：' || v_task.title,
      v_task.id
    );

    IF v_task.equipment_reward_id IS NOT NULL THEN
      PERFORM public.upsert_player_equipment(v_user.id, v_task.equipment_reward_id, 1, true);
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    v_completion_id,
    v_task.title,
    v_points,
    v_period_key,
    CASE
      WHEN v_status = 'approved' THEN v_user.name || ' 完成「' || v_task.title || '」，獲得 ' || v_points || ' 點星星'
      ELSE v_user.name || ' 已送出「' || v_task.title || '」申請，等待審核'
    END;
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
  v_points INTEGER := 0;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF v_actor.id IS NULL OR v_actor.role NOT IN ('teacher', 'leader', 'admin') THEN
    RAISE EXCEPTION '只有小老師、教師或管理者可以掃碼發點';
  END IF;

  IF v_actor.role = 'leader' AND v_actor.class_id IS NULL THEN
    RAISE EXCEPTION '幹部尚未綁定班級';
  END IF;

  SELECT * INTO v_session
  FROM public.task_sessions
  WHERE id = p_session_id
    AND is_active = true;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION '找不到進行中的掃碼任務';
  END IF;

  IF v_session.actor_id <> v_actor.id AND v_actor.role NOT IN ('teacher', 'admin') THEN
    RAISE EXCEPTION '你不能操作其他人的任務工作階段';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = v_session.task_id AND is_active = true;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION '這個任務已停用';
  END IF;

  PERFORM public.assert_task_completion_method(v_task, 'scanner');
  PERFORM public.assert_task_scan_window(v_task);

  SELECT * INTO v_profile FROM public.profiles WHERE scan_code = trim(p_student_scan_code);
  IF v_profile.id IS NOT NULL THEN
    IF v_profile.role IN ('teacher', 'admin') THEN
      RAISE EXCEPTION '教師或管理者身分不能當成學生領點';
    END IF;

    IF v_actor.role = 'leader' AND v_actor.class_id IS DISTINCT FROM v_profile.class_id THEN
      RAISE EXCEPTION '幹部只能對自己班上的學生發點';
    END IF;

    IF NOT public.task_applies_to_class(v_task.id, v_profile.class_id) THEN
      RAISE EXCEPTION '這個任務不適用於該學生班級';
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

    v_points := public.grant_task_points_to_user(
      v_profile.id,
      v_task.points,
      'scanner',
      v_task.recurrence_type,
      '掃碼任務：' || v_task.title,
      v_task.id
    );

    IF v_task.equipment_reward_id IS NOT NULL THEN
      PERFORM public.upsert_player_equipment(v_profile.id, v_task.equipment_reward_id, 1, true);
    END IF;

    RETURN QUERY
    SELECT
      v_completion_id,
      v_profile.id,
      v_profile.name,
      v_task.title,
      v_points,
      v_period_key,
      v_profile.name || ' 完成「' || v_task.title || '」，獲得 ' || v_points || ' 點星星';
    RETURN;
  END IF;

  SELECT * INTO v_roster FROM public.student_rosters WHERE scan_code = trim(p_student_scan_code);
  IF v_roster.id IS NULL THEN
    RAISE EXCEPTION '找不到這位學生';
  END IF;

  IF v_actor.role = 'leader' AND v_actor.class_id IS DISTINCT FROM v_roster.class_id THEN
    RAISE EXCEPTION '幹部只能對自己班上的學生發點';
  END IF;

  IF NOT public.task_applies_to_class(v_task.id, v_roster.class_id) THEN
    RAISE EXCEPTION '這個任務不適用於該學生班級';
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
    v_roster.name || ' 完成「' || v_task.title || '」，獲得 ' || v_task.points || ' 點積分';
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
  v_points INTEGER := 0;
BEGIN
  SELECT *
  INTO v_task
  FROM public.tasks
  WHERE task_code = trim(p_task_code)
    AND is_active = true;

  IF v_task.id IS NULL THEN
    RAISE EXCEPTION '找不到可掃描的任務';
  END IF;

  PERFORM public.assert_task_completion_method(v_task, 'scanner');
  PERFORM public.assert_task_scan_window(v_task);

  SELECT * INTO v_profile FROM public.profiles WHERE scan_code = trim(p_student_scan_code);
  IF v_profile.id IS NOT NULL THEN
    IF v_profile.role IN ('teacher', 'admin') THEN
      RAISE EXCEPTION '教師或管理者不能用學生條碼領點';
    END IF;

    IF NOT public.task_applies_to_class(v_task.id, v_profile.class_id) THEN
      RAISE EXCEPTION '這個任務不適用於你的班級';
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

    v_points := public.grant_task_points_to_user(
      v_profile.id,
      v_task.points,
      'scanner',
      v_task.recurrence_type,
      '公開掃碼任務：' || v_task.title,
      v_task.id
    );

    IF v_task.equipment_reward_id IS NOT NULL THEN
      PERFORM public.upsert_player_equipment(v_profile.id, v_task.equipment_reward_id, 1, true);
    END IF;

    RETURN QUERY
    SELECT
      v_completion_id,
      v_profile.id,
      v_profile.name,
      v_task.title,
      v_points,
      v_period_key,
      v_profile.name || ' 完成「' || v_task.title || '」，獲得 ' || v_points || ' 點星星';
    RETURN;
  END IF;

  SELECT * INTO v_roster FROM public.student_rosters WHERE scan_code = trim(p_student_scan_code);
  IF v_roster.id IS NULL THEN
    RAISE EXCEPTION '找不到這位學生';
  END IF;

  IF NOT public.task_applies_to_class(v_task.id, v_roster.class_id) THEN
    RAISE EXCEPTION '這個任務不適用於該學生班級';
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
    v_roster.name || ' 完成「' || v_task.title || '」，獲得 ' || v_task.points || ' 點積分';
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_pack(p_user_id UUID, p_pack_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role TEXT := public.current_user_role();
  v_cost INTEGER;
  v_effective_discount NUMERIC := 0;
  v_effective_cost INTEGER;
  v_bonus JSONB;
  v_ssr_bonus NUMERIC := 0;
  v_ur_bonus NUMERIC := 0;
  v_total_weight INTEGER;
  v_selected_rarity TEXT;
  v_rand NUMERIC;
  v_cursor NUMERIC := 0;
  v_selected_card_id UUID;
  v_existing_count INTEGER;
  v_row RECORD;
  v_base_n NUMERIC := 0;
  v_base_r NUMERIC := 0;
  v_base_sr NUMERIC := 0;
  v_base_ssr NUMERIC := 0;
  v_base_ur NUMERIC := 0;
  v_other_total NUMERIC := 0;
  v_remaining_total NUMERIC := 0;
  v_adj_n NUMERIC := 0;
  v_adj_r NUMERIC := 0;
  v_adj_sr NUMERIC := 0;
  v_adj_ssr NUMERIC := 0;
  v_adj_ur NUMERIC := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '請先登入';
  END IF;

  IF auth.uid() <> p_user_id AND v_actor_role <> 'admin' THEN
    RAISE EXCEPTION '不能代替其他帳號抽卡';
  END IF;

  SELECT cost
  INTO v_cost
  FROM public.card_packs
  WHERE id = p_pack_id
    AND is_active = true;

  IF v_cost IS NULL THEN
    RAISE EXCEPTION '找不到可購買的卡包';
  END IF;

  v_bonus := public.compute_player_bonus_context(p_user_id, 'draw', NULL);
  v_effective_discount := least(coalesce((v_bonus -> 'summary' ->> 'pack_cost_discount_percent')::NUMERIC, 0), 30);
  v_effective_cost := greatest(floor(v_cost * (100 - v_effective_discount) / 100.0), 1);
  v_ssr_bonus := greatest(coalesce((v_bonus -> 'summary' ->> 'draw_ssr_rate_flat')::NUMERIC, 0), 0);
  v_ur_bonus := greatest(coalesce((v_bonus -> 'summary' ->> 'draw_ur_rate_flat')::NUMERIC, 0), 0);

  IF (SELECT stars FROM public.profiles WHERE id = p_user_id) < v_effective_cost THEN
    RAISE EXCEPTION '星星不足';
  END IF;

  WITH rarity_weights AS (
    SELECT c.rarity, sum(pc.weight)::NUMERIC AS total_weight
    FROM public.pack_contents pc
    JOIN public.cards c ON c.id = pc.card_id
    WHERE pc.pack_id = p_pack_id
      AND c.is_active = true
    GROUP BY c.rarity
  ),
  totals AS (
    SELECT coalesce(sum(total_weight), 0) AS grand_total
    FROM rarity_weights
  )
  SELECT
    coalesce(max(CASE WHEN rarity = 'N' THEN total_weight END), 0) / NULLIF((SELECT grand_total FROM totals), 0) * 100,
    coalesce(max(CASE WHEN rarity = 'R' THEN total_weight END), 0) / NULLIF((SELECT grand_total FROM totals), 0) * 100,
    coalesce(max(CASE WHEN rarity = 'SR' THEN total_weight END), 0) / NULLIF((SELECT grand_total FROM totals), 0) * 100,
    coalesce(max(CASE WHEN rarity = 'SSR' THEN total_weight END), 0) / NULLIF((SELECT grand_total FROM totals), 0) * 100,
    coalesce(max(CASE WHEN rarity = 'UR' THEN total_weight END), 0) / NULLIF((SELECT grand_total FROM totals), 0) * 100,
    (SELECT grand_total FROM totals)::INTEGER
  INTO v_base_n, v_base_r, v_base_sr, v_base_ssr, v_base_ur, v_total_weight
  FROM rarity_weights;

  IF v_total_weight <= 0 THEN
    RAISE EXCEPTION '這個卡包目前沒有可抽的卡片';
  END IF;

  v_adj_ssr := least(v_base_ssr + v_ssr_bonus, 100);
  v_adj_ur := least(v_base_ur + v_ur_bonus, greatest(100 - v_adj_ssr, 0));
  v_other_total := greatest(100 - v_base_ssr - v_base_ur, 0);
  v_remaining_total := greatest(100 - v_adj_ssr - v_adj_ur, 0);

  IF v_other_total > 0 THEN
    v_adj_n := v_base_n * v_remaining_total / v_other_total;
    v_adj_r := v_base_r * v_remaining_total / v_other_total;
    v_adj_sr := v_base_sr * v_remaining_total / v_other_total;
  ELSE
    v_adj_n := 0;
    v_adj_r := 0;
    v_adj_sr := 0;
  END IF;

  v_rand := random() * 100;

  v_cursor := v_adj_n;
  IF v_rand < v_cursor THEN
    v_selected_rarity := 'N';
  ELSE
    v_cursor := v_cursor + v_adj_r;
    IF v_rand < v_cursor THEN
      v_selected_rarity := 'R';
    ELSE
      v_cursor := v_cursor + v_adj_sr;
      IF v_rand < v_cursor THEN
        v_selected_rarity := 'SR';
      ELSE
        v_cursor := v_cursor + v_adj_ssr;
        IF v_rand < v_cursor THEN
          v_selected_rarity := 'SSR';
        ELSE
          v_selected_rarity := 'UR';
        END IF;
      END IF;
    END IF;
  END IF;

  SELECT coalesce(sum(pc.weight), 0)
  INTO v_total_weight
  FROM public.pack_contents pc
  JOIN public.cards c ON c.id = pc.card_id
  WHERE pc.pack_id = p_pack_id
    AND c.is_active = true
    AND c.rarity = v_selected_rarity;

  IF v_total_weight <= 0 THEN
    SELECT coalesce(sum(pc.weight), 0)
    INTO v_total_weight
    FROM public.pack_contents pc
    JOIN public.cards c ON c.id = pc.card_id
    WHERE pc.pack_id = p_pack_id
      AND c.is_active = true;

    v_selected_rarity := NULL;
  END IF;

  v_rand := floor(random() * v_total_weight);
  v_cursor := 0;

  FOR v_row IN
    SELECT pc.card_id, pc.weight
    FROM public.pack_contents pc
    JOIN public.cards c ON c.id = pc.card_id
    WHERE pc.pack_id = p_pack_id
      AND c.is_active = true
      AND (v_selected_rarity IS NULL OR c.rarity = v_selected_rarity)
    ORDER BY pc.id
  LOOP
    v_cursor := v_cursor + v_row.weight;
    IF v_rand < v_cursor THEN
      v_selected_card_id := v_row.card_id;
      EXIT;
    END IF;
  END LOOP;

  IF v_selected_card_id IS NULL THEN
    RAISE EXCEPTION '抽卡失敗，請稍後再試';
  END IF;

  UPDATE public.profiles
  SET stars = stars - v_effective_cost
  WHERE id = p_user_id;

  INSERT INTO public.transactions (user_id, type, amount, description, related_id)
  VALUES (
    p_user_id,
    'spend',
    -v_effective_cost,
    '購買卡包' || CASE WHEN v_effective_discount > 0 THEN '（折扣 ' || v_effective_discount || '%）' ELSE '' END,
    p_pack_id
  );

  SELECT count(*)
  INTO v_existing_count
  FROM public.user_cards
  WHERE user_id = p_user_id
    AND card_id = v_selected_card_id;

  IF v_existing_count > 0 THEN
    UPDATE public.user_cards
    SET count = count + 1
    WHERE user_id = p_user_id
      AND card_id = v_selected_card_id;
  ELSE
    INSERT INTO public.user_cards (user_id, card_id, count)
    VALUES (p_user_id, v_selected_card_id, 1);
  END IF;

  PERFORM public.create_draw_announcement(p_user_id, v_selected_card_id, p_pack_id);

  RETURN v_selected_card_id;
END;
$$;
