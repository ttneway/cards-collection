ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_original_url TEXT,
  ADD COLUMN IF NOT EXISTS avatar_generated_url TEXT;

UPDATE public.profiles
SET avatar_generated_url = avatar_url
WHERE avatar_generated_url IS NULL
  AND avatar_url IS NOT NULL;