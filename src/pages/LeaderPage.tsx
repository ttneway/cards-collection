import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { CheckCircle2, XCircle, Clock, Star } from 'lucide-react'

export default function LeaderPage() {
  const { user } = useAuthStore()
  const [pendingCompletions, setPendingCompletions] = useState<any[]>([])

  useEffect(() => {
    loadPending()
  }, [])

  const loadPending = async () => {
    const { data } = await supabase
      .from('task_completions')
      .select('*, task:tasks(*), user:user_id(id, name, student_id)')
      .eq('status', 'pending')
      .order('completed_at', { ascending: false })
    if (data) setPendingCompletions(data)
  }

  const approve = async (completionId: string, taskId: string, userId: string, _points: number) => {
    await supabase
      .from('task_completions')
      .update({ status: 'approved', approved_by: user?.id })
      .eq('id', completionId)
    await supabase.rpc('award_task_points', { p_user_id: userId, p_task_id: taskId })
    loadPending()
  }

  const reject = async (completionId: string) => {
    await supabase
      .from('task_completions')
      .update({ status: 'rejected', approved_by: user?.id })
      .eq('id', completionId)
    loadPending()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">幹部面板</h1>

      <div className="bg-slate-800 rounded-xl p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Clock size={18} className="text-amber-400" />
          待審核任務
        </h2>

        {pendingCompletions.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-6">目前沒有待審核的任務</p>
        ) : (
          <div className="space-y-3">
            {pendingCompletions.map(pc => (
              <div key={pc.id} className="bg-slate-700/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-medium text-sm">{pc.task?.title}</p>
                    <p className="text-xs text-slate-400">{pc.user?.name} ({pc.user?.student_id})</p>
                  </div>
                  <div className="flex items-center gap-1 text-amber-400 text-sm">
                    <Star size={14} fill="currentColor" />
                    <span>{pc.task?.points}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => approve(pc.id, pc.task_id, pc.user_id, pc.task?.points ?? 0)}
                    className="flex-1 bg-green-600 hover:bg-green-500 text-white rounded-lg py-1.5 text-sm font-medium cursor-pointer border-none flex items-center justify-center gap-1"
                  >
                    <CheckCircle2 size={16} /> 核准
                  </button>
                  <button
                    onClick={() => reject(pc.id)}
                    className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded-lg py-1.5 text-sm font-medium cursor-pointer border-none flex items-center justify-center gap-1"
                  >
                    <XCircle size={16} /> 駁回
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
