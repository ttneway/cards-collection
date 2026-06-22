ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hide_high_rarity_announcements BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.draw_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  pack_id UUID REFERENCES public.card_packs(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  is_name_hidden BOOLEAN NOT NULL DEFAULT false,
  rarity TEXT NOT NULL CHECK (rarity IN ('SSR', 'UR')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 day')
);

CREATE INDEX IF NOT EXISTS idx_draw_announcements_active
  ON public.draw_announcements (expires_at DESC, created_at DESC);

ALTER TABLE public.draw_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS draw_announcements_select_active ON public.draw_announcements;
CREATE POLICY draw_announcements_select_active
  ON public.draw_announcements
  FOR SELECT
  TO authenticated
  USING (expires_at > NOW());

CREATE OR REPLACE FUNCTION public.create_draw_announcement(
  p_user_id UUID,
  p_card_id UUID,
  p_pack_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
  v_hide_name BOOLEAN;
  v_display_name TEXT;
  v_rarity TEXT;
  v_announcement_id UUID;
BEGIN
  SELECT name, hide_high_rarity_announcements
  INTO v_name, v_hide_name
  FROM public.profiles
  WHERE id = p_user_id;

  SELECT rarity
  INTO v_rarity
  FROM public.cards
  WHERE id = p_card_id
    AND is_active = true;

  IF v_rarity NOT IN ('SSR', 'UR') THEN
    RETURN NULL;
  END IF;

  v_display_name := CASE
    WHEN COALESCE(v_hide_name, false) THEN '神秘同學'
    ELSE COALESCE(NULLIF(trim(v_name), ''), '匿名同學')
  END;

  INSERT INTO public.draw_announcements (
    user_id,
    card_id,
    pack_id,
    display_name,
    is_name_hidden,
    rarity,
    expires_at
  )
  VALUES (
    p_user_id,
    p_card_id,
    p_pack_id,
    v_display_name,
    COALESCE(v_hide_name, false),
    v_rarity,
    NOW() + INTERVAL '1 day'
  )
  RETURNING id INTO v_announcement_id;

  RETURN v_announcement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_draw_announcement(UUID, UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_active_draw_announcements()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  card_id UUID,
  display_name TEXT,
  is_name_hidden BOOLEAN,
  rarity TEXT,
  card_name TEXT,
  card_series TEXT,
  card_color TEXT,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    da.id,
    da.user_id,
    da.card_id,
    da.display_name,
    da.is_name_hidden,
    da.rarity,
    c.name AS card_name,
    c.series AS card_series,
    c.color AS card_color,
    da.created_at,
    da.expires_at
  FROM public.draw_announcements da
  JOIN public.cards c ON c.id = da.card_id
  WHERE da.expires_at > NOW()
  ORDER BY da.created_at DESC
  LIMIT 12;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_draw_announcements() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'draw_announcements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.draw_announcements;
  END IF;
END;
$$;

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
    RAISE EXCEPTION '找不到可抽取的卡包。';
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
    RAISE EXCEPTION '這個卡包目前沒有可抽取的卡片。';
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
    RAISE EXCEPTION '抽卡失敗，請稍後再試。';
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

  PERFORM public.create_draw_announcement(p_user_id, v_selected_card_id, p_pack_id);

  RETURN v_selected_card_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_pack(UUID, UUID) TO authenticated;
