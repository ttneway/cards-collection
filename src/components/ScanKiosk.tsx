import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, RefreshCcw, ScanLine, Sparkles, UserRoundCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'

type ScanKioskProps = {
  publicMode?: boolean
}

type ActiveTask = {
  task_id: string
  title: string
  description: string | null
  points: number
  task_code: string
  recurrence_type: string
  scan_station_enabled: boolean
  scan_window_enabled: boolean
  window_start_time: string | null
  window_end_time: string | null
  starts_at: string | null
  ends_at: string | null
  activation_source: 'auto' | 'session'
}

type ClaimLog = {
  id: string
  student: string
  task: string
  points: number
  time: string
  message: string
}

type PublicClaimResult = {
  completion_id: string
  student_id: string
  student_name: string
  task_title: string
  points_awarded: number
  period_key: string
  message: string
}

type ToggleTaskSessionResult = {
  action: 'opened' | 'closed'
  session_id: string
  task_id: string
  task_title: string
  operator_id: string
  operator_name: string
  operator_role: 'leader' | 'teacher' | 'admin'
  message: string
}

const SCAN_RESET_MS = 120

function isTaskOpenNow(task: Pick<ActiveTask, 'scan_window_enabled' | 'window_start_time' | 'window_end_time' | 'starts_at' | 'ends_at'>) {
  const now = new Date()
  if (task.starts_at && now < new Date(task.starts_at)) return false
  if (task.ends_at && now > new Date(task.ends_at)) return false

  if (!task.scan_window_enabled || !task.window_start_time || !task.window_end_time) return true

  const localTime = new Intl.DateTimeFormat('en-CA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Taipei'
  }).format(new Date())

  const start = task.window_start_time.slice(0, 5)
  const end = task.window_end_time.slice(0, 5)

  if (start <= end) return localTime >= start && localTime <= end
  return localTime >= start || localTime <= end
}

function normalizeScannedCode(value: string) {
  return value.trim().replace(/\s+/g, '').toUpperCase()
}

function isTaskCode(value: string) {
  return value.startsWith('TSK')
}

function isFunctionCode(value: string) {
  return value.startsWith('FNC')
}

function summarizeFailures(messages: string[]) {
  const limitCount = messages.filter(message => message.includes('本週期已達領取上限')).length
  const windowCount = messages.filter(message => message.includes('目前不在可掃描時間內') || message.includes('目前不在任務開放時間內')).length
  const cooldownCount = messages.filter(message => message.includes('冷卻')).length
  const others = messages.filter(message => {
    return !message.includes('本週期已達領取上限')
      && !message.includes('目前不在可掃描時間內')
      && !message.includes('目前不在任務開放時間內')
      && !message.includes('冷卻')
  })

  const parts: string[] = []
  if (limitCount > 0) parts.push(`有 ${limitCount} 項任務已達領取上限。`)
  if (windowCount > 0) parts.push(`有 ${windowCount} 項任務目前不在開放時間內。`)
  if (cooldownCount > 0) parts.push(`有 ${cooldownCount} 項任務仍在冷卻時間。`)
  parts.push(...others)
  return parts.join('\n')
}

