import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarRange, Download, ListChecks, Trophy, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Class } from '../types'
import { downloadCsv } from '../utils/codes'

type AnalyticsRow = {
  completion_id: string
  task_id: string
  task_title: string
  task_points: number
  completed_at: string
  student_key: string
  student_name: string
  class_id: string | null
  student_no: string | null
  source_type: 'profile' | 'roster'
}

type ClassSummary = {
  class_id: string | null
  class_name: string
  completion_count: number
  total_points: number
  student_count: number
}

type TaskSummary = {
  task_id: string
  task_title: string
  completion_count: number
  total_points: number
  student_count: number
  last_completed_at: string
}

type StudentSummary = {
  student_key: string
  student_name: string
  student_no: string | null
  class_name: string
  completion_count: number
  total_points: number
  last_completed_at: string
}

const RANGE_OPTIONS = [
  { label: '最近 7 天', value: 7 },
  { label: '最近 30 天', value: 30 },
  { label: '最近 90 天', value: 90 },
]

function startOfDay(value: Date) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function endOfDay(value: Date) {
  const date = new Date(value)
  date.setHours(23, 59, 59, 999)
  return date
}

function formatDateInput(value: Date) {
  return value.toISOString().slice(0, 10)
}

function formatDateLabel(value: string) {
  return new Date(value).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('zh-TW')
}

function createDateRange(days: number) {
  const end = endOfDay(new Date())
  const start = startOfDay(new Date())
  start.setDate(start.getDate() - (days - 1))

  return {
    start: formatDateInput(start),
    end: formatDateInput(end),
  }
}

function isNonNull<T>(value: T | null): value is T {
  return value !== null
}

function getClassLabel(item: Pick<Class, 'grade' | 'name'>) {
  return `${item.grade} 年級 · ${item.name}`
}

function getClassNameById(classId: string | null, classNameMap: Record<string, string>) {
  if (!classId) return '未分班'
  return classNameMap[classId] ?? '未設定班級'
}

