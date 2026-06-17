import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Download,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Printer,
  RefreshCw,
  Save,
  ScanLine,
  Trash2,
  X
} from 'lucide-react'
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

type TaskForm = {
  title: string
  description: string
  points: number
  recurrence_type: TaskRecurrenceType
  per_period_limit: number
  custom_reset_days: number
  allow_scanner: boolean
  allow_button_claim: boolean
  scan_window_enabled: boolean
  window_start_time: string
  window_end_time: string
  is_active: boolean
}

const emptyForm: TaskForm = {
  title: '',
  description: '',
  points: 10,
  recurrence_type: 'daily',
  per_period_limit: 1,
  custom_reset_days: 7,
  allow_scanner: true,
  allow_button_claim: false,
  scan_window_enabled: false,
  window_start_time: '07:00',
  window_end_time: '08:00',
  is_active: true
}

function mapTaskToForm(task: Task): TaskForm {
  return {
    title: task.title,
    description: task.description ?? '',
    points: task.points,
    recurrence_type: task.recurrence_type,
    per_period_limit: task.per_period_limit,
    custom_reset_days: task.custom_reset_days ?? 7,
    allow_scanner: task.allow_scanner,
    allow_button_claim: task.allow_button_claim,
    scan_window_enabled: task.scan_window_enabled,
    window_start_time: task.window_start_time?.slice(0, 5) ?? '07:00',
    window_end_time: task.window_end_time?.slice(0, 5) ?? '08:00',
    is_active: task.is_active
  }
}

