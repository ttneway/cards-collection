import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { Task } from '../types'

export default function TasksPage() {
  const { user, refreshProfile } = useAuthStore()
  const [tasks, setTasks] = useState<(Task & { completed?: boolean })[]>([])
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!user) return
    supabase.from('tasks').select('*').eq('is_active', true).order('created_at', { ascending: false }).then(({ data }) => {
      if (data) setTasks(data as Task[])
    })
    supabase.from('task_completions').select('task_id').eq('user_id', user.id).then(({ data }) => {
      if (data) setCompletedIds(new Set(data.map(t => t.task_id)))
    })
  }, [user])

  const claimTask = async (task: Task) => {
    if (!user) return
    const { error } = await supabase.from('task_completions').insert({
      task_id: task.id,
      user_id: user.id,
      status: task.type === 'scan' ? 'approved' : 'pending'
    })
    if (!error) {
      if (task.type === 'scan') {
        await supabase.rpc('award_task_points', { p_user_id: user.id, p_task_id: task.id })
        await refreshProfile()
      }
      setCompletedIds(new Set([...completedIds, task.id]))
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">任務列表</h1>

      {tasks.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <p>目前沒有可領取的任務</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {tasks.map(task => {
            const done = completedIds.has(task.id)
            return (
              <div key={task.id} className={`bg-slate-800 rounded-xl p-4 ${done ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{task.title}</h3>
                    <p className="text-sm text-slate-400 mt-1">{task.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                      <span>{task.points} 星星</span>
                      {task.task_code && <span>任務碼: {task.task_code}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => claimTask(task)}
                    disabled={done}
                    className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer border-none whitespace-nowrap ${
                      done
                        ? 'bg-slate-700 text-slate-500'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    {done ? '已領取' : '領取'}
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
