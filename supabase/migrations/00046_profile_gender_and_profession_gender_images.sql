ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender TEXT
  CHECK (gender IN ('male', 'female'));

ALTER TABLE public.profession_templates
  ADD COLUMN IF NOT EXISTS icon_url_male TEXT,
  ADD COLUMN IF NOT EXISTS icon_url_female TEXT;
