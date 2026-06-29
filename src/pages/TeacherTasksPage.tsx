import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Download,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Save,
  ScanLine,
  Trash2,
  X
} from 'lucide-react'
import BarcodeLabel from '../components/BarcodeLabel'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { Class, Task, TaskOpenerRole, TaskRecurrenceType, TaskScopeType } from '../types'
import { createScanCode, downloadCsv } from '../utils/codes'

const RECURRENCE_LABELS: Record<TaskRecurrenceType, string> = {
  once: '一次性',
  daily: '每日',
  weekly: '每週',
  semester: '學期',
  custom: '自訂'
}

const SCOPE_LABELS: Record<TaskScopeType, string> = {
  school: '全校任務',
  class: '班級任務'
}

const OPENER_ROLE_LABELS: Record<TaskOpenerRole, string> = {
  leader: '幹部 / 小老師',
  teacher: '教師'
}

type TaskWithRelations = Task & {
  task_classes?: Array<{
    class_id: string
    class?: Class | null
  }>
}

interface CompletionRow {
  id: string
  completed_at: string
  period_key: string | null
  user?: { name: string; student_id?: string | null; student_no?: string | null }
  awarded_by_profile?: { name: string }
}

type RawCompletionRow = {
  id: string
  completed_at: string
  period_key: string | null
  user?: Array<{ name: string; student_id?: string | null; student_no?: string | null }> | { name: string; student_id?: string | null; student_no?: string | null } | null
  awarded_by_profile?: Array<{ name: string }> | { name: string } | null
}

type TaskForm = {
  title: string
  description: string
  points: number
  starts_at: string
  ends_at: string
  archive_after_days: number
  scope_type: TaskScopeType
  selected_class_ids: string[]
  recurrence_type: TaskRecurrenceType
  per_period_limit: number
  claim_cooldown_minutes: number
  custom_reset_days: number
  allow_scanner: boolean
  allow_button_claim: boolean
  allowed_opener_roles: TaskOpenerRole[]
  scan_station_enabled: boolean
  scan_window_enabled: boolean
  window_start_time: string
  window_end_time: string
  is_active: boolean
}

const emptyForm: TaskForm = {
  title: '',
  description: '',
  points: 10,
  starts_at: '',
  ends_at: '',
  archive_after_days: 7,
  scope_type: 'school',
  selected_class_ids: [],
  recurrence_type: 'daily',
  per_period_limit: 1,
  claim_cooldown_minutes: 0,
  custom_reset_days: 7,
  allow_scanner: true,
  allow_button_claim: false,
  allowed_opener_roles: ['leader', 'teacher'],
  scan_station_enabled: true,
  scan_window_enabled: false,
  window_start_time: '07:00',
  window_end_time: '08:00',
  is_active: true
}

function normalizeRelation<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0]
  return value ?? undefined
}

function formatCooldown(minutes: number) {
  if (minutes <= 0) return '無冷卻限制'
  if (minutes < 60) return `${minutes} 分鐘`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes === 0 ? `${hours} 小時` : `${hours} 小時 ${remainingMinutes} 分鐘`
}

function scopeClassIds(task: TaskWithRelations) {
  if (task.task_classes && task.task_classes.length > 0) {
    return task.task_classes.map(item => item.class_id)
  }
  return task.class_id ? [task.class_id] : []
}

function formatOpenerRoles(roles: TaskOpenerRole[] | undefined) {
  const values: TaskOpenerRole[] = roles?.length ? roles : ['leader', 'teacher']
  return values.map(role => OPENER_ROLE_LABELS[role]).join('、')
}

