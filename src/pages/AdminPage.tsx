import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Save, Shield, ShieldCheck, UserRoundCog } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ROLE_LABELS } from '../lib/constants'
import type { Class, Profile, Role } from '../types'

type ManagedProfile = Profile

const editableRoles: Role[] = ['student', 'leader', 'teacher', 'admin']

export default function AdminPage() {
  const [profiles, setProfiles] = useState<ManagedProfile[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ManagedProfile | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const filteredProfiles = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return profiles

    return profiles.filter(profile => {
      const className = classes.find(item => item.id === profile.class_id)?.name ?? ''
      const text = `${profile.name} ${profile.email} ${profile.student_id ?? ''} ${profile.title ?? ''} ${className} ${profile.role}`.toLowerCase()
      return text.includes(keyword)
    })
  }, [classes, profiles, query])

  const selectedProfile = useMemo(
    () => filteredProfiles.find(profile => profile.id === selectedId) ?? filteredProfiles[0] ?? null,
    [filteredProfiles, selectedId]
  )

  useEffect(() => {
    void Promise.all([loadProfiles(), loadClasses()])
  }, [])

  useEffect(() => {
    if (selectedProfile) {
      setDraft({ ...selectedProfile })
    }
  }, [selectedProfile])

  const loadProfiles = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    setProfiles((data ?? []) as ManagedProfile[])
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

  const saveProfile = async () => {
    if (!draft) return

    setSaving(true)
    setError(null)
    setMessage(null)

    const { error } = await supabase
      .from('profiles')
      .update({
        role: draft.role,
        title: draft.title?.trim() || null,
        class_id: draft.class_id || null,
        student_id: draft.student_id?.trim() || null,
        name: draft.name.trim()
      })
      .eq('id', draft.id)

    if (error) {
      setError(error.message)
    } else {
      setMessage(`已更新 ${draft.name} 的權限設定`)
      await loadProfiles()
    }

    setSaving(false)
  }

  const resetScanCode = async () => {
    if (!draft) return

    setSaving(true)
    setError(null)
    setMessage(null)

    const { data, error } = await supabase.rpc('reset_profile_scan_code', {
      p_profile_id: draft.id
    })

    if (error) {
      setError(error.message)
    } else {
      const newCode = data?.[0]?.scan_code as string | undefined
      if (newCode) {
        setDraft({ ...draft, scan_code: newCode })
      }
      setMessage(`已重設 ${draft.name} 的身分條碼`)
      await loadProfiles()
    }

    setSaving(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">管理者後台</h1>
          <p className="mt-1 text-sm text-slate-400">
            先請使用者自行註冊，再由管理者在這裡升級成教師或其他高權限角色。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadProfiles()}
          className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-700"
        >
          <RefreshCw size={16} /> 重新整理
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <section className="space-y-3 rounded-xl bg-slate-800 p-4">
          <div className="space-y-2">
            <label className="block text-sm text-slate-400">搜尋帳號</label>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="姓名、Email、角色、班級"
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-2">
            {filteredProfiles.map(profile => (
              <button
                key={profile.id}
                type="button"
                onClick={() => setSelectedId(profile.id)}
                className={`w-full rounded-lg border px-3 py-3 text-left ${
                  selectedProfile?.id === profile.id
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-slate-700 bg-slate-900/40 hover:bg-slate-700/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-white">{profile.name}</p>
                  <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[11px] text-slate-300">
                    {ROLE_LABELS[profile.role]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{profile.email}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {profile.title || '未設定職稱'}
                  {profile.class_id ? ` · ${classes.find(item => item.id === profile.class_id)?.name ?? '未命名班級'}` : ''}
                </p>
              </button>
            ))}

            {filteredProfiles.length === 0 && (
              <p className="rounded-lg bg-slate-900/40 px-3 py-6 text-center text-sm text-slate-500">
                找不到符合條件的帳號。
              </p>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-xl bg-slate-800 p-4">
          {!draft ? (
            <div className="rounded-lg bg-slate-900/40 px-4 py-10 text-center text-slate-500">
              請先從左側選擇一個帳號。
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 font-semibold">
                    <ShieldCheck size={18} className="text-indigo-400" />
                    帳號權限設定
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">{draft.email}</p>
                </div>
                <span className="rounded-full bg-indigo-500/10 px-2.5 py-1 text-xs text-indigo-300">
                  {ROLE_LABELS[draft.role]}
                </span>
              </div>

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
                  <label className="mb-1 block text-sm text-slate-400">角色</label>
                  <select
                    value={draft.role}
                    onChange={event => setDraft({ ...draft, role: event.target.value as Role })}
                    className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
                  >
                    {editableRoles.map(role => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm text-slate-400">職稱</label>
                  <input
                    value={draft.title ?? ''}
                    onChange={event => setDraft({ ...draft, title: event.target.value })}
                    placeholder="例如：導師、學務主任"
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
                    <option value="">未指定</option>
                    {classes.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.grade}年級 {item.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm text-slate-400">學號</label>
                  <input
                    value={draft.student_id ?? ''}
                    onChange={event => setDraft({ ...draft, student_id: event.target.value })}
                    className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm text-slate-400">星星</label>
                  <div className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-slate-300">
                    {draft.stars}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm text-slate-300">
                  <UserRoundCog size={16} className="text-indigo-400" />
                  身分條碼
                </div>
                <div className="rounded-lg bg-slate-800 p-3">
                  <p className="break-all text-sm text-indigo-300">{draft.scan_code ?? '尚未建立'}</p>
                </div>
              </div>

              {message && <p className="text-sm text-green-400">{message}</p>}
              {error && <p className="text-sm text-red-400">{error}</p>}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  <Save size={16} /> 儲存權限設定
                </button>
                <button
                  type="button"
                  onClick={resetScanCode}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-600 disabled:opacity-50"
                >
                  <Shield size={16} /> 重設身分條碼
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
