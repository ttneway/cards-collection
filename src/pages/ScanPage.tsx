import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, RefreshCcw, ScanLine, Sparkles, UserRoundCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useScanner } from '../utils/scanner'
import type { Task } from '../types'

interface ClaimLog {
  id: string
  student: string
  task: string
  points: number
  time: string
}

interface PublicClaimResult {
  completion_id: string
  student_id: string
  student_name: string
  task_title: string
  points_awarded: number
  period_key: string
  message: string
}

export default function ScanPage() {
  const { result, error: scannerError, scanning, startScanning, stopScanning } = useScanner()
  const taskInputRef = useRef<HTMLInputElement>(null)
  const studentInputRef = useRef<HTMLInputElement>(null)
  const [scannerMode, setScannerMode] = useState<'task' | 'student' | null>(null)
  const [taskCode, setTaskCode] = useState('')
  const [studentCode, setStudentCode] = useState('')
  const [task, setTask] = useState<Task | null>(null)
  const [loadingTask, setLoadingTask] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<ClaimLog[]>([])

  useEffect(() => {
    taskInputRef.current?.focus()
    return () => { stopScanning() }
  }, [])

  useEffect(() => {
    if (!result) return

    if (scannerMode === 'student' && task) {
      setStudentCode(result)
      void claimTask(result)
      return
    }

    setTaskCode(result)
    void loadTask(result)
  }, [result, scannerMode, task])

  useEffect(() => {
    if (task) {
      studentInputRef.current?.focus()
    } else {
      taskInputRef.current?.focus()
    }
  }, [task])

  const loadTask = async (rawCode = taskCode) => {
    const code = rawCode.trim()
    if (!code || loadingTask) return

    setLoadingTask(true)
    setError(null)
    setMessage(null)

    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('task_code', code)
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      setError(error.message)
      setTask(null)
      setLoadingTask(false)
      return
    }

    const nextTask = data as Task | null
    if (!nextTask) {
      setError('找不到這個任務條碼')
      setTask(null)
      setLoadingTask(false)
      return
    }

    if (!nextTask.allow_scanner) {
      setError('這個任務目前不開放掃碼領取')
      setTask(null)
      setLoadingTask(false)
      return
    }

    setTask(nextTask)
    setTaskCode(code)
    setStudentCode('')
    setMessage(`已選擇任務「${nextTask.title}」，請再掃學生身分條碼`)
    setLoadingTask(false)
  }

  const resetTask = () => {
    setTask(null)
    setTaskCode('')
    setStudentCode('')
    setError(null)
    setMessage(null)
    setScannerMode(null)
    window.setTimeout(() => taskInputRef.current?.focus(), 0)
  }

  const claimTask = async (rawStudentCode = studentCode) => {
    if (!task) {
      setError('請先掃任務條碼')
      return
    }

    const code = rawStudentCode.trim()
    if (!code || claiming) return

    setClaiming(true)
    setError(null)
    setMessage(null)

    const { data, error } = await supabase.rpc('claim_task_by_public_scan', {
      p_task_code: task.task_code,
      p_student_scan_code: code
    })

    if (error) {
      setError(error.message)
      setClaiming(false)
      return
    }

    const claim = data?.[0] as PublicClaimResult | undefined
    if (!claim) {
      setError('掃碼完成，但沒有收到回應資料')
      setClaiming(false)
      return
    }

    setMessage(claim.message)
    setStudentCode('')
    setLogs(previous => [
      {
        id: claim.completion_id,
        student: claim.student_name,
        task: claim.task_title,
        points: claim.points_awarded,
        time: new Date().toLocaleTimeString()
      },
      ...previous
    ].slice(0, 10))
    setClaiming(false)
    window.setTimeout(() => studentInputRef.current?.focus(), 0)
  }

  const handleTaskSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    await loadTask()
  }

  const handleStudentSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    await claimTask()
  }

  const openScanner = async (mode: 'task' | 'student') => {
    setScannerMode(mode)
    setError(null)
    setMessage(null)
    if (scanning) {
      await stopScanning()
    }
    await startScanning('public-scan-reader')
  }

  return (
    <div className="min-h-dvh bg-slate-900 text-white">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 font-semibold">
              <Sparkles size={18} />
              校園集卡牌
            </div>
            <h1 className="text-2xl font-bold mt-2">免登入掃碼領取</h1>
            <p className="text-sm text-slate-400 mt-1">先掃任務條碼，再掃學生身分條碼。</p>
          </div>
          <Link to="/auth" className="text-sm text-slate-300 hover:text-white no-underline">
            返回登入
          </Link>
        </div>

        {(message || error || scannerError) && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${
            error || scannerError
              ? 'border-red-500/30 bg-red-500/10 text-red-300'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          }`}>
            {error || scannerError || message}
          </div>
        )}

        <div className="bg-slate-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">1. 任務條碼</h2>
              <p className="text-sm text-slate-400">支援外接掃描器輸入或相機掃描。</p>
            </div>
            {task && (
              <button
                type="button"
                onClick={resetTask}
                className="inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-3 py-2 text-sm border-none cursor-pointer"
              >
                <RefreshCcw size={16} />
                更換任務
              </button>
            )}
          </div>

          <form onSubmit={handleTaskSubmit} className="flex flex-col gap-3 sm:flex-row">
            <input
              ref={taskInputRef}
              value={taskCode}
              onChange={event => setTaskCode(event.target.value)}
              disabled={loadingTask || !!task}
              placeholder="請掃任務條碼"
              className="flex-1 bg-slate-700 text-white rounded-lg px-4 py-3 border border-slate-600 focus:border-indigo-500 outline-none font-mono disabled:opacity-60"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loadingTask || !!task || !taskCode.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg px-4 py-3 text-sm font-medium border-none cursor-pointer disabled:cursor-not-allowed"
              >
                {loadingTask ? '讀取中...' : '載入任務'}
              </button>
              <button
                type="button"
                onClick={() => openScanner('task')}
                className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-4 py-3 text-sm font-medium border-none cursor-pointer inline-flex items-center gap-2"
              >
                <Camera size={16} />
                掃任務
              </button>
            </div>
          </form>

          {task && (
            <div className="rounded-xl bg-slate-700/50 border border-slate-600 px-4 py-3">
              <p className="font-semibold">{task.title}</p>
              {task.description && <p className="text-sm text-slate-300 mt-1">{task.description}</p>}
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-400">
                <span>{task.points} 點</span>
                <span>{task.recurrence_type}</span>
                {task.scan_window_enabled && task.window_start_time && task.window_end_time && (
                  <span>{task.window_start_time.slice(0, 5)}-{task.window_end_time.slice(0, 5)}</span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className={`bg-slate-800 rounded-xl p-4 space-y-4 ${task ? '' : 'opacity-60'}`}>
          <div>
            <h2 className="font-semibold">2. 學生身分條碼</h2>
            <p className="text-sm text-slate-400">任務載入後，學生可以依序掃描自己的身分條碼。</p>
          </div>

          <form onSubmit={handleStudentSubmit} className="flex flex-col gap-3 sm:flex-row">
            <input
              ref={studentInputRef}
              value={studentCode}
              onChange={event => setStudentCode(event.target.value)}
              disabled={!task || claiming}
              placeholder={task ? '請掃學生身分條碼' : '請先載入任務'}
              className="flex-1 bg-slate-700 text-white rounded-lg px-4 py-3 border border-slate-600 focus:border-indigo-500 outline-none font-mono disabled:opacity-60"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!task || claiming || !studentCode.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg px-4 py-3 text-sm font-medium border-none cursor-pointer disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                <UserRoundCheck size={16} />
                {claiming ? '處理中...' : '完成領取'}
              </button>
              <button
                type="button"
                disabled={!task}
                onClick={() => openScanner('student')}
                className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg px-4 py-3 text-sm font-medium border-none cursor-pointer inline-flex items-center gap-2 disabled:cursor-not-allowed"
              >
                <ScanLine size={16} />
                掃學生
              </button>
            </div>
          </form>
        </div>

        {scanning && (
          <div className="bg-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{scannerMode === 'student' ? '請掃學生身分條碼' : '請掃任務條碼'}</p>
              <button
                type="button"
                onClick={() => stopScanning()}
                className="text-sm text-slate-300 hover:text-white bg-transparent border-none cursor-pointer"
              >
                關閉相機
              </button>
            </div>
            <div id="public-scan-reader" className="w-full aspect-square max-w-sm mx-auto rounded-xl overflow-hidden" />
          </div>
        )}

        <div className="bg-slate-800 rounded-xl p-4">
          <h2 className="font-semibold mb-3">最近領取</h2>
          {logs.length === 0 ? (
            <p className="text-sm text-slate-500">還沒有掃碼紀錄。</p>
          ) : (
            <div className="space-y-2">
              {logs.map(log => (
                <div key={log.id} className="flex items-center justify-between rounded-lg bg-slate-700/50 px-3 py-2 gap-3">
                  <div>
                    <p className="font-medium text-sm">{log.student}</p>
                    <p className="text-xs text-slate-400">{log.task} · {log.time}</p>
                  </div>
                  <span className="text-amber-400 font-semibold">+{log.points}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