function mapTaskToForm(task: TaskWithRelations, currentUserRole?: string, currentUserClassId?: string | null): TaskForm {
  const selectedClassIds = scopeClassIds(task)
  return {
    title: task.title,
    description: task.description ?? '',
    points: task.points,
    starts_at: task.starts_at ? task.starts_at.slice(0, 16) : '',
    ends_at: task.ends_at ? task.ends_at.slice(0, 16) : '',
    archive_after_days: task.archive_after_days ?? 7,
    scope_type: currentUserRole === 'leader' ? 'class' : task.scope_type ?? (selectedClassIds.length > 0 ? 'class' : 'school'),
    selected_class_ids: currentUserRole === 'leader' && currentUserClassId ? [currentUserClassId] : selectedClassIds,
    recurrence_type: task.recurrence_type,
    per_period_limit: task.per_period_limit,
    claim_cooldown_minutes: task.claim_cooldown_minutes ?? 0,
    custom_reset_days: task.custom_reset_days ?? 7,
    allow_scanner: task.allow_scanner,
    allow_button_claim: task.allow_button_claim,
    allowed_opener_roles: task.allowed_opener_roles?.length ? task.allowed_opener_roles : ['leader', 'teacher'],
    scan_station_enabled: task.scan_station_enabled,
    scan_window_enabled: task.scan_window_enabled,
    window_start_time: task.window_start_time?.slice(0, 5) ?? '07:00',
    window_end_time: task.window_end_time?.slice(0, 5) ?? '08:00',
    is_active: task.is_active
  }
}

function classNamesForTask(task: TaskWithRelations) {
  return (task.task_classes ?? [])
    .map(item => item.class?.name)
    .filter((value): value is string => Boolean(value))
}

