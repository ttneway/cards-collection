import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Save, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import BarcodeLabel from '../components/BarcodeLabel'
import { ROLE_LABELS } from '../lib/constants'
import type { Profile, Role } from '../types'

type EditableProfile = Pick<Profile, 'id' | 'email' | 'name' | 'student_id' | 'role' | 'title' | 'scan_code' | 'stars'>

export default function TeacherStudentsPage() {
  const [students, setStudents] = useState<EditableProfile[]>([])
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditableProfile | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const selected = useMemo(
    () => students.find(student => student.id === selectedId) ?? students[0],
    [selectedId, students]
  )

  const filtered = students.filter(student => {
    const text = `${student.name} ${student.email} ${student.student_id ?? ''} ${student.title ?? ''}`.toLowerCase()
    return text.includes(query.toLowerCase())
  })

  useEffect(() => {
    loadStudents()
  }, [])

  useEffect(() => {
    if (selected) setDraft({ ...selected })
  }, [selected])

  const loadStudents = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, name, student_id, role, title, scan_code, stars')
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      return
    }
    setStudents((data ?? []) as EditableProfile[])
  }

  const saveStudent = async () => {
    if (!draft) return
    setSaving(true)
    setError(null)
    setMessage(null)

    const { error } = await supabase
      .from('profiles')
      .update({
        name: draft.name.trim(),
        student_id: draft.student_id?.trim() || null,
        role: draft.role,
        title: draft.title?.trim() || null
      })
      .eq('id', draft.id)

    if (error) {
      setError(error.message)
    } else {
      setMessage('學生資料已更新')
      await loadStudents()
    }
    setSaving(false)
  }

  const resetScanCode = async () => {
    if (!draft) return
    setSaving(true)
    setError(null)
    setMessage(null)
    const { data, error } = await supabase.rpc('reset_profile_scan_code', { p_profile_id: draft.id })
    if (error) {
      setError(error.message)
    } else {
      const newCode = data?.[0]?.scan_code
      setDraft({ ...draft, scan_code: newCode ?? draft.scan_code })
      setMessage('身分條碼已重設，舊條碼立即失效')
      await loadStudents()
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">學生與條碼管理</h1>
        <p className="text-sm text-slate-400 mt-1">設定角色、職稱、學號，並列印或重設身分條碼</p>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          className="w-full bg-slate-800 text-white rounded-lg pl-10 pr-3 py-2 border border-slate-700 outline-none focus:border-indigo-500"
          placeholder="搜尋姓名、Email、學號或職稱"
        />
      </div>

      <div className="grid lg:grid-cols-[260px_1fr] gap-4">
        <div className="bg-slate-800 rounded-lg p-3 space-y-2 max-h-[520px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">找不到學生</p>
          ) : filtered.map(student => (
            <button
              key={student.id}
              onClick={() => setSelectedId(student.id)}
              className={`w-full text-left rounded-lg px-3 py-2 border ${
                draft?.id === student.id ? 'bg-indigo-600/20 border-indigo-500' : 'bg-slate-700/40 border-transparent hover:bg-slate-700'
              }`}
            >
              <p className="font-medium text-sm">{student.name}</p>
              <p className="text-xs text-slate-400">{student.student_id || student.email}</p>
              <span className="text-[11px] text-indigo-300">{ROLE_LABELS[student.role]}</span>
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
                  <input value={draft.student_id ?? ''} onChange={event => setDraft({ ...draft, student_id: event.target.value })} className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">角色</label>
                  <select value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value as Role })} className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500">
                    <option value="student">學生</option>
                    <option value="leader">幹部/小老師</option>
                    <option value="teacher">教師</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">職稱</label>
                  <input value={draft.title ?? ''} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="小老師、組長、隊長..." className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={saveStudent} disabled={saving} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2">
                  <Save size={16} /> 儲存
                </button>
                <button onClick={resetScanCode} disabled={saving} className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2">
                  <RefreshCw size={16} /> 重設身分條碼
                </button>
                <button onClick={() => window.print()} className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-4 py-2 text-sm font-medium">
                  列印
                </button>
              </div>
              {message && <p className="text-sm text-green-400">{message}</p>}
              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>

            <BarcodeLabel value={draft.scan_code} label={`${draft.name} 身分條碼`} />
          </div>
        )}
      </div>
    </div>
  )
}
