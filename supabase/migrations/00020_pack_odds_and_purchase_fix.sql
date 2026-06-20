-- Fix weighted pack draws and expose public rarity odds for each pack.

ALTER TABLE public.pack_contents
  DROP CONSTRAINT IF EXISTS pack_contents_weight_positive;

ALTER TABLE public.pack_contents
  ADD CONSTRAINT pack_contents_weight_positive CHECK (weight > 0);

CREATE OR REPLACE FUNCTION public.get_pack_rarity_odds()
RETURNS TABLE(
  pack_id UUID,
  rarity TEXT,
  card_count BIGINT,
  total_weight BIGINT,
  probability_percent NUMERIC
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  WITH rarity_weights AS (
    SELECT
      pc.pack_id,
      c.rarity,
      count(*) AS card_count,
      sum(pc.weight) AS total_weight
    FROM public.pack_contents pc
    JOIN public.cards c ON c.id = pc.card_id
    JOIN public.card_packs p ON p.id = pc.pack_id
    WHERE p.is_active = true
      AND c.is_active = true
    GROUP BY pc.pack_id, c.rarity
  ),
  pack_totals AS (
    SELECT pack_id, sum(total_weight) AS pack_total_weight
    FROM rarity_weights
    GROUP BY pack_id
  )
  SELECT
    rw.pack_id,
    rw.rarity,
    rw.card_count,
    rw.total_weight,
    round((rw.total_weight::numeric / NULLIF(pt.pack_total_weight, 0)::numeric) * 100, 2) AS probability_percent
  FROM rarity_weights rw
  JOIN pack_totals pt ON pt.pack_id = rw.pack_id
  ORDER BY rw.pack_id,
    CASE rw.rarity
      WHEN 'N' THEN 1
      WHEN 'R' THEN 2
      WHEN 'SR' THEN 3
      WHEN 'SSR' THEN 4
      WHEN 'UR' THEN 5
      ELSE 99
    END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pack_rarity_odds() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pack_rarity_odds() TO anon;

CREATE OR REPLACE FUNCTION public.purchase_pack(p_user_id UUID, p_pack_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost INTEGER;
  v_total_weight INTEGER;
  v_rand INTEGER;
  v_cumulative INTEGER := 0;
  v_selected_card_id UUID;
  v_existing_count INTEGER;
  v_row RECORD;
BEGIN
  SELECT cost
  INTO v_cost
  FROM public.card_packs
  WHERE id = p_pack_id
    AND is_active = true;

  IF v_cost IS NULL THEN
    RAISE EXCEPTION '找不到可購買的卡包';
  END IF;

  IF (SELECT stars FROM public.profiles WHERE id = p_user_id) < v_cost THEN
    RAISE EXCEPTION '星星不足';
  END IF;

  SELECT coalesce(sum(pc.weight), 0)
  INTO v_total_weight
  FROM public.pack_contents pc
  JOIN public.cards c ON c.id = pc.card_id
  WHERE pc.pack_id = p_pack_id
    AND c.is_active = true;

  IF v_total_weight <= 0 THEN
    RAISE EXCEPTION '這個卡包目前沒有可抽取的卡片';
  END IF;

  v_rand := floor(random() * v_total_weight)::INTEGER;

  FOR v_row IN
    SELECT pc.card_id, pc.weight
    FROM public.pack_contents pc
    JOIN public.cards c ON c.id = pc.card_id
    WHERE pc.pack_id = p_pack_id
      AND c.is_active = true
    ORDER BY pc.id
  LOOP
    v_cumulative := v_cumulative + v_row.weight;
    IF v_rand < v_cumulative THEN
      v_selected_card_id := v_row.card_id;
      EXIT;
    END IF;
  END LOOP;

  IF v_selected_card_id IS NULL THEN
    RAISE EXCEPTION '抽卡失敗，請再試一次';
  END IF;

  UPDATE public.profiles
  SET stars = stars - v_cost
  WHERE id = p_user_id;

  INSERT INTO public.transactions (user_id, type, amount, description, related_id)
  VALUES (p_user_id, 'spend', -v_cost, '購買卡包', p_pack_id);

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

  RETURN v_selected_card_id;
END;
$$;
