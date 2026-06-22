ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS scan_station_enabled BOOLEAN NOT NULL DEFAULT true;

UPDATE public.tasks
SET scan_station_enabled = true
WHERE scan_station_enabled IS DISTINCT FROM true;
