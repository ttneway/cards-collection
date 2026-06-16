import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, Plus, Power, PowerOff, Printer, RefreshCw, Save, ScanLine } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import BarcodeLabel from '../components/BarcodeLabel'
import { createScanCode, downloadCsv } from '../utils/codes'
import type { Task, TaskRecurrenceType } from '../types'

const RECURRENCE_LABELS: Record<TaskRecurrenceType, string> = {
  once: '一次性',
  daily: '每日',
  weekly: '每週',
  semester: '學期',
  custom: '自訂'
}

interface CompletionRow {
  id: string
  completed_at: string
  period_key: string | null
  user?: { name: string; student_id?: string | null; student_no?: string | null }
  awarded_by_profile?: { name: string }
}

const emptyForm = {
  title: '',
  description: '',
  points: 10,
  recurrence_type: 'daily' as TaskRecurrenceType,
  per_period_limit: 1,
  custom_reset_days: 7,
  allow_scanner: true,
  allow_button_claim: false,
  scan_window_enabled: false,
  window_start_time: '07:00',
  window_end_time: '08:00',
  is_active: true
}

export default function TeacherTasksPage() {
  const { user } = useAuthStore()
  const [searchParams] = useSearchParams()
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [completions, setCompletions] = useState<CompletionRow[]>([])
  const [form, setForm] = useState(emptyForm)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const selectedTask = useMemo(
    () => tasks.find(task => task.id === selectedTaskId) ?? tasks[0],
    [selectedTaskId, tasks]
  )

  useEffect(() => {
    loadTasks()
  }, [])

  useEffect(() => {
    if (searchParams.get('mode') === 'create') {
      window.setTimeout(() => document.getElementById('task-title')?.focus(), 0)
    }
  }, [searchParams])

  useEffect(() => {
    if (selectedTask?.id) loadCompletions(selectedTask.id)
  }, [selectedTask?.id])

  const loadTasks = async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      return
    }
    setTasks((data ?? []) as Task[])
  }

  const loadCompletions = async (taskId: string) => {
    const { data: profileRows } = await supabase
      .from('task_completions')
      .select('id, completed_at, period_key, user:user_id(name, student_id), awarded_by_profile:awarded_by(name)')
      .eq('task_id', taskId)
      .eq('status', 'approved')
      .order('completed_at', { ascending: false })
      .limit(100)

    const { data: rosterRows } = await supabase
      .from('roster_task_completions')
      .select('id, completed_at, period_key, user:roster_student_id(name, student_no), awarded_by_profile:awarded_by(name)')
      .eq('task_id', taskId)
      .eq('status', 'approved')
      .order('completed_at', { ascending: false })
      .limit(100)

    setCompletions([
      ...((profileRows ?? []) as any),
      ...((rosterRows ?? []) as any)
    ].sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()).slice(0, 100))
  }

  const createTask = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) return
    if (!form.allow_scanner && !form.allow_button_claim) {
      setError('至少要勾選一種任務完成方式。')
      return
    }
    setSaving(true)
    setError(null)
    setMessage(null)

    const taskPayload: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim(),
      points: Number(form.points),
      type: 'scan',
      task_code: createScanCode('TASK'),
      created_by: user.id,
      class_id: user.role === 'leader' ? user.class_id : null,
      recurrence_type: form.recurrence_type,
      custom_reset_days: form.recurrence_type === 'custom' ? Number(form.custom_reset_days) : null,
      per_period_limit: Number(form.per_period_limit),
      allow_scanner: form.allow_scanner,
      allow_button_claim: form.allow_button_claim,
      code_format: 'both',
      is_active: form.is_active
    }

    if (form.scan_window_enabled) {
      taskPayload.scan_window_enabled = true
      taskPayload.window_start_time = form.window_start_time
      taskPayload.window_end_time = form.window_end_time
      taskPayload.window_timezone = 'Asia/Taipei'
    }

    const { error } = await supabase.from('tasks').insert(taskPayload)

    if (error) {
      setError(error.message)
    } else {
      setForm(emptyForm)
      setMessage('任務已建立，條碼可在下方任務列表列印')
      await loadTasks()
    }
    setSaving(false)
  }

  const toggleTaskActive = async (task: Task) => {
    setError(null)
    setMessage(null)
    const { error } = await supabase
      .from('tasks')
      .update({ is_active: !task.is_active })
      .eq('id', task.id)
    if (error) setError(error.message)
    else {
      setMessage(task.is_active ? `已關閉任務：${task.title}` : `已啟用任務：${task.title}`)
      await loadTasks()
    }
  }

  const exportRecords = () => {
    if (!selectedTask) return
    downloadCsv(`${selectedTask.title}-records.csv`, completions.map(row => ({
      task: selectedTask.title,
      student: row.user?.name,
      student_id: row.user?.student_id ?? row.user?.student_no,
      period: row.period_key,
      awarded_by: row.awarded_by_profile?.name,
      completed_at: row.completed_at
    })))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">任務管理</h1>
          <p className="text-sm text-slate-400">建立任務、列印條碼、查看發點紀錄</p>
        </div>
        <Link to="/scan" className="bg-indigo-600 text-white rounded-lg px-3 py-2 text-sm no-underline flex items-center gap-2">
          <ScanLine size={16} /> 工作站
        </Link>
      </div>

      <form onSubmit={createTask} className="bg-slate-800 rounded-lg p-4 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Plus size={18} className="text-indigo-400" /> 建立任務
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-slate-400 mb-1">任務名稱</label>
            <input id="task-title" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} required className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">點數</label>
            <input type="number" min="1" value={form.points} onChange={event => setForm({ ...form, points: Number(event.target.value) })} required className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">週期</label>
            <select value={form.recurrence_type} onChange={event => setForm({ ...form, recurrence_type: event.target.value as TaskRecurrenceType })} className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500">
              {Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">每週期上限</label>
            <input type="number" min="1" value={form.per_period_limit} onChange={event => setForm({ ...form, per_period_limit: Number(event.target.value) })} required className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500" />
          </div>
          {form.recurrence_type === 'custom' && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">自訂刷新天數</label>
              <input type="number" min="1" value={form.custom_reset_days} onChange={event => setForm({ ...form, custom_reset_days: Number(event.target.value) })} className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500" />
            </div>
          )}
          <div className="sm:col-span-2 space-y-2">
            <label className="block text-sm text-slate-400">完成方式</label>
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-300 bg-slate-700/50 rounded-lg px-3 py-2 border border-slate-600">
                <input
                  type="checkbox"
                  checked={form.allow_scanner}
                  onChange={event => setForm({ ...form, allow_scanner: event.target.checked })}
                  className="accent-indigo-500"
                />
                使用掃描器
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300 bg-slate-700/50 rounded-lg px-3 py-2 border border-slate-600">
                <input
                  type="checkbox"
                  checked={form.allow_button_claim}
                  onChange={event => setForm({ ...form, allow_button_claim: event.target.checked })}
                  className="accent-indigo-500"
                />
                登入後按鈕完成
              </label>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300 bg-slate-700/50 rounded-lg px-3 py-2 border border-slate-600">
            <input
              type="checkbox"
              checked={form.scan_window_enabled}
              onChange={event => setForm({ ...form, scan_window_enabled: event.target.checked })}
              className="accent-indigo-500"
            />
            限定掃碼時間
          </label>
          {form.scan_window_enabled && (
            <>
              <div>
                <label className="block text-sm text-slate-400 mb-1">開始時間</label>
                <input type="time" value={form.window_start_time} onChange={event => setForm({ ...form, window_start_time: event.target.value })} className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">結束時間</label>
                <input type="time" value={form.window_end_time} onChange={event => setForm({ ...form, window_end_time: event.target.value })} className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500" />
              </div>
            </>
          )}
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">描述</label>
          <textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} rows={3} className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500" />
        </div>
        {message && <p className="text-green-400 text-sm">{message}</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button disabled={saving} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 font-medium flex items-center gap-2">
          <Save size={16} /> {saving ? '儲存中...' : '建立任務'}
        </button>
      </form>

      <div className="grid gap-3">
        {tasks.map(task => (
          <div key={task.id} className="bg-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{task.title}</h3>
                <p className="text-sm text-slate-400">{task.description || '無描述'}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {task.points} 點 · {RECURRENCE_LABELS[task.recurrence_type]} · 每週期 {task.per_period_limit} 次
                  {task.allow_scanner ? ' · 掃描器' : ''}
                  {task.allow_button_claim ? ' · 按鈕完成' : ''}
                  {task.scan_window_enabled && task.window_start_time && task.window_end_time
                    ? ` · 限時 ${task.window_start_time.slice(0, 5)}-${task.window_end_time.slice(0, 5)}`
                    : ''}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${task.is_active ? 'bg-green-600/20 text-green-300' : 'bg-slate-700 text-slate-400'}`}>
                  {task.is_active ? '目前啟用' : '目前關閉'}
                </span>
                <button
                  onClick={() => toggleTaskActive(task)}
                  className={`rounded-lg px-3 py-2 text-sm flex items-center gap-2 ${
                    task.is_active
                      ? 'bg-red-600/20 text-red-300 hover:bg-red-600/30'
                      : 'bg-green-600/20 text-green-300 hover:bg-green-600/30'
                  }`}
                >
                  {task.is_active ? <PowerOff size={16} /> : <Power size={16} />}
                  {task.is_active ? '關閉任務' : '啟用任務'}
                </button>
              </div>
            </div>
            <BarcodeLabel value={task.task_code} label="任務條碼" />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => window.print()} className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                <Printer size={16} /> 列印
              </button>
              <button onClick={() => setSelectedTaskId(task.id)} className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                <RefreshCw size={16} /> 查看紀錄
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedTask && (
        <div className="bg-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-semibold">{selectedTask.title} 紀錄</h2>
            <button onClick={exportRecords} className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-3 py-2 text-sm flex items-center gap-2">
              <Download size={16} /> 匯出 CSV
            </button>
          </div>
          {completions.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">尚無紀錄</p>
          ) : (
            <div className="space-y-2">
              {completions.map(row => (
                <div key={row.id} className="flex justify-between gap-3 bg-slate-700/50 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{row.user?.name}</p>
                    <p className="text-xs text-slate-400">{row.user?.student_id ?? row.user?.student_no ?? '無學號'} · {row.period_key}</p>
                  </div>
                  <p className="text-xs text-slate-400">{new Date(row.completed_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