export default function TeacherTasksPage() {
  const { user } = useAuthStore()
  const [searchParams] = useSearchParams()
  const [tasks, setTasks] = useState<TaskWithRelations[]>([])
  const [classes, setClasses] = useState<Class[]>([])
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

  const availableClasses = user?.role === 'leader'
    ? classes.filter(item => item.id === user.class_id)
    : classes

  useEffect(() => {
    void Promise.all([loadTasks(), loadClasses()])
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

  useEffect(() => {
    if (user?.role === 'leader' && user.class_id) {
      setForm(previous => ({
        ...previous,
        scope_type: 'class',
        selected_class_ids: user.class_id ? [user.class_id] : []
      }))
    }
  }, [user?.class_id, user?.role])

  const loadTasks = async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*, task_classes(class_id, class:classes(id, name, grade, teacher_id, created_at))')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    const rows = (data ?? []) as TaskWithRelations[]
    setTasks(rows)

    if (!selectedTaskId && rows[0]) {
      setSelectedTaskId(rows[0].id)
    }
  }

  const loadClasses = async () => {
    const { data, error } = await supabase
      .from('classes')
      .select('*')
      .order('grade')
      .order('name')

    if (error) {
      setError(error.message)
      return
    }

    setClasses((data ?? []) as Class[])
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

    const mergedRows = [...((profileRows ?? []) as RawCompletionRow[]), ...((rosterRows ?? []) as RawCompletionRow[])]
      .map(row => ({
        id: row.id,
        completed_at: row.completed_at,
        period_key: row.period_key,
        user: normalizeRelation(row.user),
        awarded_by_profile: normalizeRelation(row.awarded_by_profile)
      }))
      .sort((left, right) => new Date(right.completed_at).getTime() - new Date(left.completed_at).getTime())
      .slice(0, 100)

    setCompletions(mergedRows)
  }

  const resetForm = () => {
    setEditingTaskId(null)
    setForm(user?.role === 'leader' && user.class_id
      ? { ...emptyForm, scope_type: 'class', selected_class_ids: [user.class_id] }
      : emptyForm)
    setError(null)
    setMessage(null)
  }

  const beginEditTask = (task: TaskWithRelations) => {
    setEditingTaskId(task.id)
    setForm(mapTaskToForm(task, user?.role, user?.class_id))
    setSelectedTaskId(task.id)
    setError(null)
    setMessage(`正在編輯任務：${task.title}`)
    window.setTimeout(() => document.getElementById('task-title')?.focus(), 0)
  }

  const toggleClassSelection = (classId: string) => {
    setForm(previous => {
      const exists = previous.selected_class_ids.includes(classId)
      return {
        ...previous,
        selected_class_ids: exists
          ? previous.selected_class_ids.filter(item => item !== classId)
          : [...previous.selected_class_ids, classId]
      }
    })
  }

  const toggleOpenerRoleSelection = (role: TaskOpenerRole) => {
    setForm(previous => {
      const exists = previous.allowed_opener_roles.includes(role)
      return {
        ...previous,
        allowed_opener_roles: exists
          ? previous.allowed_opener_roles.filter(item => item !== role)
          : [...previous.allowed_opener_roles, role]
      }
    })
  }

  const buildTaskPayload = () => {
    const selectedClassIds =
      user?.role === 'leader' && user.class_id
        ? [user.class_id]
        : form.scope_type === 'class'
          ? form.selected_class_ids
          : []

    return {
      task: {
        title: form.title.trim(),
        description: form.description.trim(),
        points: Number(form.points),
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        archive_after_days: Number(form.archive_after_days),
        scope_type: user?.role === 'leader' ? 'class' : form.scope_type,
        class_id: selectedClassIds[0] ?? null,
        recurrence_type: form.recurrence_type,
        custom_reset_days: form.recurrence_type === 'custom' ? Number(form.custom_reset_days) : null,
        per_period_limit: Number(form.per_period_limit),
        claim_cooldown_minutes: Number(form.claim_cooldown_minutes),
        allow_scanner: form.allow_scanner,
        allow_button_claim: form.allow_button_claim,
        allowed_opener_roles: form.allowed_opener_roles,
        scan_station_enabled: form.allow_scanner ? form.scan_station_enabled : false,
        code_format: 'qr',
        is_active: form.is_active,
        scan_window_enabled: form.scan_window_enabled,
        window_timezone: 'Asia/Taipei',
        window_start_time: form.scan_window_enabled ? form.window_start_time : null,
        window_end_time: form.scan_window_enabled ? form.window_end_time : null
      },
      classIds: selectedClassIds
    }
  }

  const saveTaskScope = async (taskId: string, scopeType: TaskScopeType, classIds: string[]) => {
    const { error } = await supabase.rpc('replace_task_classes', {
      p_task_id: taskId,
      p_scope_type: scopeType,
      p_class_ids: classIds
    })

    if (error) {
      throw new Error(error.message)
    }
  }

  const saveTask = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) return

    if (!form.allow_scanner && !form.allow_button_claim) {
      setError('請至少選擇一種任務完成方式。')
      return
    }

    if (form.allow_scanner && form.allowed_opener_roles.length === 0) {
      setError('請至少選擇一種可開啟任務的角色。')
      return
    }

    const isLeader = user.role === 'leader'
    const effectiveScope = isLeader ? 'class' : form.scope_type
    const effectiveClassIds =
      isLeader && user.class_id
        ? [user.class_id]
        : effectiveScope === 'class'
          ? form.selected_class_ids
          : []

    if (effectiveScope === 'class' && effectiveClassIds.length === 0) {
      setError('班級任務至少要指定一個班級。')
      return
    }

    if (form.starts_at && form.ends_at && new Date(form.ends_at).getTime() <= new Date(form.starts_at).getTime()) {
      setError('任務結束時間必須晚於開始時間')
      return
    }

    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      const taskPayload = buildTaskPayload()

      if (!editingTaskId) {
        const { data, error } = await supabase
          .from('tasks')
          .insert({
            ...taskPayload.task,
            type: 'scan',
            task_code: createScanCode('TSK'),
            created_by: user.id
          })
          .select('id')
          .single()

        if (error || !data) {
          throw new Error(error?.message ?? '建立任務失敗。')
        }

        await saveTaskScope(data.id, effectiveScope, effectiveClassIds)

        setForm(isLeader && user.class_id
          ? { ...emptyForm, scope_type: 'class', selected_class_ids: [user.class_id] }
          : emptyForm)
        setMessage('任務已建立。')
        await loadTasks()
        setSelectedTaskId(data.id)
      } else {
        const { error } = await supabase
          .from('tasks')
          .update({
            ...taskPayload.task,
            scope_type: effectiveScope,
            class_id: effectiveClassIds[0] ?? null
          })
          .eq('id', editingTaskId)

        if (error) {
          throw new Error(error.message)
        }

        await saveTaskScope(editingTaskId, effectiveScope, effectiveClassIds)

        setMessage(`已更新任務：${form.title.trim()}`)
        await loadTasks()
        setEditingTaskId(null)
        setForm(isLeader && user.class_id
          ? { ...emptyForm, scope_type: 'class', selected_class_ids: [user.class_id] }
          : emptyForm)
      }
    } catch (caught: any) {
      setError(caught?.message || '儲存任務失敗。')
    }

    setSaving(false)
  }

  const toggleTaskActive = async (task: TaskWithRelations) => {
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

    setMessage(task.is_active ? `已停用任務：${task.title}` : `已啟用任務：${task.title}`)
    await loadTasks()
  }

  const softDeleteTask = async (task: TaskWithRelations) => {
    const confirmed = window.confirm(`確定要停用任務「${task.title}」嗎？\n\n既有完成紀錄會保留，但學生端將不再顯示。`)
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

    setMessage(`已停用任務：${task.title}`)
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
          <p className="text-sm text-slate-400">建立任務、設定條碼、決定誰可以開通任務，並查看發點紀錄。</p>
        </div>
        <Link
          to="/scan"
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white no-underline"
        >
          <ScanLine size={16} /> 工作站
        </Link>
      </div>

      <form onSubmit={saveTask} className="space-y-4 rounded-lg bg-slate-800 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold">
            {editingTask ? <Pencil size={18} className="text-amber-400" /> : <Plus size={18} className="text-indigo-400" />}
            {editingTask ? `編輯任務：${editingTask.title}` : '建立任務'}
          </h2>
          {editingTask ? (
            <button
              type="button"
              onClick={resetForm}
              className="flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
            >
              <X size={16} /> 取消編輯
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-slate-400">任務名稱</label>
            <input
              id="task-title"
              value={form.title}
              onChange={event => setForm({ ...form, title: event.target.value })}
              required
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">點數</label>
            <input
              type="number"
              min="1"
              value={form.points}
              onChange={event => setForm({ ...form, points: Number(event.target.value) })}
              required
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">任務開始時間</label>
            <input
              type="datetime-local"
              value={form.starts_at}
              onChange={event => setForm({ ...form, starts_at: event.target.value })}
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">任務結束時間</label>
            <input
              type="datetime-local"
              value={form.ends_at}
              onChange={event => setForm({ ...form, ends_at: event.target.value })}
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">結束後保留顯示天數</label>
            <input
              type="number"
              min="0"
              value={form.archive_after_days}
              onChange={event => setForm({ ...form, archive_after_days: Number(event.target.value) })}
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
            <p className="mt-1 text-xs text-slate-500">任務截止後，前台還要保留顯示幾天。預設 7 天。</p>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm text-slate-400">任務範圍</label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-300">
                <input
                  type="radio"
                  checked={(user?.role === 'leader' ? 'class' : form.scope_type) === 'school'}
                  disabled={user?.role === 'leader'}
                  onChange={() => setForm({ ...form, scope_type: 'school', selected_class_ids: [] })}
                  className="accent-indigo-500"
                />
                全校任務
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-300">
                <input
                  type="radio"
                  checked={(user?.role === 'leader' ? 'class' : form.scope_type) === 'class'}
                  onChange={() =>
                    setForm({
                      ...form,
                      scope_type: 'class',
                      selected_class_ids: user?.role === 'leader' && user.class_id ? [user.class_id] : form.selected_class_ids
                    })
                  }
                  className="accent-indigo-500"
                />
                班級任務
              </label>
            </div>
            {user?.role === 'leader' ? (
              <p className="mt-1 text-xs text-slate-500">幹部建立的任務固定為自己班級的任務。</p>
            ) : null}
          </div>

          {(user?.role === 'leader' || form.scope_type === 'class') ? (
            <div className="space-y-2 sm:col-span-2">
              <label className="block text-sm text-slate-400">指定班級{user?.role !== 'leader' ? '（可複選）' : ''}</label>
              <div className="grid gap-2 sm:grid-cols-3">
                {availableClasses.map(item => {
                  const checked = form.selected_class_ids.includes(item.id) || (user?.role === 'leader' && user.class_id === item.id)
                  return (
                    <label
                      key={item.id}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        checked ? 'border-indigo-500 bg-indigo-600/20 text-white' : 'border-slate-600 bg-slate-700/50 text-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={user?.role === 'leader'}
                        onChange={() => toggleClassSelection(item.id)}
                        className="accent-indigo-500"
                      />
                      {item.grade} 年級 · {item.name}
                    </label>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-sm text-slate-400">週期</label>
            <select
              value={form.recurrence_type}
              onChange={event => setForm({ ...form, recurrence_type: event.target.value as TaskRecurrenceType })}
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            >
              {Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">每週期上限</label>
            <input
              type="number"
              min="1"
              value={form.per_period_limit}
              onChange={event => setForm({ ...form, per_period_limit: Number(event.target.value) })}
              required
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">下次可取得間隔（分鐘）</label>
            <input
              type="number"
              min="0"
              value={form.claim_cooldown_minutes}
              onChange={event => setForm({ ...form, claim_cooldown_minutes: Number(event.target.value) })}
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
            <p className="mt-1 text-xs text-slate-500">填 0 代表不限冷卻時間。</p>
          </div>

          {form.recurrence_type === 'custom' ? (
            <div>
              <label className="mb-1 block text-sm text-slate-400">自訂重置天數</label>
              <input
                type="number"
                min="1"
                value={form.custom_reset_days}
                onChange={event => setForm({ ...form, custom_reset_days: Number(event.target.value) })}
                className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
              />
            </div>
          ) : null}

          <div className="space-y-2 sm:col-span-2">
            <label className="block text-sm text-slate-400">完成方式</label>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.allow_scanner}
                  onChange={event => setForm({ ...form, allow_scanner: event.target.checked })}
                  className="accent-indigo-500"
                />
                使用掃描器
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.allow_button_claim}
                  onChange={event => setForm({ ...form, allow_button_claim: event.target.checked })}
                  className="accent-indigo-500"
                />
                登入後按鈕完成
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.scan_station_enabled}
                  disabled={!form.allow_scanner}
                  onChange={event => setForm({ ...form, scan_station_enabled: event.target.checked })}
                  className="accent-indigo-500"
                />
                掃描發點中自動開啟
              </label>
            </div>
          </div>

          {form.allow_scanner ? (
            <div className="space-y-2 sm:col-span-2">
              <label className="block text-sm text-slate-400">可開啟 / 關閉任務的角色</label>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['leader', 'teacher'] as TaskOpenerRole[]).map(role => {
                  const checked = form.allowed_opener_roles.includes(role)
                  return (
                    <label
                      key={role}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        checked ? 'border-indigo-500 bg-indigo-600/20 text-white' : 'border-slate-600 bg-slate-700/50 text-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOpenerRoleSelection(role)}
                        className="accent-indigo-500"
                      />
                      {OPENER_ROLE_LABELS[role]}
                    </label>
                  )
                })}
              </div>
              <p className="text-xs text-slate-500">管理者保有最高權限，會一併允許開啟與關閉任務。</p>
            </div>
          ) : null}

          <label className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.scan_window_enabled}
              onChange={event => setForm({ ...form, scan_window_enabled: event.target.checked })}
              className="accent-indigo-500"
            />
            任務開放時間
          </label>

          {form.scan_window_enabled ? (
            <>
              <div>
                <label className="mb-1 block text-sm text-slate-400">開始時間</label>
                <input
                  type="time"
                  value={form.window_start_time}
                  onChange={event => setForm({ ...form, window_start_time: event.target.value })}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-slate-400">結束時間</label>
                <input
                  type="time"
                  value={form.window_end_time}
                  onChange={event => setForm({ ...form, window_end_time: event.target.value })}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
                />
              </div>
            </>
          ) : null}
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-400">描述</label>
          <textarea
            value={form.description}
            onChange={event => setForm({ ...form, description: event.target.value })}
            rows={3}
            className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
          />
        </div>

        {message ? <p className="text-sm text-green-400">{message}</p> : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <button
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          <Save size={16} /> {saving ? '儲存中...' : editingTask ? '更新任務' : '建立任務'}
        </button>
      </form>

      <div className="grid gap-3">
        {tasks.map(task => {
          const classNames = classNamesForTask(task)
          return (
            <div key={task.id} className="space-y-3 rounded-lg bg-slate-800 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{task.title}</h3>
                  <p className="text-sm text-slate-400">{task.description || '尚無描述'}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {task.points} 點 · {SCOPE_LABELS[task.scope_type]} · {RECURRENCE_LABELS[task.recurrence_type]} · 每週期上限 {task.per_period_limit} 次 · {formatCooldown(task.claim_cooldown_minutes ?? 0)}
                    {task.allow_scanner ? ' · 可掃碼' : ''}
                    {task.allow_button_claim ? ' · 可按鈕完成' : ''}
                    {task.scan_window_enabled && task.window_start_time && task.window_end_time
                      ? ` · ${task.window_start_time.slice(0, 5)}-${task.window_end_time.slice(0, 5)}`
                      : ''}
                  </p>
                  {task.allow_scanner ? (
                    <p className="mt-1 text-xs text-amber-300">可開通角色：{formatOpenerRoles(task.allowed_opener_roles)}</p>
                  ) : null}
                  {task.scope_type === 'class' ? (
                    <p className="mt-1 text-xs text-indigo-300">
                      指定班級：{classNames.length > 0 ? classNames.join('、') : '未設定'}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-emerald-300">適用範圍：全校</p>
                  )}
                </div>

                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    task.is_active ? 'bg-green-600/20 text-green-300' : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {task.is_active ? '啟用中' : '已停用'}
                </span>
              </div>

              <BarcodeLabel
                value={task.task_code}
                label="任務條碼"
                filename={`${task.title}-barcode.png`}
                metaLines={[
                  `任務：${task.title}`,
                  `範圍：${task.scope_type === 'school' ? '全校' : classNames.join('、') || '班級任務'}`,
                  `點數：${task.points}`,
                  `可開通角色：${formatOpenerRoles(task.allowed_opener_roles)}`
                ]}
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => beginEditTask(task)}
                  className="flex items-center gap-2 rounded-lg bg-amber-600/20 px-3 py-2 text-sm text-amber-300 hover:bg-amber-600/30"
                >
                  <Pencil size={16} /> 編輯
                </button>

                <button
                  type="button"
                  onClick={() => toggleTaskActive(task)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                    task.is_active
                      ? 'bg-red-600/20 text-red-300 hover:bg-red-600/30'
                      : 'bg-green-600/20 text-green-300 hover:bg-green-600/30'
                  }`}
                >
                  {task.is_active ? <PowerOff size={16} /> : <Power size={16} />}
                  {task.is_active ? '停用任務' : '啟用任務'}
                </button>

                <button
                  type="button"
                  onClick={() => softDeleteTask(task)}
                  className="flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
                >
                  <Trash2 size={16} /> 刪除
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedTaskId(task.id)}
                  className="flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
                >
                  <RefreshCw size={16} /> 查看紀錄
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {selectedTask ? (
        <div className="rounded-lg bg-slate-800 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold">{selectedTask.title} 發點紀錄</h2>
            <button
              onClick={exportRecords}
              className="flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
            >
              <Download size={16} /> 匯出 CSV
            </button>
          </div>

          {completions.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">目前還沒有完成紀錄。</p>
          ) : (
            <div className="space-y-2">
              {completions.map(row => (
                <div
                  key={row.id}
                  className="flex flex-col gap-1 rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-slate-200">{row.user?.name ?? '未知學生'}</p>
                    <p className="text-xs text-slate-500">
                      {row.user?.student_id ?? row.user?.student_no ?? '-'} · 週期 {row.period_key ?? 'once'}
                    </p>
                  </div>
                  <div className="text-xs text-slate-400">
                    <p>{new Date(row.completed_at).toLocaleString('zh-TW')}</p>
                    <p>發點者：{row.awarded_by_profile?.name ?? '系統'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
