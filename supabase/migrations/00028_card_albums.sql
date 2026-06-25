CREATE TABLE IF NOT EXISTS public.card_albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  cover_color TEXT NOT NULL DEFAULT '#334155',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS album_id UUID REFERENCES public.card_albums(id) ON DELETE SET NULL;

INSERT INTO public.card_albums (name, description, cover_color)
SELECT DISTINCT
  COALESCE(NULLIF(trim(series), ''), '未分類') AS name,
  '',
  '#334155'
FROM public.cards
ON CONFLICT (name) DO NOTHING;

UPDATE public.cards c
SET album_id = a.id,
    series = a.name
FROM public.card_albums a
WHERE a.name = COALESCE(NULLIF(trim(c.series), ''), '未分類')
  AND c.album_id IS NULL;

ALTER TABLE public.card_albums ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS card_albums_read_active ON public.card_albums;
CREATE POLICY card_albums_read_active
ON public.card_albums
FOR SELECT
USING (is_active OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS card_albums_manage_staff ON public.card_albums;
CREATE POLICY card_albums_manage_staff
ON public.card_albums
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('teacher', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('teacher', 'admin')
  )
);

CREATE INDEX IF NOT EXISTS idx_cards_album_id ON public.cards(album_id);

CREATE OR REPLACE FUNCTION public.sync_card_series_from_album()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_album_name TEXT;
BEGIN
  IF NEW.album_id IS NOT NULL THEN
    SELECT name
    INTO v_album_name
    FROM public.card_albums
    WHERE id = NEW.album_id;

    NEW.series := COALESCE(v_album_name, COALESCE(NULLIF(trim(NEW.series), ''), '未分類'));
  ELSE
    NEW.series := COALESCE(NULLIF(trim(NEW.series), ''), '未分類');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_card_series_from_album_trigger ON public.cards;
CREATE TRIGGER sync_card_series_from_album_trigger
BEFORE INSERT OR UPDATE ON public.cards
FOR EACH ROW
EXECUTE FUNCTION public.sync_card_series_from_album();

CREATE OR REPLACE FUNCTION public.sync_album_name_to_cards()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.cards
  SET series = NEW.name
  WHERE album_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_album_name_to_cards_trigger ON public.card_albums;
CREATE TRIGGER sync_album_name_to_cards_trigger
AFTER UPDATE OF name ON public.card_albums
FOR EACH ROW
EXECUTE FUNCTION public.sync_album_name_to_cards();
