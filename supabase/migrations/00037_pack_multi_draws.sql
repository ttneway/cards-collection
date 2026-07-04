ALTER TABLE public.card_packs
  ADD COLUMN IF NOT EXISTS cards_per_open INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.card_packs
  DROP CONSTRAINT IF EXISTS card_packs_cards_per_open_positive;

ALTER TABLE public.card_packs
  ADD CONSTRAINT card_packs_cards_per_open_positive
  CHECK (cards_per_open >= 1 AND cards_per_open <= 20);

CREATE OR REPLACE FUNCTION public.draw_pack_card_once(p_user_id UUID, p_pack_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  v_bonus JSONB;
BEGIN
  v_bonus := public.compute_player_bonus_context(p_user_id, 'draw', NULL);
  v_ssr_bonus := greatest(coalesce((v_bonus -> 'summary' ->> 'draw_ssr_rate_flat')::NUMERIC, 0), 0);
  v_ur_bonus := greatest(coalesce((v_bonus -> 'summary' ->> 'draw_ur_rate_flat')::NUMERIC, 0), 0);

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

DROP FUNCTION IF EXISTS public.purchase_pack(UUID, UUID);

CREATE FUNCTION public.purchase_pack(p_user_id UUID, p_pack_id UUID)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role TEXT := public.current_user_role();
  v_cost INTEGER;
  v_effective_discount NUMERIC := 0;
  v_effective_cost INTEGER;
  v_cards_per_open INTEGER := 1;
  v_drawn_card_id UUID;
  v_drawn_cards UUID[] := ARRAY[]::UUID[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '請先登入';
  END IF;

  IF auth.uid() <> p_user_id AND v_actor_role <> 'admin' THEN
    RAISE EXCEPTION '不能代替其他帳號抽卡';
  END IF;

  SELECT cost, cards_per_open
  INTO v_cost, v_cards_per_open
  FROM public.card_packs
  WHERE id = p_pack_id
    AND is_active = true;

  IF v_cost IS NULL THEN
    RAISE EXCEPTION '找不到可購買的卡包';
  END IF;

  v_effective_discount := least(
    coalesce((public.compute_player_bonus_context(p_user_id, 'draw', NULL) -> 'summary' ->> 'pack_cost_discount_percent')::NUMERIC, 0),
    30
  );
  v_effective_cost := greatest(floor(v_cost * (100 - v_effective_discount) / 100.0), 1);

  IF (SELECT stars FROM public.profiles WHERE id = p_user_id) < v_effective_cost THEN
    RAISE EXCEPTION '星星不足';
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

  FOR i IN 1..v_cards_per_open LOOP
    v_drawn_card_id := public.draw_pack_card_once(p_user_id, p_pack_id);
    v_drawn_cards := array_append(v_drawn_cards, v_drawn_card_id);
  END LOOP;

  RETURN v_drawn_cards;
END;
$$;

DROP FUNCTION IF EXISTS public.purchase_pack_multi(UUID, UUID, INTEGER);

CREATE FUNCTION public.purchase_pack_multi(p_user_id UUID, p_pack_id UUID, p_purchase_count INTEGER DEFAULT 1)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase_count INTEGER := greatest(coalesce(p_purchase_count, 1), 1);
  v_result UUID[] := ARRAY[]::UUID[];
  v_open_result UUID[];
BEGIN
  IF v_purchase_count > 20 THEN
    RAISE EXCEPTION '單次最多只能進行 20 次開包';
  END IF;

  FOR i IN 1..v_purchase_count LOOP
    v_open_result := public.purchase_pack(p_user_id, p_pack_id);
    v_result := v_result || v_open_result;
  END LOOP;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.draw_pack_card_once(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_pack(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_pack_multi(UUID, UUID, INTEGER) TO authenticated;
