UPDATE public.player_progress progress
SET earned_points_total = coalesce(earnings.total_earned, 0),
    level = public.level_for_earned_points(coalesce(earnings.total_earned, 0))
FROM (
  SELECT user_id, sum(greatest(amount, 0))::BIGINT AS total_earned
  FROM public.transactions
  WHERE type = 'earn'
  GROUP BY user_id
) AS earnings
WHERE progress.user_id = earnings.user_id;

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

  SELECT *
  INTO v_current
  FROM public.player_professions
  WHERE user_id = v_user_id
    AND equipped_as_primary = true
  ORDER BY unlocked_at DESC
  LIMIT 1;

  IF v_current.id IS NOT NULL THEN
    UPDATE public.player_professions
    SET equipped_as_primary = false,
        frozen_level = v_progress.level,
        frozen_effect_snapshot = public.compute_profession_effect_snapshot(v_current.profession_id, v_progress.level)
    WHERE id = v_current.id;
  END IF;

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
