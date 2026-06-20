import { useEffect, useMemo, useState } from 'react'
import { Download, Plus, Printer, RefreshCw, Save, Search, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import BarcodeLabel from '../components/BarcodeLabel'
import { ROLE_LABELS } from '../lib/constants'
import { useAuthStore } from '../stores/authStore'
import { createScanCode, downloadCsv } from '../utils/codes'
import type { Class, Role, StudentRoster } from '../types'

type EditableStudent = StudentRoster

const emptyStudentForm = {
  name: '',
  student_no: '',
  email: '',
  role: 'student' as Exclude<Role, 'teacher' | 'admin'>,
  title: '',
  class_id: ''
}

export default function TeacherStudentsPage() {
  const { user } = useAuthStore()
  const [students, setStudents] = useState<EditableStudent[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditableStudent | null>(null)
  const [studentForm, setStudentForm] = useState(emptyStudentForm)
  const [classForm, setClassForm] = useState({ name: '', grade: 1 })
  const [batchText, setBatchText] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const selected = useMemo(
    () => students.find(student => student.id === selectedId) ?? students[0],
    [selectedId, students]
  )

  const filtered = students.filter(student => {
    const className = classes.find(item => item.id === student.class_id)?.name ?? ''
    const text = `${student.name} ${student.student_no} ${student.email ?? ''} ${student.title ?? ''} ${className}`.toLowerCase()
    return text.includes(query.toLowerCase())
  })

  useEffect(() => {
    loadClasses()
    loadStudents()
  }, [])

  useEffect(() => {
    if (selected) setDraft({ ...selected })
  }, [selected])

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
    setClasses((data ?? []) as Class[])
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
      setMessage('班級已建立')
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

    const { error } = await supabase.from('student_rosters').insert({
      name: studentForm.name.trim(),
      student_no: studentForm.student_no.trim(),
      email: studentForm.email.trim() || null,
      role: studentForm.role,
      title: studentForm.title.trim() || null,
      class_id: studentForm.class_id || null,
      scan_code: createScanCode('STU'),
      created_by: user.id
    })

    if (error) {
      setError(error.message)
    } else {
      setStudentForm(emptyStudentForm)
      setMessage('學生已新增到名冊')
      await loadStudents()
    }
    setSaving(false)
  }

  const saveStudent = async () => {
    if (!draft) return
    setSaving(true)
    setError(null)
    setMessage(null)

    const { error } = await supabase
      .from('student_rosters')
      .update({
        name: draft.name.trim(),
        student_no: draft.student_no.trim(),
        email: draft.email?.trim() || null,
        role: draft.role,
        title: draft.title?.trim() || null,
        class_id: draft.class_id || null
      })
      .eq('id', draft.id)

    if (error) {
      setError(error.message)
    } else {
      setMessage('學生名冊已更新')
      await loadStudents()
    }
    setSaving(false)
  }

  const resetScanCode = async () => {
    if (!draft) return
    setSaving(true)
    setError(null)
    setMessage(null)
    const scanCode = createScanCode('STU')
    const { error } = await supabase
      .from('student_rosters')
      .update({ scan_code: scanCode })
      .eq('id', draft.id)

    if (error) {
      setError(error.message)
    } else {
      setDraft({ ...draft, scan_code: scanCode })
      setMessage('身分條碼已重設，舊條碼立即失效')
      await loadStudents()
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
        .filter((line, index) => !(index === 0 && /姓名|name|學號|student/i.test(line)))
        .map(line => line.split(/\t|,/).map(cell => cell.trim()))

      let imported = 0
      for (const row of rows) {
        const [studentNo, name, className = '', gradeText = '1', email = '', title = '', roleText = 'student'] = row
        if (!studentNo || !name) continue
        const classId = className ? await findOrCreateClass(className, Number(gradeText) || 1) : null
        const role: Exclude<Role, 'teacher' | 'admin'> = roleText === 'leader' || roleText.includes('幹') || roleText.includes('小老師') ? 'leader' : 'student'

        const { error } = await supabase.from('student_rosters').upsert({
          name,
          student_no: studentNo,
          email: email || null,
          role,
          title: title || null,
          class_id: classId,
          scan_code: createScanCode('STU'),
          created_by: user.id
        }, { onConflict: 'created_by,student_no' })
        if (error) throw error
        imported += 1
      }

      setBatchText('')
      setMessage(`已匯入 ${imported} 位學生`)
      await loadClasses()
      await loadStudents()
    } catch (e: any) {
      setError(e?.message || '批次匯入失敗')
    }
    setSaving(false)
  }

  const exportStudents = () => {
    downloadCsv('student-roster.csv', students.map(student => ({
      student_no: student.student_no,
      name: student.name,
      class: classes.find(item => item.id === student.class_id)?.name ?? '',
      role: ROLE_LABELS[student.role],
      title: student.title,
      email: student.email,
      scan_code: student.scan_code,
      points: student.points
    })))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">學生與條碼管理</h1>
          <p className="text-sm text-slate-400 mt-1">管理學生名冊、班級、批次匯入與列印身分條碼</p>
        </div>
        <button onClick={exportStudents} className="bg-slate-800 hover:bg-slate-700 text-white rounded-lg px-3 py-2 text-sm flex items-center gap-2">
          <Download size={16} /> 匯出名冊
        </button>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <form onSubmit={createClass} className="bg-slate-800 rounded-lg p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Plus size={18} className="text-indigo-400" /> 新增班級
          </h2>
          <div className="grid sm:grid-cols-[1fr_120px_auto] gap-3 items-end">
            <div>
              <label className="block text-sm text-slate-400 mb-1">班級名稱</label>
              <input value={classForm.name} onChange={event => setClassForm({ ...classForm, name: event.target.value })} placeholder="例如 701、七年一班、A 組" className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">年級</label>
              <input type="number" min="1" value={classForm.grade} onChange={event => setClassForm({ ...classForm, grade: Number(event.target.value) })} className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500" />
            </div>
            <button disabled={saving || !classForm.name.trim()} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium">
              建立
            </button>
          </div>
        </form>

        <form onSubmit={createStudent} className="bg-slate-800 rounded-lg p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Plus size={18} className="text-indigo-400" /> 新增學生
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <input value={studentForm.student_no} onChange={event => setStudentForm({ ...studentForm, student_no: event.target.value })} placeholder="學號" className="bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500" required />
            <input value={studentForm.name} onChange={event => setStudentForm({ ...studentForm, name: event.target.value })} placeholder="姓名" className="bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500" required />
            <select value={studentForm.class_id} onChange={event => setStudentForm({ ...studentForm, class_id: event.target.value })} className="bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500">
              <option value="">未分班</option>
              {classes.map(item => <option key={item.id} value={item.id}>{item.grade} 年級 · {item.name}</option>)}
            </select>
            <select value={studentForm.role} onChange={event => setStudentForm({ ...studentForm, role: event.target.value as Exclude<Role, 'teacher' | 'admin'> })} className="bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500">
              <option value="student">學生</option>
              <option value="leader">幹部/小老師</option>
            </select>
            <input value={studentForm.title} onChange={event => setStudentForm({ ...studentForm, title: event.target.value })} placeholder="職稱" className="bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500" />
            <input type="email" value={studentForm.email} onChange={event => setStudentForm({ ...studentForm, email: event.target.value })} placeholder="Email 可留空" className="bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500" />
          </div>
          <button disabled={saving || !studentForm.name.trim() || !studentForm.student_no.trim()} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium">
            新增到名冊
          </button>
        </form>
      </div>

      <div className="bg-slate-800 rounded-lg p-4 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Upload size={18} className="text-indigo-400" /> 批次匯入學生與班級
        </h2>
        <textarea
          value={batchText}
          onChange={event => setBatchText(event.target.value)}
          rows={5}
          className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500 font-mono text-sm"
          placeholder={'每行格式：學號,姓名,班級,年級,Email,職稱,角色\n例如：70101,王小明,701,7,,小老師,leader'}
        />
        <button onClick={importBatch} disabled={saving || !batchText.trim()} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium">
          匯入
        </button>
      </div>

      {(message || error) && (
        <div className="space-y-1">
          {message && <p className="text-sm text-green-400">{message}</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      )}

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input value={query} onChange={event => setQuery(event.target.value)} className="w-full bg-slate-800 text-white rounded-lg pl-10 pr-3 py-2 border border-slate-700 outline-none focus:border-indigo-500" placeholder="搜尋姓名、學號、班級、Email 或職稱" />
      </div>

      <div className="grid lg:grid-cols-[280px_1fr] gap-4">
        <div className="bg-slate-800 rounded-lg p-3 space-y-2 max-h-[620px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">尚無學生名冊</p>
          ) : filtered.map(student => (
            <button key={student.id} onClick={() => setSelectedId(student.id)} className={`w-full text-left rounded-lg px-3 py-2 border ${draft?.id === student.id ? 'bg-indigo-600/20 border-indigo-500' : 'bg-slate-700/40 border-transparent hover:bg-slate-700'}`}>
              <p className="font-medium text-sm">{student.name}</p>
              <p className="text-xs text-slate-400">{student.student_no} · {classes.find(item => item.id === student.class_id)?.name ?? '未分班'}</p>
              <span className="text-[11px] text-indigo-300">{ROLE_LABELS[student.role]} · {student.points} 點</span>
            </button>
          ))}
        </div>

        {draft && (
          <div className="space-y-4">
            <div className="bg-slate-800 rounded-lg p-4 space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">姓名</label>
                  <input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">學號</label>
                  <input value={draft.student_no} onChange={event => setDraft({ ...draft, student_no: event.target.value })} className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">班級</label>
                  <select value={draft.class_id ?? ''} onChange={event => setDraft({ ...draft, class_id: event.target.value || null })} className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500">
                    <option value="">未分班</option>
                    {classes.map(item => <option key={item.id} value={item.id}>{item.grade} 年級 · {item.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">角色</label>
                  <select value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value as Exclude<Role, 'teacher' | 'admin'> })} className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500">
                    <option value="student">學生</option>
                    <option value="leader">幹部/小老師</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">職稱</label>
                  <input value={draft.title ?? ''} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="小老師、組長、隊長..." className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Email</label>
                  <input type="email" value={draft.email ?? ''} onChange={event => setDraft({ ...draft, email: event.target.value })} className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={saveStudent} disabled={saving} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2">
                  <Save size={16} /> 儲存
                </button>
                <button onClick={resetScanCode} disabled={saving} className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2">
                  <RefreshCw size={16} /> 重設身分條碼
                </button>
                <button onClick={() => window.print()} className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2">
                  <Printer size={16} /> 列印
                </button>
              </div>
            </div>

            <BarcodeLabel value={draft.scan_code} label={`${draft.name} 身分條碼`} />
          </div>
        )}
      </div>
    </div>
  )
}
