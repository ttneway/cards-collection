import { useEffect, useMemo, useState } from 'react'
import { Bell, Pin, RefreshCw, Save, Shield, ShieldCheck, UserRoundCog } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ROLE_LABELS } from '../lib/constants'
import type { Announcement, Class, Profile, Role } from '../types'

type ManagedProfile = Profile

const editableRoles: Role[] = ['student', 'leader', 'teacher', 'admin']

type AnnouncementForm = {
  title: string
  body: string
  is_pinned: boolean
}

const emptyAnnouncementForm: AnnouncementForm = {
  title: '',
  body: '',
  is_pinned: false
}

export default function AdminPage() {
  const [profiles, setProfiles] = useState<ManagedProfile[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ManagedProfile | null>(null)
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementForm>(emptyAnnouncementForm)
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
    void Promise.all([loadProfiles(), loadClasses(), loadAnnouncements()])
  }, [])

  useEffect(() => {
    if (selectedProfile) {
      setDraft({ ...selectedProfile })
    }
  }, [selectedProfile])

  const loadProfiles = async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      return
    }
    setProfiles((data ?? []) as ManagedProfile[])
  }

  const loadClasses = async () => {
    const { data, error } = await supabase.from('classes').select('*').order('grade').order('name')
    if (error) {
      setError(error.message)
      return
    }
    setClasses((data ?? []) as Class[])
  }

  const loadAnnouncements = async () => {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      setError(error.message)
      return
    }

    setAnnouncements((data ?? []) as Announcement[])
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
      setMessage(`已儲存 ${draft.name} 的帳號設定。`)
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
      setMessage(`已重設 ${draft.name} 的身分條碼。`)
      await loadProfiles()
    }

    setSaving(false)
  }

  const saveAnnouncement = async (event: React.FormEvent) => {
    event.preventDefault()

    setSaving(true)
    setError(null)
    setMessage(null)

    const { error } = await supabase.from('announcements').insert({
      title: announcementForm.title.trim(),
      body: announcementForm.body.trim(),
      category: 'system',
      auto_created: false,
      is_pinned: announcementForm.is_pinned
    })

    if (error) {
      setError(error.message)
    } else {
      setAnnouncementForm(emptyAnnouncementForm)
      setMessage('已新增系統公告。')
      await loadAnnouncements()
    }

    setSaving(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">管理者後台</h1>
          <p className="mt-1 text-sm text-slate-400">
            在這裡管理高權限帳號、重設條碼，並發佈首頁系統公告。
          </p>
        </div>

        <button
          type="button"
          onClick={() => void Promise.all([loadProfiles(), loadClasses(), loadAnnouncements()])}
          className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-700"
        >
          <RefreshCw size={16} /> 重新整理
        </button>
      </div>

      <section className="space-y-4 rounded-2xl bg-slate-800 p-4">
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-amber-400" />
          <h2 className="font-semibold text-white">系統公告</h2>
        </div>

        <form onSubmit={saveAnnouncement} className="grid gap-3">
          <div>
            <label className="mb-1 block text-sm text-slate-400">公告標題</label>
            <input
              value={announcementForm.title}
              onChange={event => setAnnouncementForm({ ...announcementForm, title: event.target.value })}
              required
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">公告內容</label>
            <textarea
              value={announcementForm.body}
              onChange={event => setAnnouncementForm({ ...announcementForm, body: event.target.value })}
              rows={3}
              required
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
          </div>

          <label className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={announcementForm.is_pinned}
              onChange={event => setAnnouncementForm({ ...announcementForm, is_pinned: event.target.checked })}
              className="accent-indigo-500"
            />
            置頂這則公告
          </label>

          <button
            disabled={saving}
            className="flex w-fit items-center gap-2 rounded-lg border-none bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Save size={16} /> 發佈公告
          </button>
        </form>

        <div className="space-y-2">
          {announcements.map(item => (
            <div key={item.id} className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      item.category === 'task' ? 'bg-indigo-500/10 text-indigo-300' : 'bg-amber-500/10 text-amber-300'
                    }`}
                  >
                    {item.category === 'task' ? '任務公告' : '系統公告'}
                  </span>
                  {item.is_pinned ? (
                    <span className="flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-300">
                      <Pin size={10} /> 置頂
                    </span>
                  ) : null}
                </div>
                <span className="text-xs text-slate-500">
                  {new Date(item.created_at).toLocaleString('zh-TW')}
                </span>
              </div>
              <h3 className="mt-2 font-medium text-white">{item.title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-300">{item.body}</p>
            </div>
          ))}

          {announcements.length === 0 ? (
            <p className="rounded-xl bg-slate-900/40 px-3 py-6 text-center text-sm text-slate-500">
              目前還沒有公告。
            </p>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <section className="space-y-3 rounded-2xl bg-slate-800 p-4">
          <div className="space-y-2">
            <label className="block text-sm text-slate-400">搜尋帳號</label>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="姓名、email、職稱、班級"
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-2">
            {filteredProfiles.map(profile => (
              <button
                key={profile.id}
                type="button"
                onClick={() => setSelectedId(profile.id)}
                className={`w-full rounded-xl border px-3 py-3 text-left ${
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
                  {profile.class_id ? ` · ${classes.find(item => item.id === profile.class_id)?.name ?? '未指定班級'}` : ''}
                </p>
              </button>
            ))}

            {filteredProfiles.length === 0 ? (
              <p className="rounded-xl bg-slate-900/40 px-3 py-6 text-center text-sm text-slate-500">
                找不到符合條件的帳號。
              </p>
            ) : null}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl bg-slate-800 p-4">
          {!draft ? (
            <div className="rounded-xl bg-slate-900/40 px-4 py-10 text-center text-slate-500">
              請先從左側選擇一個帳號。
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 font-semibold text-white">
                    <ShieldCheck size={18} className="text-indigo-400" />
                    帳號與權限設定
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
                    placeholder="例如：導師、組長、隊長"
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

              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm text-slate-300">
                  <UserRoundCog size={16} className="text-indigo-400" />
                  身分條碼
                </div>
                <div className="rounded-lg bg-slate-800 p-3">
                  <p className="break-all text-sm text-indigo-300">{draft.scan_code ?? '尚未產生條碼'}</p>
                </div>
              </div>

              {message ? <p className="text-sm text-green-400">{message}</p> : null}
              {error ? <p className="text-sm text-red-400">{error}</p> : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  <Save size={16} /> 儲存帳號設定
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
