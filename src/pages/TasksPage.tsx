import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { Task, TaskClaimStatus } from '../types'

export default function TasksPage() {
  const { user, refreshProfile } = useAuthStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskClaimStatus>>({})
  const [claimingTaskId, setClaimingTaskId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    loadTasks()
    loadTaskStatuses()
  }, [user])

  const loadTasks = async () => {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    if (data) setTasks(data as Task[])
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
      setMessage(data?.[0]?.message ?? `已完成任務「${task.title}」`)
    }
    setClaimingTaskId(null)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">任務列表</h1>
      {message && <p className="text-sm text-green-400">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {tasks.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <p>目前沒有可領取的任務</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {tasks.map(task => {
            const status = taskStatuses[task.id]
            const done = (status?.claim_count ?? 0) >= Math.max(task.per_period_limit, 1)
            return (
              <div key={task.id} className={`bg-slate-800 rounded-xl p-4 ${done ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{task.title}</h3>
                    <p className="text-sm text-slate-400 mt-1">{task.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                      <span>{task.points} 星星</span>
                      {task.allow_scanner && <span>可掃碼</span>}
                      {task.allow_button_claim && <span>可按鈕完成</span>}
                      {task.scan_window_enabled && task.window_start_time && task.window_end_time && (
                        <span>限時 {task.window_start_time.slice(0, 5)}-{task.window_end_time.slice(0, 5)}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => claimTask(task)}
                    disabled={done || !task.allow_button_claim || claimingTaskId === task.id}
                    className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer border-none whitespace-nowrap ${
                      done || !task.allow_button_claim
                        ? 'bg-slate-700 text-slate-500'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    {!task.allow_button_claim ? '需掃碼' : done ? '本期已完成' : claimingTaskId === task.id ? '處理中...' : '領取'}
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