export default function TeacherAnalyticsPage() {
  const defaultRange = createDateRange(30)
  const [classes, setClasses] = useState<Class[]>([])
  const [rows, setRows] = useState<AnalyticsRow[]>([])
  const [classFilter, setClassFilter] = useState('all')
  const [studentFilter, setStudentFilter] = useState('all')
  const [taskFilter, setTaskFilter] = useState('all')
  const [dateStart, setDateStart] = useState(defaultRange.start)
  const [dateEnd, setDateEnd] = useState(defaultRange.end)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadAnalytics()
  }, [dateStart, dateEnd])

  const classNameMap = useMemo(() => {
    return classes.reduce<Record<string, string>>((accumulator, item) => {
      accumulator[item.id] = getClassLabel(item)
      return accumulator
    }, {})
  }, [classes])

  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      if (classFilter !== 'all' && row.class_id !== classFilter) return false
      if (studentFilter !== 'all' && row.student_key !== studentFilter) return false
      if (taskFilter !== 'all' && row.task_id !== taskFilter) return false
      return true
    })
  }, [rows, classFilter, studentFilter, taskFilter])

  const summary = useMemo(() => {
    const studentKeys = new Set(filteredRows.map(row => row.student_key))
    const taskIds = new Set(filteredRows.map(row => row.task_id))
    const classIds = new Set(filteredRows.map(row => row.class_id).filter(Boolean))

    return {
      completionCount: filteredRows.length,
      totalPoints: filteredRows.reduce((sum, row) => sum + row.task_points, 0),
      studentCount: studentKeys.size,
      taskCount: taskIds.size,
      classCount: classIds.size,
    }
  }, [filteredRows])

  const classSummaries = useMemo<ClassSummary[]>(() => {
    const map = new Map<string, ClassSummary & { students: Set<string> }>()

    filteredRows.forEach(row => {
      const key = row.class_id ?? 'unclassified'
      const existing = map.get(key) ?? {
        class_id: row.class_id,
        class_name: getClassNameById(row.class_id, classNameMap),
        completion_count: 0,
        total_points: 0,
        student_count: 0,
        students: new Set<string>(),
      }

      existing.completion_count += 1
      existing.total_points += row.task_points
      existing.students.add(row.student_key)
      existing.student_count = existing.students.size
      map.set(key, existing)
    })

    return Array.from(map.values())
      .map(({ students, ...value }) => value)
      .sort((left, right) => right.total_points - left.total_points)
  }, [filteredRows, classNameMap])

  const taskSummaries = useMemo<TaskSummary[]>(() => {
    const map = new Map<string, TaskSummary & { students: Set<string> }>()

    filteredRows.forEach(row => {
      const existing = map.get(row.task_id) ?? {
        task_id: row.task_id,
        task_title: row.task_title,
        completion_count: 0,
        total_points: 0,
        student_count: 0,
        last_completed_at: row.completed_at,
        students: new Set<string>(),
      }

      existing.completion_count += 1
      existing.total_points += row.task_points
      existing.students.add(row.student_key)
      existing.student_count = existing.students.size
      if (new Date(row.completed_at).getTime() > new Date(existing.last_completed_at).getTime()) {
        existing.last_completed_at = row.completed_at
      }

      map.set(row.task_id, existing)
    })

    return Array.from(map.values())
      .map(({ students, ...value }) => value)
      .sort((left, right) => right.completion_count - left.completion_count)
  }, [filteredRows])

  const studentSummaries = useMemo<StudentSummary[]>(() => {
    const map = new Map<string, StudentSummary>()

    filteredRows.forEach(row => {
      const existing = map.get(row.student_key) ?? {
        student_key: row.student_key,
        student_name: row.student_name,
        student_no: row.student_no,
        class_name: getClassNameById(row.class_id, classNameMap),
        completion_count: 0,
        total_points: 0,
        last_completed_at: row.completed_at,
      }

      existing.completion_count += 1
      existing.total_points += row.task_points
      if (new Date(row.completed_at).getTime() > new Date(existing.last_completed_at).getTime()) {
        existing.last_completed_at = row.completed_at
      }

      map.set(row.student_key, existing)
    })

    return Array.from(map.values()).sort((left, right) => right.total_points - left.total_points)
  }, [filteredRows, classNameMap])

  const trendRows = useMemo(() => {
    const map = new Map<string, { date: string; completion_count: number; total_points: number }>()

    filteredRows.forEach(row => {
      const key = row.completed_at.slice(0, 10)
      const existing = map.get(key) ?? { date: key, completion_count: 0, total_points: 0 }
      existing.completion_count += 1
      existing.total_points += row.task_points
      map.set(key, existing)
    })

    return Array.from(map.values()).sort((left, right) => left.date.localeCompare(right.date))
  }, [filteredRows])

  const selectedStudent = studentSummaries.find(student => student.student_key === studentFilter) ?? null

  const selectedStudentRows = useMemo(() => {
    if (!selectedStudent) return []

    return filteredRows
      .filter(row => row.student_key === selectedStudent.student_key)
      .sort((left, right) => new Date(right.completed_at).getTime() - new Date(left.completed_at).getTime())
  }, [filteredRows, selectedStudent])

  async function loadAnalytics() {
    setLoading(true)
    setError(null)

    const rangeStart = `${dateStart}T00:00:00.000Z`
    const rangeEnd = `${dateEnd}T23:59:59.999Z`

    const [classesResult, profileCompletionsResult, rosterCompletionsResult] = await Promise.all([
      supabase.from('classes').select('*').order('grade').order('name'),
      supabase
        .from('task_completions')
        .select(`
          id,
          completed_at,
          task:task_id(id, title, points),
          user:user_id(id, name, student_id, class_id)
        `)
        .eq('status', 'approved')
        .gte('completed_at', rangeStart)
        .lte('completed_at', rangeEnd)
        .order('completed_at', { ascending: false })
        .limit(5000),
      supabase
        .from('roster_task_completions')
        .select(`
          id,
          completed_at,
          task:task_id(id, title, points),
          student:roster_student_id(id, name, student_no, class_id)
        `)
        .eq('status', 'approved')
        .gte('completed_at', rangeStart)
        .lte('completed_at', rangeEnd)
        .order('completed_at', { ascending: false })
        .limit(5000),
    ])

    if (classesResult.error || profileCompletionsResult.error || rosterCompletionsResult.error) {
      setError(classesResult.error?.message || profileCompletionsResult.error?.message || rosterCompletionsResult.error?.message || '讀取統計資料失敗。')
      setLoading(false)
      return
    }

    setClasses((classesResult.data ?? []) as Class[])

    const profileRows = ((profileCompletionsResult.data ?? []) as any[])
      .map<AnalyticsRow | null>(row => {
        const task = Array.isArray(row.task) ? row.task[0] : row.task
        const user = Array.isArray(row.user) ? row.user[0] : row.user
        if (!task || !user) return null

        return {
          completion_id: row.id,
          task_id: task.id,
          task_title: task.title,
          task_points: task.points ?? 0,
          completed_at: row.completed_at,
          student_key: `profile:${user.id}`,
          student_name: user.name ?? '未命名學生',
          class_id: user.class_id ?? null,
          student_no: user.student_id ?? null,
          source_type: 'profile',
        }
      })
      .filter(isNonNull)

    const rosterRows = ((rosterCompletionsResult.data ?? []) as any[])
      .map<AnalyticsRow | null>(row => {
        const task = Array.isArray(row.task) ? row.task[0] : row.task
        const student = Array.isArray(row.student) ? row.student[0] : row.student
        if (!task || !student) return null

        return {
          completion_id: row.id,
          task_id: task.id,
          task_title: task.title,
          task_points: task.points ?? 0,
          completed_at: row.completed_at,
          student_key: `roster:${student.id}`,
          student_name: student.name ?? '未命名學生',
          class_id: student.class_id ?? null,
          student_no: student.student_no ?? null,
          source_type: 'roster',
        }
      })
      .filter(isNonNull)

    setRows([...profileRows, ...rosterRows])
    setLoading(false)
  }

  function exportStudentReport() {
    if (!selectedStudent) return

    downloadCsv(
      `${selectedStudent.student_name}-任務報表.csv`,
      selectedStudentRows.map(row => ({
        姓名: row.student_name,
        學號: row.student_no ?? '',
        班級: row.class_id ? classNameMap[row.class_id] ?? '' : '',
        任務: row.task_title,
        點數: row.task_points,
        完成時間: formatDateTime(row.completed_at),
        來源: row.source_type === 'profile' ? '註冊帳號' : '學生名冊',
      })),
    )
  }

  const maxClassPoints = classSummaries[0]?.total_points ?? 1
  const maxTrendPoints = Math.max(...trendRows.map(item => item.total_points), 1)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">任務統計分析</h1>
        <p className="mt-1 text-sm text-slate-400">
          從班級、任務、學生三個角度查看執行情況，支援時間區間篩選與個人報表匯出。
        </p>
      </div>

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="flex items-center gap-2 text-lg font-semibold text-white">
          <CalendarRange size={18} className="text-indigo-300" />
          篩選條件
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <p className="mb-2 text-sm text-slate-300">快速區間</p>
            <div className="flex flex-wrap gap-2">
              {RANGE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    const range = createDateRange(option.value)
                    setDateStart(range.start)
                    setDateEnd(range.end)
                  }}
                  className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white transition hover:bg-slate-600"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="space-y-2">
            <span className="text-sm text-slate-300">開始日期</span>
            <input
              type="date"
              value={dateStart}
              onChange={event => setDateStart(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm text-slate-300">結束日期</span>
            <input
              type="date"
              value={dateEnd}
              onChange={event => setDateEnd(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm text-slate-300">班級</span>
            <select
              value={classFilter}
              onChange={event => {
                setClassFilter(event.target.value)
                setStudentFilter('all')
              }}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
            >
              <option value="all">全部班級</option>
              {classes.map(item => (
                <option key={item.id} value={item.id}>
                  {getClassLabel(item)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm text-slate-300">任務</span>
            <select
              value={taskFilter}
              onChange={event => setTaskFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
            >
              <option value="all">全部任務</option>
              {taskSummaries.map(item => (
                <option key={item.task_id} value={item.task_id}>
                  {item.task_title}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 lg:col-span-2">
            <span className="text-sm text-slate-300">學生個人報表</span>
            <select
              value={studentFilter}
              onChange={event => setStudentFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
            >
              <option value="all">不指定學生</option>
              {studentSummaries.map(item => (
                <option key={item.student_key} value={item.student_key}>
                  {item.student_name} · {item.class_name}
                  {item.student_no ? ` / ${item.student_no}` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-6 text-sm text-slate-300">
          正在整理任務統計資料...
        </div>
      ) : null}

      {!loading ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <ListChecks size={16} className="text-indigo-300" />
                完成次數
              </div>
              <p className="mt-3 text-3xl font-bold text-white">{summary.completionCount}</p>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Trophy size={16} className="text-amber-300" />
                發出點數
              </div>
              <p className="mt-3 text-3xl font-bold text-white">{summary.totalPoints}</p>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Users size={16} className="text-cyan-300" />
                學生人數
              </div>
              <p className="mt-3 text-3xl font-bold text-white">{summary.studentCount}</p>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <BarChart3 size={16} className="text-emerald-300" />
                任務數量
              </div>
              <p className="mt-3 text-3xl font-bold text-white">{summary.taskCount}</p>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Users size={16} className="text-fuchsia-300" />
                涵蓋班級
              </div>
              <p className="mt-3 text-3xl font-bold text-white">{summary.classCount}</p>
            </div>
          </section>

          {filteredRows.length === 0 ? (
            <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-6 text-sm text-slate-300">
              這個條件下目前沒有任務紀錄，可以調整日期或篩選條件再看看。
            </div>
          ) : (
            <>
              <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
                  <div className="flex items-center gap-2 text-lg font-semibold text-white">
                    <Users size={18} className="text-indigo-300" />
                    班級排行榜
                  </div>

                  <div className="mt-4 space-y-3">
                    {classSummaries.map(item => (
                      <div key={item.class_id ?? 'unclassified'} className="rounded-xl bg-slate-900/70 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-white">{item.class_name}</p>
                            <p className="mt-1 text-sm text-slate-400">
                              {item.student_count} 位學生 · {item.completion_count} 次完成
                            </p>
                          </div>
                          <p className="text-lg font-semibold text-amber-300">{item.total_points} 點</p>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-slate-700">
                          <div
                            className="h-2 rounded-full bg-indigo-500"
                            style={{ width: `${Math.max((item.total_points / maxClassPoints) * 100, 8)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
                  <div className="flex items-center gap-2 text-lg font-semibold text-white">
                    <CalendarRange size={18} className="text-emerald-300" />
                    每日趨勢
                  </div>

                  <div className="mt-4 space-y-3">
                    {trendRows.map(item => (
                      <div key={item.date}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="text-slate-300">{formatDateLabel(item.date)}</span>
                          <span className="text-slate-400">
                            {item.completion_count} 次 · {item.total_points} 點
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-700">
                          <div
                            className="h-2 rounded-full bg-emerald-500"
                            style={{ width: `${Math.max((item.total_points / maxTrendPoints) * 100, 8)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
                  <div className="flex items-center gap-2 text-lg font-semibold text-white">
                    <ListChecks size={18} className="text-cyan-300" />
                    任務執行情況
                  </div>

                  <div className="mt-4 space-y-3">
                    {taskSummaries.map(item => (
                      <div key={item.task_id} className="rounded-xl bg-slate-900/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-white">{item.task_title}</p>
                            <p className="mt-1 text-sm text-slate-400">
                              {item.student_count} 位學生 · {item.completion_count} 次完成
                            </p>
                          </div>
                          <p className="text-lg font-semibold text-amber-300">{item.total_points} 點</p>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">最後完成：{formatDateTime(item.last_completed_at)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
                  <div className="flex items-center gap-2 text-lg font-semibold text-white">
                    <Trophy size={18} className="text-amber-300" />
                    學生表現
                  </div>

                  <div className="mt-4 space-y-3">
                    {studentSummaries.slice(0, 12).map((item, index) => (
                      <div key={item.student_key} className="flex items-center gap-4 rounded-xl bg-slate-900/70 p-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/20 text-sm font-semibold text-indigo-200">
                          #{index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-white">{item.student_name}</p>
                          <p className="truncate text-sm text-slate-400">
                            {item.class_name}
                            {item.student_no ? ` / ${item.student_no}` : ''}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-amber-300">{item.total_points} 點</p>
                          <p className="text-xs text-slate-500">{item.completion_count} 次完成</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">個人任務報表</h2>
                    <p className="mt-1 text-sm text-slate-400">
                      選擇上方學生後，可查看他的任務明細並匯出 CSV。
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={exportStudentReport}
                    disabled={!selectedStudent}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download size={16} />
                    匯出 CSV
                  </button>
                </div>

                {!selectedStudent ? (
                  <div className="mt-4 rounded-xl bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
                    尚未指定學生，先在上方「學生個人報表」選單選擇一位學生。
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-xl bg-slate-900/70 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold text-white">{selectedStudent.student_name}</p>
                          <p className="mt-1 text-sm text-slate-400">
                            {selectedStudent.class_name}
                            {selectedStudent.student_no ? ` / ${selectedStudent.student_no}` : ''}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-amber-300">{selectedStudent.total_points} 點</p>
                          <p className="text-sm text-slate-400">{selectedStudent.completion_count} 次完成</p>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-slate-700">
                      <div className="grid grid-cols-[1.5fr_0.7fr_1fr_0.9fr] bg-slate-900/80 px-4 py-3 text-xs font-medium text-slate-300">
                        <span>任務</span>
                        <span>點數</span>
                        <span>完成時間</span>
                        <span>來源</span>
                      </div>
                      {selectedStudentRows.map(row => (
                        <div
                          key={row.completion_id}
                          className="grid grid-cols-[1.5fr_0.7fr_1fr_0.9fr] gap-3 border-t border-slate-700 bg-slate-800/70 px-4 py-3 text-sm text-slate-200"
                        >
                          <span>{row.task_title}</span>
                          <span>{row.task_points}</span>
                          <span>{formatDateTime(row.completed_at)}</span>
                          <span>{row.source_type === 'profile' ? '註冊帳號' : '學生名冊'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </>
      ) : null}
    </div>
  )
}