export default function TeacherTasksPage() {
  const { user } = useAuthStore()
  const [searchParams] = useSearchParams()
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [completions, setCompletions] = useState<CompletionRow[]>([])
  const [form, setForm] = useState<TaskForm>(emptyForm)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const selectedTask = useMemo(
    () => tasks.find(task => task.id === selectedTaskId) ?? tasks[0] ?? null,
    [selectedTaskId, tasks]
  )

  const editingTask = useMemo(
    () => tasks.find(task => task.id === editingTaskId) ?? null,
    [editingTaskId, tasks]
  )

  useEffect(() => {
    void loadTasks()
  }, [])

  useEffect(() => {
    if (searchParams.get('mode') === 'create') {
      window.setTimeout(() => document.getElementById('task-title')?.focus(), 0)
    }
  }, [searchParams])

  useEffect(() => {
    if (selectedTask?.id) {
      void loadCompletions(selectedTask.id)
    }
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

    const rows = (data ?? []) as Task[]
    setTasks(rows)

    if (!selectedTaskId && rows[0]) {
      setSelectedTaskId(rows[0].id)
    }
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

    setCompletions(
      [...((profileRows ?? []) as any), ...((rosterRows ?? []) as any)]
        .sort((left, right) => new Date(right.completed_at).getTime() - new Date(left.completed_at).getTime())
        .slice(0, 100)
    )
  }

  const resetForm = () => {
    setEditingTaskId(null)
    setForm(emptyForm)
    setError(null)
    setMessage(null)
  }

  const beginEditTask = (task: Task) => {
    setEditingTaskId(task.id)
    setForm(mapTaskToForm(task))
    setSelectedTaskId(task.id)
    setError(null)
    setMessage(`正在編輯任務：${task.title}`)
    window.setTimeout(() => document.getElementById('task-title')?.focus(), 0)
  }

  const buildTaskPayload = () => {
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim(),
      points: Number(form.points),
      recurrence_type: form.recurrence_type,
      custom_reset_days: form.recurrence_type === 'custom' ? Number(form.custom_reset_days) : null,
      per_period_limit: Number(form.per_period_limit),
      allow_scanner: form.allow_scanner,
      allow_button_claim: form.allow_button_claim,
      code_format: 'both',
      is_active: form.is_active,
      scan_window_enabled: form.scan_window_enabled,
      window_timezone: 'Asia/Taipei',
      window_start_time: form.scan_window_enabled ? form.window_start_time : null,
      window_end_time: form.scan_window_enabled ? form.window_end_time : null
    }

    return payload
  }

  const saveTask = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) return

    if (!form.allow_scanner && !form.allow_button_claim) {
      setError('至少要開啟一種完成任務方式。')
      return
    }

    setSaving(true)
    setError(null)
    setMessage(null)

    const taskPayload = buildTaskPayload()

    if (!editingTaskId) {
      taskPayload.type = 'scan'
      taskPayload.task_code = createScanCode('TASK')
      taskPayload.created_by = user.id
      taskPayload.class_id = user.role === 'leader' ? user.class_id : null

      const { error } = await supabase.from('tasks').insert(taskPayload)
      if (error) {
        setError(error.message)
      } else {
        setForm(emptyForm)
        setMessage('任務建立成功，條碼已同步產生。')
        await loadTasks()
      }
      setSaving(false)
      return
    }

    const { error } = await supabase
      .from('tasks')
      .update(taskPayload)
      .eq('id', editingTaskId)

    if (error) {
      setError(error.message)
    } else {
      setMessage(`任務已更新：${form.title.trim()}`)
      await loadTasks()
      const refreshedTask = tasks.find(task => task.id === editingTaskId)
      setEditingTaskId(null)
      if (refreshedTask) {
        setSelectedTaskId(refreshedTask.id)
      }
      setForm(emptyForm)
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

    if (error) {
      setError(error.message)
      return
    }

    setMessage(task.is_active ? `已關閉任務：${task.title}` : `已啟用任務：${task.title}`)
    await loadTasks()
  }

  const softDeleteTask = async (task: Task) => {
    const confirmed = window.confirm(`確定要刪除任務「${task.title}」嗎？\n\n刪除會採用停用方式保留歷史紀錄，學生將無法再領取這個任務。`)
    if (!confirmed) return

    setError(null)
    setMessage(null)

    const { error } = await supabase
      .from('tasks')
      .update({ is_active: false })
      .eq('id', task.id)

    if (error) {
      setError(error.message)
      return
    }

    if (editingTaskId === task.id) {
      resetForm()
    }

    setMessage(`任務已刪除（停用保留紀錄）：${task.title}`)
    await loadTasks()
  }

  const exportRecords = () => {
    if (!selectedTask) return
    downloadCsv(
      `${selectedTask.title}-records.csv`,
      completions.map(row => ({
        task: selectedTask.title,
        student: row.user?.name,
        student_id: row.user?.student_id ?? row.user?.student_no,
        period: row.period_key,
        awarded_by: row.awarded_by_profile?.name,
        completed_at: row.completed_at
      }))
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">任務管理</h1>
          <p className="text-sm text-slate-400">建立任務、編輯設定、停用任務、列印條碼、查看發點紀錄</p>
        </div>
        <Link to="/scan" className="bg-indigo-600 text-white rounded-lg px-3 py-2 text-sm no-underline flex items-center gap-2">
          <ScanLine size={16} /> 工作站
        </Link>
      </div>

      <form onSubmit={saveTask} className="bg-slate-800 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold flex items-center gap-2">
            {editingTask ? <Pencil size={18} className="text-amber-400" /> : <Plus size={18} className="text-indigo-400" />}
            {editingTask ? `編輯任務：${editingTask.title}` : '建立任務'}
          </h2>
          {editingTask && (
            <button
              type="button"
              onClick={resetForm}
              className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-3 py-2 text-sm flex items-center gap-2 border-none cursor-pointer"
            >
              <X size={16} /> 取消編輯
            </button>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-slate-400 mb-1">任務名稱</label>
            <input
              id="task-title"
              value={form.title}
              onChange={event => setForm({ ...form, title: event.target.value })}
              required
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">點數</label>
            <input
              type="number"
              min="1"
              value={form.points}
              onChange={event => setForm({ ...form, points: Number(event.target.value) })}
              required
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">週期</label>
            <select
              value={form.recurrence_type}
              onChange={event => setForm({ ...form, recurrence_type: event.target.value as TaskRecurrenceType })}
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500"
            >
              {Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">每週期上限</label>
            <input
              type="number"
              min="1"
              value={form.per_period_limit}
              onChange={event => setForm({ ...form, per_period_limit: Number(event.target.value) })}
              required
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500"
            />
          </div>
          {form.recurrence_type === 'custom' && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">自訂重置天數</label>
              <input
                type="number"
                min="1"
                value={form.custom_reset_days}
                onChange={event => setForm({ ...form, custom_reset_days: Number(event.target.value) })}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500"
              />
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
                掃描器
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
                <input
                  type="time"
                  value={form.window_start_time}
                  onChange={event => setForm({ ...form, window_start_time: event.target.value })}
                  className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">結束時間</label>
                <input
                  type="time"
                  value={form.window_end_time}
                  onChange={event => setForm({ ...form, window_end_time: event.target.value })}
                  className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500"
                />
              </div>
            </>
          )}
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">描述</label>
          <textarea
            value={form.description}
            onChange={event => setForm({ ...form, description: event.target.value })}
            rows={3}
            className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500"
          />
        </div>

        {message && <p className="text-green-400 text-sm">{message}</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 font-medium flex items-center gap-2 border-none cursor-pointer"
        >
          <Save size={16} /> {saving ? '儲存中...' : editingTask ? '儲存修改' : '建立任務'}
        </button>
      </form>

      <div className="grid gap-3">
        {tasks.map(task => (
          <div key={task.id} className="bg-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{task.title}</h3>
                <p className="text-sm text-slate-400">{task.description || '沒有描述'}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {task.points} 點 · {RECURRENCE_LABELS[task.recurrence_type]} · 每週期上限 {task.per_period_limit} 次
                  {task.allow_scanner ? ' · 掃描器' : ''}
                  {task.allow_button_claim ? ' · 按鈕完成' : ''}
                  {task.scan_window_enabled && task.window_start_time && task.window_end_time
                    ? ` · ${task.window_start_time.slice(0, 5)}-${task.window_end_time.slice(0, 5)}`
                    : ''}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${task.is_active ? 'bg-green-600/20 text-green-300' : 'bg-slate-700 text-slate-400'}`}>
                  {task.is_active ? '目前啟用' : '目前關閉'}
                </span>
              </div>
            </div>

            <BarcodeLabel value={task.task_code} label="任務條碼" />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => beginEditTask(task)}
                className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 rounded-lg px-3 py-2 text-sm flex items-center gap-2 border-none cursor-pointer"
              >
                <Pencil size={16} /> 編輯
              </button>
              <button
                type="button"
                onClick={() => toggleTaskActive(task)}
                className={`rounded-lg px-3 py-2 text-sm flex items-center gap-2 border-none cursor-pointer ${
                  task.is_active
                    ? 'bg-red-600/20 text-red-300 hover:bg-red-600/30'
                    : 'bg-green-600/20 text-green-300 hover:bg-green-600/30'
                }`}
              >
                {task.is_active ? <PowerOff size={16} /> : <Power size={16} />}
                {task.is_active ? '關閉任務' : '啟用任務'}
              </button>
              <button
                type="button"
                onClick={() => softDeleteTask(task)}
                className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-3 py-2 text-sm flex items-center gap-2 border-none cursor-pointer"
              >
                <Trash2 size={16} /> 刪除
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-3 py-2 text-sm flex items-center gap-2 border-none cursor-pointer"
              >
                <Printer size={16} /> 列印
              </button>
              <button
                type="button"
                onClick={() => setSelectedTaskId(task.id)}
                className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-3 py-2 text-sm flex items-center gap-2 border-none cursor-pointer"
              >
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
            <button
              onClick={exportRecords}
              className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-3 py-2 text-sm flex items-center gap-2 border-none cursor-pointer"
            >
              <Download size={16} /> 匯出 CSV
            </button>
          </div>

          {completions.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">目前沒有完成紀錄。</p>
          ) : (
            <div className="space-y-2">
              {completions.map(row => (
                <div key={row.id} className="flex justify-between gap-3 bg-slate-700/50 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{row.user?.name}</p>
                    <p className="text-xs text-slate-400">
                      {row.user?.student_id ?? row.user?.student_no ?? '未提供學號'} · {row.period_key}
                    </p>
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
