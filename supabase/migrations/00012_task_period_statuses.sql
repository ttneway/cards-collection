-- Use one server-side source of truth for recurring task claim availability.

CREATE OR REPLACE FUNCTION public.current_period_key_for_task_row(p_task public.tasks)
RETURNS TEXT
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT public.period_key_for_task(p_task.recurrence_type, NOW(), p_task.custom_reset_days)
$$;

CREATE OR REPLACE FUNCTION public.get_my_task_claim_statuses()
RETURNS TABLE(task_id UUID, period_key TEXT, claim_count BIGINT, latest_completed_at TIMESTAMPTZ)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id AS task_id,
    public.current_period_key_for_task_row(t) AS period_key,
    count(tc.id) AS claim_count,
    max(tc.completed_at) AS latest_completed_at
  FROM public.tasks t
  LEFT JOIN public.task_completions tc
    ON tc.task_id = t.id
   AND tc.user_id = auth.uid()
   AND tc.status IN ('pending', 'approved')
   AND coalesce(tc.period_key, 'once') = public.current_period_key_for_task_row(t)
  WHERE auth.uid() IS NOT NULL
  GROUP BY t.id, public.current_period_key_for_task_row(t);
$$;

GRANT EXECUTE ON FUNCTION public.get_my_task_claim_statuses() TO authenticated;
