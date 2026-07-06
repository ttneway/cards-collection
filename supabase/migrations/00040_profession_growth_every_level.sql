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
      + greatest(greatest(p_level, 1) - (pt.unlock_tier * 10), 0) * pe.per_level_value,
      4
    ) AS value
  FROM public.profession_effects pe
  JOIN public.profession_templates pt ON pt.id = pe.profession_id
  WHERE pe.profession_id = p_profession_id;
$$;

GRANT EXECUTE ON FUNCTION public.compute_profession_effects_for_level(UUID, INTEGER) TO authenticated;
