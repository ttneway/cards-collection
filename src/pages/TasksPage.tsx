import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { Task } from '../types'

interface CompletionStatusRow {
  task_id: string
  period_key: string | null
}

const getCurrentPeriodKey = (task: Task) => {
  const now = new Date()
  const taipei = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now)

  const getPart = (type: string) => taipei.find(part => part.type === type)?.value ?? ''
  const year = Number(getPart('year'))
  const month = Number(getPart('month'))

  if (task.recurrence_type === 'daily') {
    return `${year}-${getPart('month')}-${getPart('day')}`
  }

  if (task.recurrence_type === 'weekly') {
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', weekday: 'short' }).format(now)
    const weekdayOffset = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday)
    const mondayOffset = weekdayOffset === 0 ? -6 : 1 - weekdayOffset
    const monday = new Date(now)
    monday.setDate(now.getDate() + mondayOffset)
    const weekYear = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric' }).format(monday)
    const firstThursday = new Date(Date.UTC(Number(weekYear), 0, 4))
    const currentThursday = new Date(monday)
    currentThursday.setDate(monday.getDate() + 3)
    const diffDays = Math.floor((currentThursday.getTime() - firstThursday.getTime()) / 86400000)
    const week = String(1 + Math.floor(diffDays / 7)).padStart(2, '0')
    return `${weekYear}-W${week}`
  }

  if (task.recurrence_type === 'semester') {
    return `${year}-${month >= 2 && month <= 7 ? 'S2' : 'S1'}`
  }

  if (task.recurrence_type === 'custom') {
    const days = Math.max(task.custom_reset_days ?? 1, 1)
    return `C${Math.floor(Date.now() / (days * 86400000))}`
  }

  return 'once'
}

export default function TasksPage() {
  const { user, refreshProfile } = useAuthStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [completedRows, setCompletedRows] = useState<CompletionStatusRow[]>([])
  const [claimingTaskId, setClaimingTaskId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    supabase.from('tasks').select('*').eq('is_active', true).order('created_at', { ascending: false }).then(({ data }) => {
      if (data) setTasks(data as Task[])
    })
    supabase.from('task_completions').select('task_id, period_key').eq('user_id', user.id).then(({ data }) => {
      if (data) setCompletedRows(data as CompletionStatusRow[])
    })
  }, [user])

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
      const result = data?.[0]
      await refreshProfile()
      setCompletedRows(previous => [...previous, { task_id: task.id, period_key: result?.period_key ?? getCurrentPeriodKey(task) }])
      setMessage(result?.message ?? `已完成任務「${task.title}」`)
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
            const currentPeriodKey = getCurrentPeriodKey(task)
            const done = completedRows.some(row => row.task_id === task.id && (row.period_key ?? 'once') === currentPeriodKey)
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
