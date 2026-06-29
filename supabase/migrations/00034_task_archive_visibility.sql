ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS archive_after_days INTEGER NOT NULL DEFAULT 7
  CHECK (archive_after_days >= 0);

CREATE OR REPLACE FUNCTION public.task_visible_until(p_task public.tasks)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_task.ends_at IS NULL THEN NULL
    ELSE p_task.ends_at + make_interval(days => greatest(coalesce(p_task.archive_after_days, 7), 0))
  END;
$$;

CREATE OR REPLACE FUNCTION public.task_is_displayable(p_task public.tasks, p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_task.is_active = true
    AND (p_task.starts_at IS NULL OR p_now >= p_task.starts_at)
    AND (
      p_task.ends_at IS NULL
      OR p_now <= public.task_visible_until(p_task)
    );
$$;

CREATE OR REPLACE FUNCTION public.task_is_currently_open(p_task public.tasks, p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_task.is_active = true
    AND (p_task.starts_at IS NULL OR p_now >= p_task.starts_at)
    AND (p_task.ends_at IS NULL OR p_now <= p_task.ends_at);
$$;

DROP FUNCTION IF EXISTS public.list_active_scan_tasks();

CREATE OR REPLACE FUNCTION public.list_active_scan_tasks()
RETURNS TABLE(
  task_id UUID,
  title TEXT,
  description TEXT,
  points INTEGER,
  task_code TEXT,
  recurrence_type TEXT,
  scan_station_enabled BOOLEAN,
  scan_window_enabled BOOLEAN,
  window_start_time TIME,
  window_end_time TIME,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  activation_source TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH auto_tasks AS (
    SELECT
      t.id AS task_id,
      t.title,
      t.description,
      t.points,
      t.task_code,
      t.recurrence_type::TEXT AS recurrence_type,
      t.scan_station_enabled,
      t.scan_window_enabled,
      t.window_start_time,
      t.window_end_time,
      t.starts_at,
      t.ends_at,
      'auto'::TEXT AS activation_source
    FROM public.tasks t
    WHERE public.task_is_currently_open(t)
      AND t.allow_scanner = true
      AND t.scan_station_enabled = true
  ),
  session_tasks AS (
    SELECT
      t.id AS task_id,
      t.title,
      t.description,
      t.points,
      t.task_code,
      t.recurrence_type::TEXT AS recurrence_type,
      t.scan_station_enabled,
      t.scan_window_enabled,
      t.window_start_time,
      t.window_end_time,
      t.starts_at,
      t.ends_at,
      'session'::TEXT AS activation_source
    FROM public.tasks t
    INNER JOIN public.task_sessions ts
      ON ts.task_id = t.id
     AND ts.is_active = true
    WHERE public.task_is_currently_open(t)
      AND t.allow_scanner = true
  )
  SELECT DISTINCT ON (combined.task_id)
    combined.task_id,
    combined.title,
    combined.description,
    combined.points,
    combined.task_code,
    combined.recurrence_type,
    combined.scan_station_enabled,
    combined.scan_window_enabled,
    combined.window_start_time,
    combined.window_end_time,
    combined.starts_at,
    combined.ends_at,
    combined.activation_source
  FROM (
    SELECT * FROM auto_tasks
    UNION ALL
    SELECT * FROM session_tasks
  ) AS combined
  ORDER BY combined.task_id, CASE combined.activation_source WHEN 'auto' THEN 0 ELSE 1 END;
$$;
