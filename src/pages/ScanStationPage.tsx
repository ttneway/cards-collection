import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScanLine, Power, UserCheck, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { ScanResolution } from '../types'

interface ActiveSession {
  id: string
  taskId: string
  title: string
}

interface AwardLog {
  id: string
  student: string
  task: string
  points: number
  message: string
  time: string
}

export default function ScanStationPage() {
  const navigate = useNavigate()
  const { refreshProfile } = useAuthStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const [code, setCode] = useState('')
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  const [message, setMessage] = useState('請先掃描任務條碼以開啟發點工作階段')
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<AwardLog[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    inputRef.current?.focus()
  }, [activeSession, message, error])

  const handleTaskCode = async (rawCode: string) => {
    const { data, error } = await supabase.rpc('toggle_task_session', { p_task_code: rawCode })
    if (error) throw new Error(error.message)
    const result = data?.[0]
    if (!result) throw new Error('任務工作階段沒有回應')

    if (result.action === 'closed') {
      setActiveSession(null)
    } else {
      setActiveSession({ id: result.session_id, taskId: result.task_id, title: result.task_title })
    }
    setMessage(result.message)
  }

  const handleStudentCode = async (rawCode: string) => {
    if (!activeSession) {
      throw new Error('請先掃描任務條碼開啟發點工作階段')
    }

    const { data, error } = await supabase.rpc('award_task_by_scan', {
      p_session_id: activeSession.id,
      p_student_scan_code: rawCode
    })
    if (error) throw new Error(error.message)
    const result = data?.[0]
    if (!result) throw new Error('發點沒有回應')

    await refreshProfile()
    setMessage(result.message)
    setLogs(previous => [
      {
        id: result.completion_id,
        student: result.student_name,
        task: result.task_title,
        points: result.points_awarded,
        message: result.message,
        time: new Date().toLocaleTimeString()
      },
      ...previous
    ].slice(0, 20))
  }

  const submitScan = async (event: React.FormEvent) => {
    event.preventDefault()
    const rawCode = code.trim()
    if (!rawCode || submitting) return
    setSubmitting(true)
    setError(null)
    setCode('')

    try {
      const { data, error } = await supabase.rpc('resolve_scan_code', { p_code: rawCode })
      if (error) throw new Error(error.message)
      const resolved = data?.[0] as ScanResolution | undefined
      if (!resolved) throw new Error('無法辨識此條碼')

      if (resolved.code_type === 'function' && resolved.action === 'create_task') {
        navigate('/teacher/tasks?mode=create')
        return
      }
      if (resolved.code_type === 'task') {
        await handleTaskCode(rawCode)
        return
      }
      if (resolved.code_type === 'student') {
        await handleStudentCode(rawCode)
      }
    } catch (e: any) {
      setError(e?.message || '掃描處理失敗')
    } finally {
      setSubmitting(false)
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">發點工作站</h1>
        <p className="text-sm text-slate-400 mt-1">外接掃描器會把條碼輸入到下方欄位並送出</p>
      </div>

      <div className={`rounded-lg p-4 border ${activeSession ? 'bg-green-900/20 border-green-600/40' : 'bg-slate-800 border-slate-700'}`}>
        <div className="flex items-center gap-3">
          {activeSession ? <Power size={22} className="text-green-400" /> : <ScanLine size={22} className="text-indigo-400" />}
          <div>
            <p className="font-semibold">{activeSession ? `開啟中：${activeSession.title}` : '尚未開啟任務'}</p>
            <p className="text-sm text-slate-400">{message}</p>
          </div>
        </div>
      </div>

      <form onSubmit={submitScan} className="bg-slate-800 rounded-lg p-4 space-y-3">
        <label className="block text-sm text-slate-400">掃描輸入</label>
        <input
          ref={inputRef}
          value={code}
          onChange={event => setCode(event.target.value)}
          disabled={submitting}
          className="w-full bg-slate-700 text-white rounded-lg px-4 py-3 border border-slate-600 focus:border-indigo-500 outline-none font-mono"
          placeholder="掃描任務條碼或學生身分條碼"
          autoFocus
        />
        {error && (
          <p className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle size={16} /> {error}
          </p>
        )}
      </form>

      <div className="bg-slate-800 rounded-lg p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <UserCheck size={18} className="text-amber-400" /> 最近發點
        </h2>
        {logs.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">尚無發點紀錄</p>
        ) : (
          <div className="space-y-2">
            {logs.map(log => (
              <div key={log.id} className="flex items-center justify-between gap-3 bg-slate-700/50 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{log.student}</p>
                  <p className="text-xs text-slate-400">{log.task} · {log.time}</p>
                </div>
                <span className="text-amber-400 font-semibold">+{log.points}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
