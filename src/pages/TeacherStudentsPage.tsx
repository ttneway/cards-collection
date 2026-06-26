import { useEffect, useMemo, useState } from 'react'
import { Download, Plus, Printer, RefreshCw, Save, Search, Upload } from 'lucide-react'
import BarcodeLabel from '../components/BarcodeLabel'
import { ROLE_LABELS } from '../lib/constants'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { createScanCode, downloadCsv, printBarcodeSheet } from '../utils/codes'
import type { Class, Profile, Role, StudentRoster } from '../types'

type EditableStudent = StudentRoster
type RegisteredProfile = Profile
type UnifiedStudent = {
  id: string
  source: 'roster' | 'profile'
  auth_user_id: string | null
  profile_id: string | null
  name: string
  student_no: string
  seat_no: number | null
  email: string | null
  role: Exclude<Role, 'teacher' | 'admin'>
  title: string | null
  class_id: string | null
  scan_code: string
  points: number
  created_by: string
  created_at: string
}

const emptyStudentForm = {
  name: '',
  student_no: '',
  seat_no: '',
  email: '',
  initial_password: '',
  role: 'student' as Exclude<Role, 'teacher' | 'admin'>,
  title: '',
  class_id: ''
}

export default function TeacherStudentsPage() {
  const { user } = useAuthStore()
  const [students, setStudents] = useState<EditableStudent[]>([])
  const [registeredProfiles, setRegisteredProfiles] = useState<RegisteredProfile[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<UnifiedStudent | null>(null)
  const [selectedRegisteredId, setSelectedRegisteredId] = useState<string | null>(null)
  const [registeredDraft, setRegisteredDraft] = useState<RegisteredProfile | null>(null)
  const [studentForm, setStudentForm] = useState(emptyStudentForm)
  const [draftPassword, setDraftPassword] = useState('')
  const [classForm, setClassForm] = useState({ name: '', grade: 1 })
  const [batchText, setBatchText] = useState('')
  const [printClassId, setPrintClassId] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const classedRegisteredProfiles = useMemo(() => {
    const linkedProfileIds = new Set(
      students
        .map(student => student.auth_user_id)
        .filter((value): value is string => Boolean(value))
    )

    return registeredProfiles.filter(profile => {
      if (profile.id === user?.id) return false
      if (linkedProfileIds.has(profile.id)) return false
      if (!profile.class_id) return false
      return profile.role === 'student' || profile.role === 'leader'
    })
  }, [registeredProfiles, students, user?.id])

  const studentDirectory = useMemo<UnifiedStudent[]>(() => {
    const rosterStudents: UnifiedStudent[] = students.map(student => ({
      id: `roster:${student.id}`,
      source: 'roster',
      auth_user_id: student.auth_user_id,
      profile_id: student.auth_user_id,
      name: student.name,
      student_no: student.student_no,
      seat_no: student.seat_no,
      email: student.email,
      role: student.role,
      title: student.title,
      class_id: student.class_id,
      scan_code: student.scan_code,
      points: student.points,
      created_by: student.created_by,
      created_at: student.created_at
    }))

    const registeredStudents: UnifiedStudent[] = classedRegisteredProfiles.map(profile => ({
      id: `profile:${profile.id}`,
      source: 'profile',
      auth_user_id: profile.id,
      profile_id: profile.id,
      name: profile.name,
      student_no: profile.student_id ?? '',
      seat_no: null,
      email: profile.email,
      role: profile.role === 'leader' ? 'leader' : 'student',
      title: profile.title,
      class_id: profile.class_id,
      scan_code: profile.scan_code ?? '',
      points: profile.stars,
      created_by: '',
      created_at: profile.created_at
    }))

    return [...rosterStudents, ...registeredStudents].sort((left, right) => {
      const classNameLeft = classes.find(item => item.id === left.class_id)?.name ?? ''
      const classNameRight = classes.find(item => item.id === right.class_id)?.name ?? ''
      if (classNameLeft !== classNameRight) return classNameLeft.localeCompare(classNameRight, 'zh-Hant')
      const seatDiff = (left.seat_no ?? 999) - (right.seat_no ?? 999)
      if (seatDiff !== 0) return seatDiff
      return left.name.localeCompare(right.name, 'zh-Hant')
    })
  }, [classedRegisteredProfiles, classes, students])

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return studentDirectory.filter(student => {
      if (!keyword) return true
      const className = classes.find(item => item.id === student.class_id)?.name ?? ''
      const text = `${student.name} ${student.student_no} ${student.seat_no ?? ''} ${student.email ?? ''} ${student.title ?? ''} ${className}`.toLowerCase()
      return text.includes(keyword)
    })
  }, [classes, query, studentDirectory])

  const selected = useMemo(
    () => studentDirectory.find(student => student.id === selectedId) ?? studentDirectory[0] ?? null,
    [selectedId, studentDirectory]
  )

  const printableStudents = useMemo(() => {
    return studentDirectory
      .filter(student => student.class_id === printClassId)
      .sort((left, right) => {
        const seatDiff = (left.seat_no ?? 999) - (right.seat_no ?? 999)
        if (seatDiff !== 0) return seatDiff
        return left.student_no.localeCompare(right.student_no)
      })
  }, [printClassId, studentDirectory])

  const pendingRegisteredProfiles = useMemo(() => {
    const linkedProfileIds = new Set(
      students
        .map(student => student.auth_user_id)
        .filter((value): value is string => Boolean(value))
    )

    return registeredProfiles.filter(profile => {
      if (profile.id === user?.id) return false
      if (linkedProfileIds.has(profile.id)) return false

      const prefix = (profile.scan_code ?? '').slice(0, 3).toUpperCase()
      return prefix === 'USR' || (profile.role === 'student' && !profile.class_id)
    })
  }, [registeredProfiles, students, user?.id])

  const selectedRegisteredProfile = useMemo(
    () => pendingRegisteredProfiles.find(profile => profile.id === selectedRegisteredId) ?? pendingRegisteredProfiles[0] ?? null,
    [pendingRegisteredProfiles, selectedRegisteredId]
  )

  useEffect(() => {
    void Promise.all([loadClasses(), loadStudents(), loadRegisteredProfiles()])
  }, [])

  useEffect(() => {
    if (selected) {
      setDraft({ ...selected })
      setDraftPassword('')
    }
  }, [selected])

  useEffect(() => {
    if (selectedRegisteredProfile) {
      setRegisteredDraft({ ...selectedRegisteredProfile })
    }
  }, [selectedRegisteredProfile])

  const createManagedStudentAccount = async (rosterId: string, password: string) => {
    const { data, error } = await supabase.functions.invoke('create-managed-student-account', {
      body: {
        rosterId,
        password
      }
    })

    if (error) {
      throw new Error(error.message)
    }

    if (data?.error) {
      throw new Error(data.error)
    }

    return data as { action: 'created' | 'updated'; email: string; message: string }
  }

  const loadStudents = async () => {
    const { data, error } = await supabase
      .from('student_rosters')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    setStudents((data ?? []) as EditableStudent[])
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

    const rows = (data ?? []) as Class[]
    setClasses(rows)
    if (!printClassId && rows[0]) setPrintClassId(rows[0].id)
  }

  const createClass = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user || !classForm.name.trim()) return

    setSaving(true)
    setError(null)
    setMessage(null)

    const { error } = await supabase.from('classes').insert({
      name: classForm.name.trim(),
      grade: Number(classForm.grade),
      teacher_id: user.id
    })

    if (error) {
      setError(error.message)
    } else {
      setClassForm({ name: '', grade: 1 })
      setMessage('已建立班級。')
      await loadClasses()
    }

    setSaving(false)
  }

  const createStudent = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user || !studentForm.name.trim() || !studentForm.student_no.trim()) return

    setSaving(true)
    setError(null)
    setMessage(null)

    const { data, error } = await supabase
      .from('student_rosters')
      .insert({
        name: studentForm.name.trim(),
        student_no: studentForm.student_no.trim(),
        seat_no: studentForm.seat_no ? Number(studentForm.seat_no) : null,
        email: studentForm.email.trim() || null,
        role: studentForm.role,
        title: studentForm.title.trim() || null,
        class_id: studentForm.class_id || null,
        scan_code: createScanCode('STU'),
        created_by: user.id
      })
      .select('*')
      .single()

    if (error) {
      setError(error.message)
    } else {
      const createdStudent = data as EditableStudent

      if (studentForm.initial_password.trim()) {
        try {
          const result = await createManagedStudentAccount(createdStudent.id, studentForm.initial_password.trim())
          setMessage(`${result.message} 登入帳號：${result.email}`)
        } catch (accountError: any) {
          setError(accountError?.message || '學生已建立，但登入帳號建立失敗。')
        }
      } else {
        setMessage('已新增學生。尚未建立登入帳號。')
      }

      setStudentForm(emptyStudentForm)
      await loadStudents()
    }

    setSaving(false)
  }

  const loadRegisteredProfiles = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    setRegisteredProfiles((data ?? []) as RegisteredProfile[])
  }

  const saveStudent = async () => {
    if (!draft) return

    setSaving(true)
    setError(null)
    setMessage(null)

    if (draft.source === 'profile' && draft.profile_id) {
      const { error } = await supabase
        .from('profiles')
        .update({
          name: draft.name.trim(),
          student_id: draft.student_no.trim() || null,
          email: draft.email?.trim() || null,
          role: draft.role,
          title: draft.title?.trim() || null,
          class_id: draft.class_id || null
        })
        .eq('id', draft.profile_id)

      if (error) {
        setError(error.message)
      } else {
        setMessage('已儲存已註冊學生資料。')
        await loadRegisteredProfiles()
      }
    } else {
      const rosterId = draft.id.replace('roster:', '')
      const { error } = await supabase
        .from('student_rosters')
        .update({
          name: draft.name.trim(),
          student_no: draft.student_no.trim(),
          seat_no: draft.seat_no ? Number(draft.seat_no) : null,
          email: draft.email?.trim() || null,
          role: draft.role,
          title: draft.title?.trim() || null,
          class_id: draft.class_id || null
        })
        .eq('id', rosterId)

      if (error) {
        setError(error.message)
      } else {
        setMessage('已儲存學生資料。')
        await loadStudents()
      }
    }

    setSaving(false)
  }

  const resetScanCode = async () => {
    if (!draft) return

    setSaving(true)
    setError(null)
    setMessage(null)

    if (draft.source === 'profile' && draft.profile_id) {
      const { data, error } = await supabase.rpc('reset_profile_scan_code', {
        p_profile_id: draft.profile_id
      })

      if (error) {
        setError(error.message)
      } else {
        const nextCode = data?.[0]?.scan_code as string | undefined
        if (nextCode) {
          setDraft({ ...draft, scan_code: nextCode })
        }
        setMessage('已重設身分條碼，舊條碼立即失效。')
        await loadRegisteredProfiles()
      }
    } else {
      const scanCode = createScanCode('STU')
      const rosterId = draft.id.replace('roster:', '')
      const { error } = await supabase.from('student_rosters').update({ scan_code: scanCode }).eq('id', rosterId)

      if (error) {
        setError(error.message)
      } else {
        setDraft({ ...draft, scan_code: scanCode })
        setMessage('已重設身分條碼，舊條碼立即失效。')
        await loadStudents()
      }
    }

    setSaving(false)
  }

  const provisionDraftAccount = async () => {
    if (!draft) return
    if (draft.source === 'profile') {
      setError('這個學生已經是註冊帳號，不需要在這裡建立登入帳號。')
      return
    }
    if (draftPassword.trim().length < 6) {
      setError('請輸入至少 6 個字元的初始密碼。')
      return
    }

    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      const rosterId = draft.id.replace('roster:', '')
      const result = await createManagedStudentAccount(rosterId, draftPassword.trim())
      setDraftPassword('')
      setMessage(`${result.message} 登入帳號：${result.email}`)
      await loadStudents()
    } catch (caught: any) {
      setError(caught?.message || '建立學生登入帳號失敗。')
    }

    setSaving(false)
  }

  const saveRegisteredProfile = async () => {
    if (!registeredDraft) return

    setSaving(true)
    setError(null)
    setMessage(null)

    const nextRole: Role =
      user?.role === 'admin' && registeredDraft.role === 'teacher'
        ? 'teacher'
        : registeredDraft.role === 'leader'
          ? 'leader'
          : 'student'

    const { error } = await supabase
      .from('profiles')
      .update({
        name: registeredDraft.name.trim(),
        title: registeredDraft.title?.trim() || null,
        class_id: nextRole === 'teacher' ? null : registeredDraft.class_id || null,
        student_id: registeredDraft.student_id?.trim() || null,
        role: nextRole
      })
      .eq('id', registeredDraft.id)

    if (error) {
      setError(error.message)
    } else {
      setMessage(
        nextRole === 'teacher'
          ? `已將 ${registeredDraft.name} 歸類為教師，身分碼會自動改為 TEA 開頭。`
          : `已更新 ${registeredDraft.name} 的班級歸類，身分碼會自動改為 STU 開頭。`
      )
      await loadRegisteredProfiles()
    }

    setSaving(false)
  }

  const findOrCreateClass = async (name: string, grade: number) => {
    if (!user) return null
    const trimmedName = name.trim()
    if (!trimmedName) return null

    const existing = classes.find(item => item.name === trimmedName && Number(item.grade) === Number(grade))
    if (existing) return existing.id

    const { data, error } = await supabase
      .from('classes')
      .insert({ name: trimmedName, grade: Number(grade), teacher_id: user.id })
      .select('*')
      .single()

    if (error) throw error

    const newClass = data as Class
    setClasses(previous => [...previous, newClass])
    return newClass.id
  }

  const importBatch = async () => {
    if (!user || !batchText.trim()) return

    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      const lines = batchText.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
      const rows = lines
        .filter((line, index) => !(index === 0 && /name|姓名|學號/i.test(line)))
        .map(line => line.split(/\t|,/).map(cell => cell.trim()))

      let imported = 0
      let provisioned = 0

      for (const row of rows) {
        const [
          studentNo,
          name,
          className = '',
          gradeText = '1',
          seatNo = '',
          email = '',
          title = '',
          roleText = 'student',
          initialPassword = ''
        ] = row

        if (!studentNo || !name) continue

        const classId = className ? await findOrCreateClass(className, Number(gradeText) || 1) : null
        const role: Exclude<Role, 'teacher' | 'admin'> =
          roleText === 'leader' || roleText.includes('幹部') || roleText.includes('小老師') ? 'leader' : 'student'

        const { data, error } = await supabase
          .from('student_rosters')
          .upsert(
            {
              name,
              student_no: studentNo,
              seat_no: seatNo ? Number(seatNo) : null,
              email: email || null,
              role,
              title: title || null,
              class_id: classId,
              scan_code: createScanCode('STU'),
              created_by: user.id
            },
            { onConflict: 'created_by,student_no' }
          )
          .select('*')
          .single()

        if (error) throw error

        if (initialPassword.trim()) {
          await createManagedStudentAccount((data as EditableStudent).id, initialPassword.trim())
          provisioned += 1
        }

        imported += 1
      }

      setBatchText('')
      setMessage(
        provisioned > 0
          ? `已匯入 ${imported} 筆學生資料，並開通 ${provisioned} 個登入帳號。`
          : `已匯入 ${imported} 筆學生資料。`
      )
      await loadClasses()
      await loadStudents()
    } catch (caught: any) {
      setError(caught?.message || '批次匯入失敗。')
    }

    setSaving(false)
  }

  const exportStudents = () => {
    downloadCsv(
      'student-roster.csv',
      studentDirectory.map(student => ({
        student_no: student.student_no,
        name: student.name,
        class: classes.find(item => item.id === student.class_id)?.name ?? '',
        seat_no: student.seat_no ?? '',
        role: ROLE_LABELS[student.role],
        title: student.title,
        email: student.email,
        scan_code: student.scan_code,
        points: student.points,
        source: student.source === 'profile' ? '註冊帳號' : '學生名冊'
      }))
    )
  }

  const printClassSheet = () => {
    const className = classes.find(item => item.id === printClassId)?.name ?? '未指定班級'
    if (printableStudents.length === 0) return

    printBarcodeSheet(
      `${className} 全班條碼`,
      printableStudents.map(student => ({
        title: student.name,
        value: student.scan_code,
        metaLines: [
          `班級：${className}`,
          `座號：${student.seat_no ?? '-'}`,
          `學號：${student.student_no}`
        ]
      }))
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">學生與條碼管理</h1>
          <p className="mt-1 text-sm text-slate-400">管理學生名冊、班級、批次匯入，並輸出適合掃描器使用的條碼。</p>
        </div>
        <button
          onClick={exportStudents}
          className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-700"
        >
          <Download size={16} /> 匯出名冊
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={createClass} className="space-y-3 rounded-lg bg-slate-800 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Plus size={18} className="text-indigo-400" /> 新增班級
          </h2>
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_120px_auto]">
            <div>
              <label className="mb-1 block text-sm text-slate-400">班級名稱</label>
              <input
                value={classForm.name}
                onChange={event => setClassForm({ ...classForm, name: event.target.value })}
                placeholder="例如：701"
                className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-400">年級</label>
              <input
                type="number"
                min="1"
                value={classForm.grade}
                onChange={event => setClassForm({ ...classForm, grade: Number(event.target.value) })}
                className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
              />
            </div>
            <button disabled={saving || !classForm.name.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
              建立
            </button>
          </div>
        </form>

        <form onSubmit={createStudent} className="space-y-3 rounded-lg bg-slate-800 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Plus size={18} className="text-indigo-400" /> 新增學生
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={studentForm.student_no}
              onChange={event => setStudentForm({ ...studentForm, student_no: event.target.value })}
              placeholder="學號"
              className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
              required
            />
            <input
              value={studentForm.name}
              onChange={event => setStudentForm({ ...studentForm, name: event.target.value })}
              placeholder="姓名"
              className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
              required
            />
            <select
              value={studentForm.class_id}
              onChange={event => setStudentForm({ ...studentForm, class_id: event.target.value })}
              className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            >
              <option value="">未指定班級</option>
              {classes.map(item => (
                <option key={item.id} value={item.id}>
                  {item.grade} 年級 · {item.name}
                </option>
              ))}
            </select>
            <input
              value={studentForm.seat_no}
              onChange={event => setStudentForm({ ...studentForm, seat_no: event.target.value })}
              placeholder="座號"
              className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
            <select
              value={studentForm.role}
              onChange={event => setStudentForm({ ...studentForm, role: event.target.value as Exclude<Role, 'teacher' | 'admin'> })}
              className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            >
              <option value="student">學生</option>
              <option value="leader">幹部 / 小老師</option>
            </select>
            <input
              value={studentForm.title}
              onChange={event => setStudentForm({ ...studentForm, title: event.target.value })}
              placeholder="職稱"
              className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
            <input
              type="email"
              value={studentForm.email}
              onChange={event => setStudentForm({ ...studentForm, email: event.target.value })}
              placeholder="Email（選填）"
              className="sm:col-span-2 rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
            <input
              type="password"
              value={studentForm.initial_password}
              onChange={event => setStudentForm({ ...studentForm, initial_password: event.target.value })}
              placeholder="初始密碼（選填，至少 6 碼）"
              className="sm:col-span-2 rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
          </div>
          <p className="text-xs text-slate-500">
            若有填初始密碼，系統會同步建立學生登入帳號。之後學生可用 Email、姓名或身分條碼登入。
          </p>
          <button
            disabled={saving || !studentForm.name.trim() || !studentForm.student_no.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            新增學生
          </button>
        </form>
      </div>

      <div className="space-y-3 rounded-lg bg-slate-800 p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Upload size={18} className="text-indigo-400" /> 批次匯入學生
        </h2>
        <textarea
          value={batchText}
          onChange={event => setBatchText(event.target.value)}
          rows={5}
          className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 font-mono text-sm text-white outline-none focus:border-indigo-500"
          placeholder={'學號,姓名,班級,年級,座號,Email,職稱,角色,初始密碼\nA0101,王小明,701,7,1,,,student,abc12345'}
        />
        <p className="text-xs text-slate-500">
          批次欄位順序：學號、姓名、班級、年級、座號、Email、職稱、角色、初始密碼。若有填初始密碼，就會同步建立登入帳號。
        </p>
        <button
          onClick={importBatch}
          disabled={saving || !batchText.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          開始匯入
        </button>
      </div>

      <div className="space-y-3 rounded-lg bg-slate-800 p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Printer size={18} className="text-amber-400" /> 全班列印
        </h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <select
            value={printClassId}
            onChange={event => setPrintClassId(event.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
          >
            <option value="">請選擇班級</option>
            {classes.map(item => (
              <option key={item.id} value={item.id}>
                {item.grade} 年級 · {item.name}
              </option>
            ))}
          </select>
          <button
            onClick={printClassSheet}
            disabled={!printClassId || printableStudents.length === 0}
            className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Printer size={16} /> 列印全班
          </button>
        </div>
        <p className="text-xs text-slate-500">列印內容只包含姓名、班級、座號、學號與一維條碼，方便掃描器辨識。</p>
      </div>

      {(message || error) ? (
        <div className="space-y-1">
          {message ? <p className="text-sm text-green-400">{message}</p> : null}
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </div>
      ) : null}

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2 pl-10 pr-3 text-white outline-none focus:border-indigo-500"
          placeholder="搜尋姓名、學號、座號、班級、Email"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="max-h-[620px] space-y-2 overflow-y-auto rounded-lg bg-slate-800 p-3">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">找不到學生資料。</p>
          ) : (
            filtered.map(student => (
              <button
                key={student.id}
                onClick={() => setSelectedId(student.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left ${
                  draft?.id === student.id ? 'border-indigo-500 bg-indigo-600/20' : 'border-transparent bg-slate-700/40 hover:bg-slate-700'
                }`}
              >
                <p className="text-sm font-medium">{student.name}</p>
                <p className="text-xs text-slate-400">
                  {student.student_no} · {classes.find(item => item.id === student.class_id)?.name ?? '未指定班級'} · 座號 {student.seat_no ?? '-'}
                </p>
                <span className="text-[11px] text-indigo-300">
                  {ROLE_LABELS[student.role]} · {student.points} 點
                </span>
                <p className="mt-1 text-[11px] text-slate-500">
                  {student.source === 'profile'
                    ? '已註冊帳號'
                    : student.auth_user_id
                      ? '已建立登入帳號'
                      : '尚未建立登入帳號'}
                </p>
              </button>
            ))
          )}
        </div>

        {draft ? (
          <div className="space-y-4">
            <div className="space-y-4 rounded-lg bg-slate-800 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-slate-400">姓名</label>
                  <input
                    value={draft.name}
                    onChange={event => setDraft({ ...draft, name: event.target.value })}
                    className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-400">學號</label>
                  <input
                    value={draft.student_no}
                    onChange={event => setDraft({ ...draft, student_no: event.target.value })}
                    className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-400">班級</label>
                  <select
                    value={draft.class_id ?? ''}
                    onChange={event => setDraft({ ...draft, class_id: event.target.value || null })}
                    className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
                  >
                    <option value="">未指定班級</option>
                    {classes.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.grade} 年級 · {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-400">座號</label>
                  <input
                    value={draft.seat_no ?? ''}
                    onChange={event => setDraft({ ...draft, seat_no: event.target.value ? Number(event.target.value) : null })}
                    className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-400">角色</label>
                  <select
                    value={draft.role}
                    onChange={event => setDraft({ ...draft, role: event.target.value as Exclude<Role, 'teacher' | 'admin'> })}
                    className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
                  >
                    <option value="student">學生</option>
                    <option value="leader">幹部 / 小老師</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-400">職稱</label>
                  <input
                    value={draft.title ?? ''}
                    onChange={event => setDraft({ ...draft, title: event.target.value })}
                    className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm text-slate-400">Email</label>
                  <input
                    type="email"
                    value={draft.email ?? ''}
                    onChange={event => setDraft({ ...draft, email: event.target.value })}
                    className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={saveStudent}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  <Save size={16} /> 儲存
                </button>
                <button
                  onClick={resetScanCode}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600 disabled:opacity-50"
                >
                  <RefreshCw size={16} /> 重設身分條碼
                </button>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">學生登入帳號</h3>
                    <p className="mt-1 text-xs text-slate-400">
                      {draft.source === 'profile'
                        ? '這位學生本身就是已註冊帳號，登入帳號由學生自己管理。'
                        : draft.auth_user_id
                        ? '這位學生已經有登入帳號，可以在這裡重設初始密碼。'
                        : '這位學生目前只有名冊資料，還沒有可登入的帳號。'}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                    draft.source === 'profile' || draft.auth_user_id
                      ? 'bg-emerald-500/10 text-emerald-300'
                      : 'bg-amber-500/10 text-amber-300'
                  }`}>
                    {draft.source === 'profile' || draft.auth_user_id ? '已開通登入' : '尚未開通'}
                  </span>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <input
                    type="password"
                    value={draftPassword}
                    onChange={event => setDraftPassword(event.target.value)}
                    placeholder={
                      draft.source === 'profile'
                        ? '已註冊帳號不在此頁重設密碼'
                        : draft.auth_user_id
                          ? '輸入新密碼（至少 6 碼）'
                          : '輸入初始密碼（至少 6 碼）'
                    }
                    disabled={draft.source === 'profile'}
                    className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={provisionDraftAccount}
                    disabled={saving || draft.source === 'profile' || draftPassword.trim().length < 6}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {draft.source === 'profile'
                      ? '已註冊帳號'
                      : draft.auth_user_id
                        ? '重設登入密碼'
                        : '建立登入帳號'}
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {draft.source === 'profile'
                    ? '這位學生已經能用自己的 Email、姓名或身分條碼搭配密碼登入。'
                    : '建立完成後，學生可以用 Email、姓名或身分條碼搭配密碼登入。'}
                </p>
              </div>
            </div>

            <BarcodeLabel
              value={draft.scan_code}
              label={`${draft.name} 身分條碼`}
              filename={`${draft.name}-barcode.png`}
              metaLines={[
                `班級：${classes.find(item => item.id === draft.class_id)?.name ?? '未指定班級'}`,
                `座號：${draft.seat_no ?? '-'}`,
                `學號：${draft.student_no}`
              ]}
            />
          </div>
        ) : null}
      </div>

      <section className="space-y-4 rounded-lg bg-slate-800 p-4">
        <div>
          <h2 className="text-lg font-semibold text-white">已註冊學生帳號</h2>
          <p className="mt-1 text-sm text-slate-400">
            這裡會列出自己註冊、尚未綁定到學生名冊的學生帳號。即使已經分班，也會保留在這裡，方便直接查看與列印身分條碼。
          </p>
        </div>

        {pendingRegisteredProfiles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-8 text-center text-sm text-slate-500">
            目前沒有待歸類的自主註冊帳號。
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-lg bg-slate-900/30 p-3">
              {pendingRegisteredProfiles.map(profile => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => setSelectedRegisteredId(profile.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left ${
                    registeredDraft?.id === profile.id ? 'border-indigo-500 bg-indigo-600/20' : 'border-transparent bg-slate-700/40 hover:bg-slate-700'
                  }`}
                >
                  <p className="text-sm font-medium text-white">{profile.name}</p>
                  <p className="mt-1 text-xs text-slate-400">{profile.email}</p>
                  <p className="mt-1 text-[11px] text-amber-300">{profile.scan_code ?? '尚未產生身分碼'}</p>
                </button>
              ))}
            </div>

            {registeredDraft ? (
              <div className="space-y-4 rounded-lg bg-slate-900/30 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm text-slate-400">姓名</label>
                    <input
                      value={registeredDraft.name}
                      onChange={event => setRegisteredDraft({ ...registeredDraft, name: event.target.value })}
                      className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-slate-400">登入 Email</label>
                    <input
                      value={registeredDraft.email}
                      readOnly
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-slate-400">角色</label>
                    <select
                      value={registeredDraft.role}
                      onChange={event => setRegisteredDraft({ ...registeredDraft, role: event.target.value as Role })}
                      className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
                    >
                      <option value="student">學生</option>
                      <option value="leader">幹部 / 小老師</option>
                      {user?.role === 'admin' ? <option value="teacher">教師</option> : null}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-slate-400">班級</label>
                    <select
                      value={registeredDraft.class_id ?? ''}
                      onChange={event => setRegisteredDraft({ ...registeredDraft, class_id: event.target.value || null })}
                      disabled={registeredDraft.role === 'teacher'}
                      className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500 disabled:opacity-50"
                    >
                      <option value="">未指定班級</option>
                      {classes.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.grade} 年級 · {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-slate-400">學號 / 識別代碼</label>
                    <input
                      value={registeredDraft.student_id ?? ''}
                      onChange={event => setRegisteredDraft({ ...registeredDraft, student_id: event.target.value })}
                      className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-slate-400">職稱</label>
                    <input
                      value={registeredDraft.title ?? ''}
                      onChange={event => setRegisteredDraft({ ...registeredDraft, title: event.target.value })}
                      className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-3 text-sm text-slate-300">
                  <p>目前身分碼：<span className="font-mono text-indigo-300">{registeredDraft.scan_code ?? '尚未產生'}</span></p>
                  <p className="mt-2 text-xs text-slate-500">
                    規則：未歸類帳號為 `USR`，歸類到班級後改為 `STU`，管理者改成教師後改為 `TEA`。
                  </p>
                </div>

                <button
                  type="button"
                  onClick={saveRegisteredProfile}
                  disabled={saving || (registeredDraft.role !== 'teacher' && !registeredDraft.class_id)}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  <Save size={16} /> 套用歸類
                </button>

                <BarcodeLabel
                  value={registeredDraft.scan_code}
                  label={`${registeredDraft.name} 身分條碼`}
                  filename={`${registeredDraft.name}-registered-student-qr.png`}
                  metaLines={[
                    `班級：${classes.find(item => item.id === registeredDraft.class_id)?.name ?? '未指定班級'}`,
                    `角色：${registeredDraft.role === 'leader' ? '幹部 / 小老師' : '學生'}`,
                    `學號：${registeredDraft.student_id ?? '未填寫'}`
                  ]}
                />
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}
