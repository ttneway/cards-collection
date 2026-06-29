import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { Task, TaskClaimStatus } from '../types'

type TaskWithClasses = Task & {
  task_classes?: Array<{
    class_id: string
  }>
}

function formatCooldown(seconds: number) {
  if (seconds <= 0) return '無冷卻時間'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  if (hours > 0) {
    return remainingSeconds === 0 && minutes === 0
      ? `${hours} 小時`
      : `${hours} 小時 ${minutes} 分`
  }

  if (minutes > 0) {
    return remainingSeconds === 0 ? `${minutes} 分鐘` : `${minutes} 分 ${remainingSeconds} 秒`
  }

  return `${remainingSeconds} 秒`
}

function getTaskClassIds(task: TaskWithClasses) {
  if (task.task_classes && task.task_classes.length > 0) {
    return task.task_classes.map(item => item.class_id)
  }

  return task.class_id ? [task.class_id] : []
}

function taskMatchesUserClass(task: TaskWithClasses, classId: string | null) {
  if (task.scope_type === 'school') return true
  if (!classId) return false
  return getTaskClassIds(task).includes(classId)
}

function isTaskDisplayable(task: TaskWithClasses) {
  const now = new Date()

  if (task.starts_at && now < new Date(task.starts_at)) return false
  if (!task.ends_at) return true

  const hiddenAt = new Date(task.ends_at)
  hiddenAt.setDate(hiddenAt.getDate() + Math.max(task.archive_after_days ?? 7, 0))
  return now <= hiddenAt
}

export default function TasksPage() {
  const { user, refreshProfile } = useAuthStore()
  const [tasks, setTasks] = useState<TaskWithClasses[]>([])
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskClaimStatus>>({})
  const [claimingTaskId, setClaimingTaskId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const visibleTasks = useMemo(() => {
    if (!user) return []

    if (user.role === 'teacher' || user.role === 'admin') {
      return tasks.filter(isTaskDisplayable)
    }

    return tasks.filter(task => taskMatchesUserClass(task, user.class_id) && isTaskDisplayable(task))
  }, [tasks, user])

  useEffect(() => {
    if (!user) return
    void loadTasks()
    void loadTaskStatuses()
  }, [user])

  const loadTasks = async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*, task_classes(class_id)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    setTasks((data ?? []) as TaskWithClasses[])
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

  const claimTask = async (task: TaskWithClasses) => {
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
      {message ? <p className="text-sm text-green-400">{message}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {visibleTasks.length === 0 ? (
        <div className="py-12 text-center text-slate-500">
          <p>目前沒有可領取的任務。</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {visibleTasks.map(task => {
            const status = taskStatuses[task.id]
            const periodLimitReached = (status?.claim_count ?? 0) >= Math.max(task.per_period_limit, 1)
            const cooldownRemaining = Math.max(status?.cooldown_remaining_seconds ?? 0, 0)
            const cooldownActive = cooldownRemaining > 0
            const disabled =
              periodLimitReached ||
              cooldownActive ||
              !task.allow_button_claim ||
              claimingTaskId === task.id

            return (
              <div key={task.id} className={`rounded-xl bg-slate-800 p-4 ${disabled ? 'opacity-70' : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{task.title}</h3>
                    <p className="mt-1 text-sm text-slate-400">{task.description || '尚無描述'}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>{task.points} 點</span>
                      <span>{task.scope_type === 'school' ? '全校任務' : '班級任務'}</span>
                      {task.allow_scanner ? <span>可掃碼</span> : null}
                      {task.allow_button_claim ? <span>可按鈕完成</span> : null}
                      {task.claim_cooldown_minutes > 0 ? (
                        <span>冷卻 {task.claim_cooldown_minutes} 分鐘</span>
                      ) : null}
                      {task.scan_window_enabled && task.window_start_time && task.window_end_time ? (
                        <span>
                          開放時間 {task.window_start_time.slice(0, 5)}-{task.window_end_time.slice(0, 5)}
                        </span>
                      ) : null}
                    </div>
                    {periodLimitReached ? (
                      <p className="mt-2 text-xs text-amber-300">本週期已達領取上限</p>
                    ) : null}
                    {!periodLimitReached && cooldownActive ? (
                      <p className="mt-2 text-xs text-amber-300">
                        冷卻中，還要等待 {formatCooldown(cooldownRemaining)}
                      </p>
                    ) : null}
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
                      ? '僅限掃碼'
                      : periodLimitReached
                        ? '已達上限'
                        : cooldownActive
                          ? '冷卻中'
                          : claimingTaskId === task.id
                            ? '領取中...'
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