export default function ScanKiosk({ publicMode = false }: ScanKioskProps) {
  const navigate = useNavigate()
  const hiddenInputRef = useRef<HTMLInputElement>(null)
  const bufferRef = useRef('')
  const lastKeyAtRef = useRef(0)
  const [activeTaskRows, setActiveTaskRows] = useState<ActiveTask[]>([])
  const [pendingTaskCode, setPendingTaskCode] = useState<string | null>(null)
  const [pendingTaskTitle, setPendingTaskTitle] = useState<string | null>(null)
  const [lastScannedCode, setLastScannedCode] = useState('')
  const [message, setMessage] = useState<string | null>('掃描器待命中，請先掃描任務條碼或學生身分條碼。')
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<ClaimLog[]>([])
  const [busy, setBusy] = useState(false)

  const activeTasks = useMemo(
    () => activeTaskRows.filter(task => task.task_code && isTaskOpenNow(task)),
    [activeTaskRows]
  )

  useEffect(() => {
    hiddenInputRef.current?.focus()
  }, [])

  useEffect(() => {
    void loadActiveTasks()
  }, [])

  useEffect(() => {
    const refocus = () => {
      hiddenInputRef.current?.focus()
      void loadActiveTasks()
    }

    window.addEventListener('click', refocus)
    window.addEventListener('focus', refocus)
    return () => {
      window.removeEventListener('click', refocus)
      window.removeEventListener('focus', refocus)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        const code = normalizeScannedCode(bufferRef.current)
        bufferRef.current = ''
        lastKeyAtRef.current = 0
        if (code && !busy) {
          event.preventDefault()
          setLastScannedCode(code)
          void processScannedCode(code)
        }
        return
      }

      if (event.key === 'Backspace') {
        bufferRef.current = bufferRef.current.slice(0, -1)
        return
      }

      if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return

      const now = Date.now()
      if (now - lastKeyAtRef.current > SCAN_RESET_MS) {
        bufferRef.current = ''
      }
      lastKeyAtRef.current = now
      bufferRef.current += event.key
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [busy, pendingTaskCode, activeTasks.length])

  const loadActiveTasks = async () => {
    const { data, error } = await supabase.rpc('list_active_scan_tasks')
    if (error) return
    setActiveTaskRows((data ?? []) as ActiveTask[])
  }

  const beginPendingTask = (taskCode: string) => {
    const task = activeTaskRows.find(item => item.task_code === taskCode)
    setPendingTaskCode(taskCode)
    setPendingTaskTitle(task?.title ?? null)
    setError(null)
    setMessage(`已掃描任務條碼 ${taskCode}，請再掃描操作者身分條碼確認開啟或關閉。`)
  }

  const clearPendingTask = (nextMessage?: string) => {
    setPendingTaskCode(null)
    setPendingTaskTitle(null)
    if (nextMessage) {
      setMessage(nextMessage)
    }
  }

  const toggleTaskSession = async (taskCode: string, operatorCode: string) => {
    const { data, error } = await supabase.rpc('toggle_task_session_by_scan', {
      p_task_code: taskCode,
      p_operator_scan_code: operatorCode
    })

    if (error) {
      throw new Error(error.message)
    }

    const result = data?.[0] as ToggleTaskSessionResult | undefined
    if (!result) {
      throw new Error('任務開關沒有回傳結果。')
    }

    await loadActiveTasks()
    clearPendingTask()
    setError(null)
    setMessage(result.message)
  }

  const claimTask = async (task: ActiveTask, studentCode: string) => {
    const { data, error } = await supabase.rpc('claim_task_by_public_scan', {
      p_task_code: task.task_code,
      p_student_scan_code: studentCode
    })

    if (error) {
      throw new Error(error.message)
    }

    const result = data?.[0] as PublicClaimResult | undefined
    if (!result) {
      throw new Error(`任務 ${task.title} 沒有回傳領取結果。`)
    }

    return result
  }

  const claimAcrossActiveTasks = async (studentCode: string) => {
    if (activeTasks.length === 0) {
      throw new Error('目前沒有進行中的任務，請先掃任務條碼，或啟用「掃描發點中自動開啟」的任務。')
    }

    const settled = await Promise.allSettled(activeTasks.map(task => claimTask(task, studentCode)))
    const successes = settled
      .filter((item): item is PromiseFulfilledResult<PublicClaimResult> => item.status === 'fulfilled')
      .map(item => item.value)
    const failures = settled
      .filter((item): item is PromiseRejectedResult => item.status === 'rejected')
      .map(item => item.reason instanceof Error ? item.reason.message : String(item.reason))

    if (successes.length === 0) {
      throw new Error(summarizeFailures(failures) || '這次掃描沒有成功領取任何積分。')
    }

    const studentName = successes[0].student_name
    const totalPoints = successes.reduce((sum, item) => sum + item.points_awarded, 0)
    const successLines = successes.map(item => `${item.task_title} 任務，領取 ${item.points_awarded} 點積分`)
    const failureSummary = summarizeFailures(failures)

    setLogs(previous => [
      ...successes.map(item => ({
        id: item.completion_id,
        student: item.student_name,
        task: item.task_title,
        points: item.points_awarded,
        time: new Date().toLocaleTimeString('zh-TW', { hour12: false }),
        message: item.message
      })),
      ...previous
    ].slice(0, 30))

    setMessage(`${studentName} 本次共完成 ${successes.length} 項任務，獲得 ${totalPoints} 點積分。\n${successLines.join('\n')}`)
    setError(failureSummary || null)
    await loadActiveTasks()
  }

  const processScannedCode = async (rawCode: string) => {
    const code = normalizeScannedCode(rawCode)
    if (!code || busy) return

    setBusy(true)
    setError(null)

    try {
      if (pendingTaskCode) {
        if (isTaskCode(code)) {
          beginPendingTask(code)
          return
        }

        if (isFunctionCode(code)) {
          throw new Error('任務等待驗證中，請先掃描操作者身分條碼。')
        }

        await toggleTaskSession(pendingTaskCode, code)
        return
      }

      if (isFunctionCode(code)) {
        if (publicMode) {
          throw new Error('公開掃描頁不提供功能碼操作。')
        }

        navigate('/teacher/tasks?mode=create')
        return
      }

      if (isTaskCode(code)) {
        beginPendingTask(code)
        return
      }

      await claimAcrossActiveTasks(code)
    } catch (caught: any) {
      setError(caught?.message || '掃描處理失敗，請再試一次。')
    } finally {
      setBusy(false)
      window.setTimeout(() => hiddenInputRef.current?.focus(), 0)
    }
  }

  const clearTaskState = async () => {
    clearPendingTask('已清除等待中的任務掃描狀態。')
    await loadActiveTasks()
    setError(null)
  }

  return (
    <div className={publicMode ? 'min-h-dvh bg-slate-900 text-white' : ''}>
      <div className={publicMode ? 'mx-auto max-w-5xl px-4 py-6' : 'space-y-6'}>
        <input
          ref={hiddenInputRef}
          aria-hidden="true"
          tabIndex={-1}
          className="pointer-events-none absolute left-0 top-0 h-0 w-0 opacity-0"
        />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-400">
              <Sparkles size={18} />
              即時掃描工作區
            </div>
            <h1 className="mt-2 text-2xl font-bold">
              {publicMode ? '公開掃描領點頁面' : '掃碼發點工作站'}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              這個頁面會持續待命，不需要點輸入框，掃描器送出 Enter 後就會自動處理。
            </p>
          </div>

          {publicMode ? (
            <Link to="/auth" className="text-sm text-slate-300 no-underline hover:text-white">
              前往登入
            </Link>
          ) : null}
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.3fr_1fr]">
          <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-800/80 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <ScanLine size={20} className="text-indigo-400" />
                  目前進行中的任務
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  只會列出目前可掃描領點的任務；超出開放時間的任務不會顯示在這裡。
                </p>
              </div>

              {(activeTasks.length > 0 || pendingTaskCode) ? (
                <button
                  type="button"
                  onClick={() => void clearTaskState()}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
                >
                  <RefreshCcw size={16} />
                  重新整理
                </button>
              ) : null}
            </div>

            {pendingTaskCode ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                <p className="font-semibold">等待操作者驗證</p>
                <p className="mt-1">
                  任務條碼：<span className="font-mono">{pendingTaskCode}</span>
                  {pendingTaskTitle ? `（${pendingTaskTitle}）` : ''}
                </p>
                <p className="mt-2 text-amber-100">請再掃描小老師、幹部、教師或管理者的身分條碼。</p>
              </div>
            ) : null}

            {activeTasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-8 text-center text-sm text-slate-500">
                目前沒有進行中的任務。可先掃任務條碼，再掃操作者身分條碼啟用任務。
              </div>
            ) : (
              <div className="space-y-3">
                {activeTasks.map(task => (
                  <div key={`${task.activation_source}-${task.task_id}`} className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{task.title}</p>
                        {task.description ? <p className="mt-1 text-sm text-slate-400">{task.description}</p> : null}
                      </div>
                      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                        {task.points} 點
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>{task.recurrence_type}</span>
                      {task.scan_window_enabled && task.window_start_time && task.window_end_time ? (
                        <span>開放時間 {task.window_start_time.slice(0, 5)}-{task.window_end_time.slice(0, 5)}</span>
                      ) : null}
                      <span className="font-mono">{task.task_code}</span>
                      <span>{task.activation_source === 'auto' ? '自動開啟' : '任務碼開啟'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-800/80 p-5">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <UserRoundCheck size={20} className="text-amber-400" />
                掃描狀態
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                先掃任務條碼可切換任務，再掃操作者條碼確認；直接掃學生條碼則會對目前進行中的任務發點。
              </p>
            </div>

            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                error
                  ? 'border-red-500/30 bg-red-500/10 text-red-300'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              }`}
            >
              <div className="whitespace-pre-line">{error ?? message}</div>
            </div>

            <div className="rounded-xl bg-slate-900/50 px-4 py-3">
              <p className="text-xs text-slate-500">最後一次掃描</p>
              <p className="mt-1 break-all font-mono text-sm text-indigo-300">
                {lastScannedCode || '尚未掃描'}
              </p>
            </div>

            <div className="rounded-xl bg-slate-900/50 px-4 py-3 text-sm text-slate-400">
              <p>1. 掃任務條碼：進入待驗證狀態。</p>
              <p className="mt-2">2. 再掃操作者身分條碼：確認角色後開啟或關閉該任務。</p>
              <p className="mt-2">3. 掃學生身分條碼：對所有符合規則的進行中任務一次發點。</p>
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-800/80 p-5">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-indigo-300" />
            <h2 className="font-semibold">最近發點紀錄</h2>
          </div>

          {logs.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">目前還沒有新的掃描成功紀錄。</p>
          ) : (
            <div className="mt-4 space-y-2">
              {logs.map(log => (
                <div
                  key={log.id}
                  className="flex flex-col gap-2 rounded-xl bg-slate-900/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-white">{log.student}</p>
                    <p className="text-sm text-slate-400">
                      {log.task} | {log.time}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{log.message}</p>
                  </div>
                  <span className="font-semibold text-amber-400">+{log.points}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
