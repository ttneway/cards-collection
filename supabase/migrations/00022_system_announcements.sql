CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('system', 'task')),
  source_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  auto_created BOOLEAN NOT NULL DEFAULT false,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_created_at
  ON public.announcements (is_pinned DESC, created_at DESC);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS announcements_select_active ON public.announcements;
CREATE POLICY announcements_select_active
  ON public.announcements
  FOR SELECT
  TO authenticated
  USING (expires_at IS NULL OR expires_at > NOW());

DROP POLICY IF EXISTS announcements_manage_admin ON public.announcements;
CREATE POLICY announcements_manage_admin
  ON public.announcements
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION public.get_home_announcements()
RETURNS TABLE (
  id UUID,
  title TEXT,
  body TEXT,
  category TEXT,
  source_task_id UUID,
  created_by UUID,
  auto_created BOOLEAN,
  is_pinned BOOLEAN,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id,
    title,
    body,
    category,
    source_task_id,
    created_by,
    auto_created,
    is_pinned,
    expires_at,
    created_at
  FROM public.announcements
  WHERE expires_at IS NULL OR expires_at > NOW()
  ORDER BY is_pinned DESC, created_at DESC
  LIMIT 8;
$$;

GRANT EXECUTE ON FUNCTION public.get_home_announcements() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_task_announcement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.announcements (
    title,
    body,
    category,
    source_task_id,
    created_by,
    auto_created,
    is_pinned
  )
  VALUES (
    '新任務上線：' || NEW.title,
    CASE
      WHEN COALESCE(NULLIF(trim(NEW.description), ''), '') = '' THEN
        '新的任務已上線，快去看看可以獲得多少點數。'
      ELSE
        NEW.description
    END,
    'task',
    NEW.id,
    NEW.created_by,
    true,
    false
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_create_task_announcement ON public.tasks;
CREATE TRIGGER trigger_create_task_announcement
AFTER INSERT ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.create_task_announcement();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'announcements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
  END IF;
END;
$$;
