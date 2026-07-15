ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS image_prompt TEXT,
  ADD COLUMN IF NOT EXISTS image_style TEXT,
  ADD COLUMN IF NOT EXISTS image_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS image_generated_at TIMESTAMPTZ;

UPDATE public.achievements
SET image_url = COALESCE(image_url, icon_url)
WHERE image_url IS NULL
  AND icon_url IS NOT NULL;

ALTER TABLE public.remote_ai_workflows
  DROP CONSTRAINT IF EXISTS remote_ai_workflows_target_type_check;

ALTER TABLE public.remote_ai_workflows
  ADD CONSTRAINT remote_ai_workflows_target_type_check
  CHECK (target_type IN ('all', 'card', 'equipment', 'profession', 'achievement'));

CREATE TABLE IF NOT EXISTS public.title_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  theme_color TEXT NOT NULL DEFAULT '#f59e0b',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.title_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id UUID NOT NULL REFERENCES public.title_templates(id) ON DELETE CASCADE,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (title_id, effect_type)
);

CREATE TABLE IF NOT EXISTS public.player_titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title_id UUID NOT NULL REFERENCES public.title_templates(id) ON DELETE RESTRICT,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  UNIQUE (user_id, title_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS player_titles_one_active_title_idx
  ON public.player_titles(user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS title_effects_title_id_idx
  ON public.title_effects(title_id);

CREATE INDEX IF NOT EXISTS player_titles_user_idx
  ON public.player_titles(user_id, revoked_at, assigned_at DESC);

ALTER TABLE public.title_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.title_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_titles ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.title_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.title_effects TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.player_titles TO authenticated;

DROP POLICY IF EXISTS title_templates_select_policy ON public.title_templates;
CREATE POLICY title_templates_select_policy
  ON public.title_templates
  FOR SELECT
  TO authenticated
  USING (is_active = true OR public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS title_templates_manage_policy ON public.title_templates;
CREATE POLICY title_templates_manage_policy
  ON public.title_templates
  FOR ALL
  TO authenticated
  USING (public.current_user_role() IN ('teacher', 'admin'))
  WITH CHECK (public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS title_effects_select_policy ON public.title_effects;
CREATE POLICY title_effects_select_policy
  ON public.title_effects
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.title_templates tt
      WHERE tt.id = title_effects.title_id
        AND (tt.is_active = true OR public.current_user_role() IN ('teacher', 'admin'))
    )
  );

DROP POLICY IF EXISTS title_effects_manage_policy ON public.title_effects;
CREATE POLICY title_effects_manage_policy
  ON public.title_effects
  FOR ALL
  TO authenticated
  USING (public.current_user_role() IN ('teacher', 'admin'))
  WITH CHECK (public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS player_titles_select_policy ON public.player_titles;
CREATE POLICY player_titles_select_policy
  ON public.player_titles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.current_user_role() IN ('teacher', 'admin'));

DROP POLICY IF EXISTS player_titles_manage_policy ON public.player_titles;
CREATE POLICY player_titles_manage_policy
  ON public.player_titles
  FOR ALL
  TO authenticated
  USING (public.current_user_role() IN ('teacher', 'admin'))
  WITH CHECK (public.current_user_role() IN ('teacher', 'admin'));

DROP TRIGGER IF EXISTS character_touch_title_templates ON public.title_templates;
CREATE TRIGGER character_touch_title_templates
BEFORE UPDATE ON public.title_templates
FOR EACH ROW
EXECUTE FUNCTION public.character_touch_updated_at();

CREATE OR REPLACE FUNCTION public.assign_player_title(p_user_id UUID, p_title_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor profiles%ROWTYPE;
  v_target profiles%ROWTYPE;
  v_title public.title_templates%ROWTYPE;
  v_assignment public.player_titles%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF v_actor.id IS NULL OR v_actor.role NOT IN ('teacher', 'admin') THEN
    RAISE EXCEPTION 'Teacher or admin permission is required.';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE id = p_user_id;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Student not found.';
  END IF;

  SELECT * INTO v_title FROM public.title_templates WHERE id = p_title_id AND is_active = true;
  IF v_title.id IS NULL THEN
    RAISE EXCEPTION 'Title not found or inactive.';
  END IF;

  UPDATE public.player_titles
  SET revoked_at = NOW(),
      revoked_by = v_actor.id,
      revoke_reason = 'replaced'
  WHERE user_id = p_user_id
    AND revoked_at IS NULL
    AND title_id <> p_title_id;

  INSERT INTO public.player_titles (user_id, title_id, assigned_by, revoked_at, revoked_by, revoke_reason)
  VALUES (p_user_id, p_title_id, v_actor.id, NULL, NULL, NULL)
  ON CONFLICT (user_id, title_id) DO UPDATE
  SET assigned_by = EXCLUDED.assigned_by,
      assigned_at = NOW(),
      revoked_at = NULL,
      revoked_by = NULL,
      revoke_reason = NULL
  RETURNING * INTO v_assignment;

  RETURN jsonb_build_object(
    'ok', true,
    'title_id', v_title.id,
    'title_name', v_title.name,
    'assignment_id', v_assignment.id,
    'message', 'Title assigned.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_player_title(p_user_id UUID, p_title_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor profiles%ROWTYPE;
  v_count INTEGER;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF v_actor.id IS NULL OR v_actor.role NOT IN ('teacher', 'admin') THEN
    RAISE EXCEPTION 'Teacher or admin permission is required.';
  END IF;

  UPDATE public.player_titles
  SET revoked_at = NOW(),
      revoked_by = v_actor.id,
      revoke_reason = 'revoked'
  WHERE user_id = p_user_id
    AND revoked_at IS NULL
    AND (p_title_id IS NULL OR title_id = p_title_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'revoked_count', v_count,
    'message', 'Title revoked.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_player_title(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_player_title(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_remote_ai_workflow(
  p_id UUID,
  p_name TEXT,
  p_target_type TEXT,
  p_workflow_api_json TEXT,
  p_is_active BOOLEAN,
  p_sort_order INTEGER
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  target_type TEXT,
  workflow_api_json TEXT,
  is_active BOOLEAN,
  sort_order INTEGER,
  updated_at TIMESTAMPTZ,
  updated_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_type TEXT := CASE
    WHEN COALESCE(NULLIF(trim(p_target_type), ''), 'all') IN ('all', 'card', 'equipment', 'profession', 'achievement')
      THEN COALESCE(NULLIF(trim(p_target_type), ''), 'all')
    ELSE 'all'
  END;
  v_id UUID;
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can update shared AI workflows.';
  END IF;

  IF COALESCE(NULLIF(trim(p_name), ''), '') = '' THEN
    RAISE EXCEPTION 'Workflow name is required.';
  END IF;

  IF COALESCE(NULLIF(trim(p_workflow_api_json), ''), '') = '' THEN
    RAISE EXCEPTION 'Workflow JSON is required.';
  END IF;

  v_id := COALESCE(p_id, gen_random_uuid());

  INSERT INTO public.remote_ai_workflows AS w (
    "id",
    "name",
    "target_type",
    "workflow_api_json",
    "is_active",
    "sort_order",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by"
  )
  VALUES (
    v_id,
    trim(p_name),
    v_target_type,
    p_workflow_api_json,
    COALESCE(p_is_active, true),
    COALESCE(p_sort_order, 0),
    now(),
    now(),
    auth.uid(),
    auth.uid()
  )
  ON CONFLICT ON CONSTRAINT remote_ai_workflows_pkey DO UPDATE
  SET
    "name" = EXCLUDED.name,
    "target_type" = EXCLUDED.target_type,
    "workflow_api_json" = EXCLUDED.workflow_api_json,
    "is_active" = EXCLUDED.is_active,
    "sort_order" = EXCLUDED.sort_order,
    "updated_at" = now(),
    "updated_by" = auth.uid();

  RETURN QUERY
  SELECT
    w.id,
    w.name,
    w.target_type,
    w.workflow_api_json,
    w.is_active,
    w.sort_order,
    w.updated_at,
    w.updated_by
  FROM public.remote_ai_workflows AS w
  WHERE w.id = v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_remote_ai_workflow(UUID, TEXT, TEXT, TEXT, BOOLEAN, INTEGER) TO authenticated;

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
  ),
  active_titles AS (
    SELECT
      'title'::TEXT AS source_category,
      tt.name AS source_name,
      te.effect_type,
      te.base_value AS value
    FROM public.player_titles ptitle
    JOIN public.title_templates tt
      ON tt.id = ptitle.title_id
     AND tt.is_active = true
    JOIN public.title_effects te
      ON te.title_id = tt.id
    WHERE ptitle.user_id = p_user_id
      AND ptitle.revoked_at IS NULL
  )
  SELECT * FROM primary_profession
  UNION ALL
  SELECT * FROM archived_professions
  UNION ALL
  SELECT * FROM equipped_items
  UNION ALL
  SELECT * FROM active_titles;
$$;

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
      'equipment', coalesce((SELECT jsonb_agg(to_jsonb(entries) ORDER BY source_name, effect_type) FROM entries WHERE source_category = 'equipment'), '[]'::jsonb),
      'title', coalesce((SELECT jsonb_agg(to_jsonb(entries) ORDER BY source_name, effect_type) FROM entries WHERE source_category = 'title'), '[]'::jsonb)
    )
  )
  FROM summary;
$$;

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
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF v_user_id <> auth.uid() AND public.current_user_role() NOT IN ('teacher', 'admin') THEN
    RAISE EXCEPTION 'Character profile access denied.';
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
    'active_title',
    (
      SELECT jsonb_build_object(
        'id', ptitle.id,
        'user_id', ptitle.user_id,
        'title_id', ptitle.title_id,
        'assigned_by', ptitle.assigned_by,
        'revoked_by', ptitle.revoked_by,
        'assigned_at', ptitle.assigned_at,
        'revoked_at', ptitle.revoked_at,
        'revoke_reason', ptitle.revoke_reason,
        'title', to_jsonb(tt),
        'effects', (
          SELECT coalesce(jsonb_agg(to_jsonb(te) ORDER BY te.effect_type), '[]'::jsonb)
          FROM public.title_effects te
          WHERE te.title_id = tt.id
        )
      )
      FROM public.player_titles ptitle
      JOIN public.title_templates tt ON tt.id = ptitle.title_id
      WHERE ptitle.user_id = v_user_id
        AND ptitle.revoked_at IS NULL
      ORDER BY ptitle.assigned_at DESC
      LIMIT 1
    ),
    'earned_titles',
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ptitle.id,
          'user_id', ptitle.user_id,
          'title_id', ptitle.title_id,
          'assigned_by', ptitle.assigned_by,
          'revoked_by', ptitle.revoked_by,
          'assigned_at', ptitle.assigned_at,
          'revoked_at', ptitle.revoked_at,
          'revoke_reason', ptitle.revoke_reason,
          'title', to_jsonb(tt),
          'effects', (
            SELECT coalesce(jsonb_agg(to_jsonb(te) ORDER BY te.effect_type), '[]'::jsonb)
            FROM public.title_effects te
            WHERE te.title_id = tt.id
          )
        )
        ORDER BY ptitle.revoked_at IS NULL DESC, ptitle.assigned_at DESC
      )
      FROM public.player_titles ptitle
      JOIN public.title_templates tt ON tt.id = ptitle.title_id
      WHERE ptitle.user_id = v_user_id
    ), '[]'::jsonb),
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

GRANT EXECUTE ON FUNCTION public.get_user_bonus_entries(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_player_bonus_context(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_character_profile(UUID) TO authenticated;
