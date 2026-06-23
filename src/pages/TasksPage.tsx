import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { Task, TaskClaimStatus } from '../types'

function formatCooldown(seconds: number) {
  if (seconds <= 0) return '可立即領取'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  if (hours > 0) {
    return `${hours} 小時 ${minutes} 分`
  }

  if (minutes > 0) {
    return `${minutes} 分 ${remainingSeconds} 秒`
  }

  return `${remainingSeconds} 秒`
}

export default function TasksPage() {
  const { user, refreshProfile } = useAuthStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskClaimStatus>>({})
  const [claimingTaskId, setClaimingTaskId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    void loadTasks()
    void loadTaskStatuses()
  }, [user])

  const loadTasks = async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    setTasks((data ?? []) as Task[])
  }

  const loadTaskStatuses = async () => {
    const { data, error } = await supabase.rpc('get_my_task_claim_statuses')
    if (error) {
      setError(error.message)
      return
    }

    const rows = (data ?? []) as TaskClaimStatus[]
    setTaskStatuses(
      rows.reduce<Record<string, TaskClaimStatus>>((accumulator, row) => {
        accumulator[row.task_id] = row
        return accumulator
      }, {})
    )
  }

  const claimTask = async (task: Task) => {
    if (!user) return

    setClaimingTaskId(task.id)
    setMessage(null)
    setError(null)

    const { data, error } = await supabase.rpc('claim_task_by_user_action', {
      p_task_id: task.id,
      p_method: 'button'
    })

    if (error) {
      setError(error.message)
    } else {
      await refreshProfile()
      await loadTaskStatuses()
      setMessage(data?.[0]?.message ?? `已完成「${task.title}」`)
    }

    setClaimingTaskId(null)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">任務</h1>
      {message && <p className="text-sm text-green-400">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {tasks.length === 0 ? (
        <div className="py-12 text-center text-slate-500">
          <p>目前還沒有可領取的任務。</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {tasks.map(task => {
            const status = taskStatuses[task.id]
            const periodLimitReached = (status?.claim_count ?? 0) >= Math.max(task.per_period_limit, 1)
            const cooldownRemaining = Math.max(status?.cooldown_remaining_seconds ?? 0, 0)
            const cooldownActive = cooldownRemaining > 0
            const disabled = periodLimitReached || cooldownActive || !task.allow_button_claim || claimingTaskId === task.id

            return (
              <div key={task.id} className={`rounded-xl bg-slate-800 p-4 ${disabled ? 'opacity-70' : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{task.title}</h3>
                    <p className="mt-1 text-sm text-slate-400">{task.description || '尚無描述'}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>{task.points} 點</span>
                      {task.allow_scanner && <span>可掃碼</span>}
                      {task.allow_button_claim && <span>可按鈕完成</span>}
                      {task.claim_cooldown_minutes > 0 && <span>冷卻 {task.claim_cooldown_minutes} 分鐘</span>}
                      {task.scan_window_enabled && task.window_start_time && task.window_end_time && (
                        <span>
                          開放 {task.window_start_time.slice(0, 5)}-{task.window_end_time.slice(0, 5)}
                        </span>
                      )}
                    </div>
                    {periodLimitReached && (
                      <p className="mt-2 text-xs text-amber-300">本週期已達領取上限。</p>
                    )}
                    {!periodLimitReached && cooldownActive && (
                      <p className="mt-2 text-xs text-amber-300">
                        冷卻中，還要等待 {formatCooldown(cooldownRemaining)}。
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => claimTask(task)}
                    disabled={disabled}
                    className={`whitespace-nowrap rounded-lg border-none px-4 py-2 text-sm font-medium ${
                      disabled
                        ? 'bg-slate-700 text-slate-500'
                        : 'cursor-pointer bg-indigo-600 text-white hover:bg-indigo-500'
                    }`}
                  >
                    {!task.allow_button_claim
                      ? '需掃碼'
                      : periodLimitReached
                        ? '本期已完成'
                        : cooldownActive
                          ? '冷卻中'
                          : claimingTaskId === task.id
                            ? '處理中...'
                            : '領取'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
