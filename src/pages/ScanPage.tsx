import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useScanner } from '../utils/scanner'
import { Camera, ScanLine } from 'lucide-react'

export default function ScanPage() {
  const { user } = useAuthStore()
  const { result, error, scanning, startScanning, stopScanning } = useScanner()
  const [taskCode, setTaskCode] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    return () => { stopScanning() }
  }, [])

  useEffect(() => {
    if (result) {
      setTaskCode(result)
    }
  }, [result])

  const claimTask = async () => {
    if (!taskCode.trim() || !user) return
    setClaiming(true)
    setMessage(null)

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('task_code', taskCode.trim())
      .eq('is_active', true)
      .single()

    if (taskError || !task) {
      setMessage('找不到此任務碼，請確認是否正確')
      setClaiming(false)
      return
    }

    const { error: completeError } = await supabase.from('task_completions').insert({
      task_id: task.id,
      user_id: user.id,
      status: task.type === 'scan' ? 'approved' : 'pending'
    })

    if (completeError) {
      setMessage('領取失敗，請稍後再試')
    } else {
      if (task.type === 'scan') {
        await supabase.rpc('award_task_points', { p_user_id: user.id, p_task_id: task.id })
        setMessage(`成功領取任務「${task.title}」，獲得 ${task.points} 星星！`)
      } else {
        setMessage(`成功提交任務「${task.title}」，待審核中`)
      }
    }
    setClaiming(false)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">掃碼領取</h1>

      {message && (
        <div className="bg-slate-800 border border-indigo-600/30 rounded-xl p-4 text-sm">
          {message}
        </div>
      )}

      <div className="bg-slate-800 rounded-xl p-6 text-center">
        {scanning ? (
          <div id="scanner-container" className="w-full aspect-square max-w-xs mx-auto rounded-xl overflow-hidden" />
        ) : (
          <div className="w-full aspect-square max-w-xs mx-auto rounded-xl bg-slate-700 flex items-center justify-center">
            <Camera size={48} className="text-slate-500" />
          </div>
        )}
        <button
          onClick={() => scanning ? stopScanning() : startScanning('scanner-container')}
          className={`mt-4 px-6 py-2 rounded-lg text-sm font-medium cursor-pointer border-none ${
            scanning ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
          }`}
        >
          {scanning ? '關閉相機' : '開啟相機掃描'}
        </button>
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-700" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-slate-900 px-2 text-slate-500">或手動輸入任務碼</span>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={taskCode}
          onChange={e => setTaskCode(e.target.value)}
          placeholder="請輸入任務碼"
          className="flex-1 bg-slate-800 text-white rounded-lg px-4 py-2 border border-slate-700 focus:border-indigo-500 outline-none"
        />
        <button
          onClick={claimTask}
          disabled={claiming || !taskCode.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-6 py-2 rounded-lg font-medium cursor-pointer disabled:cursor-not-allowed border-none flex items-center gap-2"
        >
          <ScanLine size={18} />
          {claiming ? '處理中...' : '領取'}
        </button>
      </div>
    </div>
  )
}
