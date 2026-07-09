-- Fix inflated per-period claim counts caused by joining current-period rows
-- with all historical completions in get_my_task_claim_statuses().

CREATE OR REPLACE FUNCTION public.get_my_task_claim_statuses()
RETURNS TABLE(
  task_id UUID,
  period_key TEXT,
  claim_count BIGINT,
  latest_completed_at TIMESTAMPTZ,
  next_claim_at TIMESTAMPTZ,
  cooldown_remaining_seconds INTEGER
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT p.class_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
  ),
  task_status AS (
    SELECT
      t.id AS task_id,
      public.current_period_key_for_task_row(t) AS period_key,
      count(DISTINCT tc_period.id) AS claim_count,
      max(tc_all.completed_at) AS latest_completed_at,
      t.claim_cooldown_minutes
    FROM public.tasks t
    CROSS JOIN me
    LEFT JOIN public.task_completions tc_period
      ON tc_period.task_id = t.id
     AND tc_period.user_id = auth.uid()
     AND tc_period.status IN ('pending', 'approved')
     AND coalesce(tc_period.period_key, 'once') = public.current_period_key_for_task_row(t)
    LEFT JOIN public.task_completions tc_all
      ON tc_all.task_id = t.id
     AND tc_all.user_id = auth.uid()
     AND tc_all.status IN ('pending', 'approved')
    WHERE auth.uid() IS NOT NULL
      AND t.is_active = true
      AND public.task_applies_to_class(t.id, me.class_id)
    GROUP BY t.id, public.current_period_key_for_task_row(t), t.claim_cooldown_minutes
  )
  SELECT
    task_status.task_id,
    task_status.period_key,
    task_status.claim_count,
    task_status.latest_completed_at,
    public.task_next_claim_at(task_status.latest_completed_at, task_status.claim_cooldown_minutes) AS next_claim_at,
    greatest(
      coalesce(
        ceil(extract(epoch FROM (
          public.task_next_claim_at(task_status.latest_completed_at, task_status.claim_cooldown_minutes) - NOW()
        ))),
        0
      ),
      0
    )::INTEGER AS cooldown_remaining_seconds
  FROM task_status;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_task_claim_statuses() TO authenticated;
