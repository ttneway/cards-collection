import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, RefreshCcw, ScanLine, Sparkles, UserRoundCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { Task } from '../types'

type ScanKioskProps = {
  publicMode?: boolean
}

type ActiveTask = Pick<
  Task,
  'id' | 'title' | 'description' | 'points' | 'task_code' | 'recurrence_type' | 'scan_station_enabled' | 'scan_window_enabled' | 'window_start_time' | 'window_end_time'
>

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

const SCAN_RESET_MS = 120

function isTaskOpenNow(task: Pick<ActiveTask, 'scan_window_enabled' | 'window_start_time' | 'window_end_time'>) {
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

function classifyFailureMessage(message: string) {
  if (message.includes('本週期已達領取上限')) return 'limit'
  if (message.includes('目前不在可掃碼時間內')) return 'window'
  return 'other'
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

function isLikelyStudentCode(value: string) {
  return value.startsWith('STU') || value.startsWith('USR')
}

export default function ScanKiosk({ publicMode = false }: ScanKioskProps) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const hiddenInputRef = useRef<HTMLInputElement>(null)
  const bufferRef = useRef('')
  const lastKeyAtRef = useRef(0)
  const [autoActiveTasks, setAutoActiveTasks] = useState<ActiveTask[]>([])
  const [manualTasks, setManualTasks] = useState<ActiveTask[]>([])
  const [lastScannedCode, setLastScannedCode] = useState('')
  const [message, setMessage] = useState<string | null>('待命中，直接掃任務條碼即可開啟或關閉任務。')
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<ClaimLog[]>([])
  const [busy, setBusy] = useState(false)

  const activeTasks = useMemo(() => {
    const mapped = new Map<string, ActiveTask>()
    for (const task of [...autoActiveTasks, ...manualTasks]) {
      if (task.task_code && isTaskOpenNow(task)) mapped.set(task.task_code, task)
    }
    return [...mapped.values()]
  }, [autoActiveTasks, manualTasks])

  useEffect(() => {
    hiddenInputRef.current?.focus()
  }, [])

  useEffect(() => {
    void loadAutoActiveTasks()
  }, [])

  useEffect(() => {
    const refocus = () => {
      hiddenInputRef.current?.focus()
      void loadAutoActiveTasks()
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
  }, [busy, activeTasks, publicMode, user?.id])

  const loadAutoActiveTasks = async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select(
        'id, title, description, points, task_code, recurrence_type, scan_station_enabled, scan_window_enabled, window_start_time, window_end_time, allow_scanner, is_active'
      )
      .eq('is_active', true)
      .eq('allow_scanner', true)
      .eq('scan_station_enabled', true)
      .order('created_at', { ascending: false })

    if (error) return

    const rows = ((data ?? []) as (Task & { allow_scanner: boolean })[])
      .filter(task => task.task_code)
      .map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        points: task.points,
        task_code: task.task_code,
        recurrence_type: task.recurrence_type,
        scan_station_enabled: task.scan_station_enabled,
        scan_window_enabled: task.scan_window_enabled,
        window_start_time: task.window_start_time,
        window_end_time: task.window_end_time
      } satisfies ActiveTask))

    setAutoActiveTasks(rows)
  }

  const fetchTaskByCode = async (taskCode: string) => {
    const { data, error } = await supabase
      .from('tasks')
      .select(
        'id, title, description, points, task_code, recurrence_type, scan_station_enabled, scan_window_enabled, window_start_time, window_end_time, allow_scanner, is_active'
      )
      .eq('task_code', taskCode)
      .eq('is_active', true)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) throw new Error('找不到任務條碼，或任務目前未啟用。')
    if (!data.allow_scanner) throw new Error('這個任務目前不允許掃碼完成。')

    const task = data as Task & { allow_scanner: boolean }
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      points: task.points,
      task_code: task.task_code,
      recurrence_type: task.recurrence_type,
      scan_station_enabled: task.scan_station_enabled,
      scan_window_enabled: task.scan_window_enabled,
      window_start_time: task.window_start_time,
      window_end_time: task.window_end_time
    } satisfies ActiveTask
  }

  const toggleTask = async (taskCode: string) => {
    const task = await fetchTaskByCode(taskCode)

    if (!isTaskOpenNow(task)) {
      throw new Error(`???${task.title}????????? ${task.window_start_time?.slice(0, 5)}-${task.window_end_time?.slice(0, 5)}?????????????`)
    }

    if (task.scan_station_enabled) {
      await loadAutoActiveTasks()
      setMessage(`???${task.title}???????????????????????????`)
      setError(null)
      return
    }

    const existing = manualTasks.find(item => item.task_code === taskCode)
    if (existing) {
      setManualTasks(previous => previous.filter(item => item.task_code !== taskCode))
      setMessage(`??????${existing.title}`)
      setError(null)
      return
    }

    setManualTasks(previous => [task, ...previous.filter(item => item.task_code !== task.task_code)])
    setMessage(`??????${task.title}`)
    setError(null)
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
      throw new Error(`任務 ${task.title} 沒有回傳核發結果。`)
    }

    return result
  }

  const claimAcrossActiveTasks = async (studentCode: string) => {
    if (activeTasks.length === 0) {
      throw new Error(`??????????????????????? ${studentCode}?????????TSK ???????????????`)
    }

    const settled = await Promise.allSettled(activeTasks.map(task => claimTask(task, studentCode)))
    const successes = settled
      .filter((item): item is PromiseFulfilledResult<PublicClaimResult> => item.status === 'fulfilled')
      .map(item => item.value)

    const failures = settled
      .filter((item): item is PromiseRejectedResult => item.status === 'rejected')
      .map(item => item.reason instanceof Error ? item.reason.message : String(item.reason))

    if (successes.length === 0) {
      throw new Error(failures[0] ?? '???????????????')
    }

    const studentName = successes[0].student_name
    const totalPoints = successes.reduce((sum, item) => sum + item.points_awarded, 0)
    const successLines = successes.map(item => `${item.task_title}?????${item.points_awarded}???`)
    const limitCount = failures.filter(message => classifyFailureMessage(message) === 'limit').length
    const windowCount = failures.filter(message => classifyFailureMessage(message) === 'window').length
    const otherFailures = failures.filter(message => classifyFailureMessage(message) === 'other')
    const errorParts: string[] = []

    if (limitCount > 0) errorParts.push(`?${limitCount}?????????`)
    if (windowCount > 0) errorParts.push(`?${windowCount}???????????`)
    if (otherFailures.length > 0) errorParts.push(...otherFailures)

    setLogs(previous => [
      ...successes.map(item => ({
        id: item.completion_id,
        student: item.student_name,
        task: item.task_title,
        points: item.points_awarded,
        time: new Date().toLocaleTimeString(),
        message: item.message
      })),
      ...previous
    ].slice(0, 30))

    setMessage(`${studentName}?????${successes.length}??????${totalPoints}????\n${successLines.join('\n')}`)
    setError(errorParts.length === 0 ? null : errorParts.join('?'))
  }

  const processScannedCode = async (rawCode: string) => {
    const code = normalizeScannedCode(rawCode)
    if (!code || busy) return

    setBusy(true)
    setError(null)

    try {
      if (isFunctionCode(code)) {
        if (publicMode) {
          throw new Error('公開工作站不支援功能碼。')
        }

        navigate('/teacher/tasks?mode=create')
        return
      }

      if (isTaskCode(code)) {
        await toggleTask(code)
        return
      }

      if (!isLikelyStudentCode(code)) {
        throw new Error('無法辨識這個條碼格式。請掃任務條碼或學生身分條碼。')
      }

      await claimAcrossActiveTasks(code)
    } catch (caught: any) {
      setError(caught?.message || '掃描處理失敗。')
    } finally {
      setBusy(false)
      window.setTimeout(() => hiddenInputRef.current?.focus(), 0)
    }
  }

  const clearActiveTasks = () => {
    setManualTasks([])
    setMessage('已清空手動加入的任務；自動開啟的任務仍會保留。')
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
              掃碼工作站
            </div>
            <h1 className="mt-2 text-2xl font-bold">
              {publicMode ? '免登入掃碼發點頁' : '發點工作站'}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              直接掃任務條碼即可開關任務；掃學生身分條碼時，會對目前進行中的任務逐一核發積分。
            </p>
          </div>

          {publicMode ? (
            <Link to="/auth" className="text-sm text-slate-300 no-underline hover:text-white">
              教師 / 幹部登入
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
                  掃同一個任務條碼第二次，就會把它從目前工作站關閉。
                </p>
              </div>

              {activeTasks.length > 0 ? (
                <button
                  type="button"
                  onClick={clearActiveTasks}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
                >
                  <RefreshCcw size={16} />
                  清空任務
                </button>
              ) : null}
            </div>

            {activeTasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-8 text-center text-sm text-slate-500">
                還沒有進行中的任務，現在直接掃任務條碼即可開始。
              </div>
            ) : (
              <div className="space-y-3">
                {activeTasks.map(task => (
                  <div key={task.id} className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-3">
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
                        <span>
                          開放 {task.window_start_time.slice(0, 5)}-{task.window_end_time.slice(0, 5)}
                        </span>
                      ) : null}
                      <span className="font-mono">{task.task_code}</span>
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
                這個頁面會持續待命，不需要點輸入框，掃描器送出 Enter 後就會自動處理。
              </p>
            </div>

            <div className={`rounded-xl border px-4 py-3 text-sm ${
              error
                ? 'border-red-500/30 bg-red-500/10 text-red-300'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            }`}>
              <div className="whitespace-pre-line">{error ?? message}</div>
            </div>

            <div className="rounded-xl bg-slate-900/50 px-4 py-3">
              <p className="text-xs text-slate-500">最後一次掃描</p>
              <p className="mt-1 break-all font-mono text-sm text-indigo-300">
                {lastScannedCode || '尚未掃描'}
              </p>
            </div>

            <div className="rounded-xl bg-slate-900/50 px-4 py-3 text-sm text-slate-400">
              <p>1. 先掃任務條碼：任務條碼會是 `TSK` 開頭，掃一次加入工作站，再掃一次關閉。</p>
              <p className="mt-2">2. 再掃學生身分條碼：學生碼通常是 `USR` 或 `STU` 開頭，會對所有符合規則的進行中任務一次發點。</p>
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-800/80 p-5">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-indigo-300" />
            <h2 className="font-semibold">最近核發紀錄</h2>
          </div>

          {logs.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">目前還沒有核發紀錄。</p>
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
                      {log.task} · {log.time}
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
