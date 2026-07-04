import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Pencil, Power, PowerOff, Save, X } from 'lucide-react'
import TeacherCardManagementTabs from '../components/TeacherCardManagementTabs'
import { supabase } from '../lib/supabase'
import type { Card, CardAlbum } from '../types'

type AlbumForm = {
  name: string
  description: string
  cover_color: string
  is_active: boolean
}

const emptyAlbumForm: AlbumForm = {
  name: '',
  description: '',
  cover_color: '#334155',
  is_active: true,
}

function mapAlbumToForm(album: CardAlbum): AlbumForm {
  return {
    name: album.name,
    description: album.description ?? '',
    cover_color: album.cover_color || '#334155',
    is_active: album.is_active,
  }
}

export default function TeacherCardAlbumsPage() {
  const [albums, setAlbums] = useState<CardAlbum[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null)
  const [albumForm, setAlbumForm] = useState<AlbumForm>(emptyAlbumForm)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingAlbum, setSavingAlbum] = useState(false)

  useEffect(() => {
    void Promise.all([loadAlbums(), loadCards()])
  }, [])

  async function loadAlbums() {
    const { data, error } = await supabase.from('card_albums').select('*').order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    setAlbums((data ?? []) as CardAlbum[])
  }

  async function loadCards() {
    const { data, error } = await supabase.from('cards').select('id, album_id')

    if (error) {
      setError(error.message)
      return
    }

    setCards((data ?? []) as Card[])
  }

  function resetAlbumForm() {
    setEditingAlbumId(null)
    setAlbumForm(emptyAlbumForm)
  }

  async function saveAlbum(event: React.FormEvent) {
    event.preventDefault()
    setSavingAlbum(true)
    setMessage(null)
    setError(null)

    const payload = {
      name: albumForm.name.trim(),
      description: albumForm.description.trim(),
      cover_color: albumForm.cover_color,
      is_active: albumForm.is_active,
    }

    if (!payload.name) {
      setError('請先輸入分集冊名稱。')
      setSavingAlbum(false)
      return
    }

    if (editingAlbumId) {
      const { error } = await supabase.from('card_albums').update(payload).eq('id', editingAlbumId)

      if (error) {
        setError(error.message)
      } else {
        setMessage(`已更新分集冊「${payload.name}」。`)
        resetAlbumForm()
        await loadAlbums()
      }

      setSavingAlbum(false)
      return
    }

    const { error } = await supabase.from('card_albums').insert(payload)

    if (error) {
      setError(error.message)
    } else {
      setMessage(`已建立分集冊「${payload.name}」。`)
      resetAlbumForm()
      await loadAlbums()
    }

    setSavingAlbum(false)
  }

  function beginEditAlbum(album: CardAlbum) {
    setEditingAlbumId(album.id)
    setAlbumForm(mapAlbumToForm(album))
    setMessage(`正在編輯分集冊「${album.name}」。`)
    setError(null)
  }

  async function toggleAlbumActive(album: CardAlbum) {
    setMessage(null)
    setError(null)

    const { error } = await supabase.from('card_albums').update({ is_active: !album.is_active }).eq('id', album.id)

    if (error) {
      setError(error.message)
      return
    }

    setMessage(album.is_active ? `已停用分集冊「${album.name}」。` : `已啟用分集冊「${album.name}」。`)
    await loadAlbums()
  }

  const albumCardCounts = useMemo(() => {
    return cards.reduce<Record<string, number>>((counts, card) => {
      if (!card.album_id) return counts
      counts[card.album_id] = (counts[card.album_id] ?? 0) + 1
      return counts
    }, {})
  }, [cards])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">分集冊設定</h1>
        <p className="mt-1 text-sm text-slate-400">先整理分集冊，再到卡牌管理頁建立卡牌，流程會更清楚。</p>
      </div>

      <TeacherCardManagementTabs />

      {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <BookOpen size={18} className="text-indigo-300" />
            {editingAlbumId ? '編輯分集冊' : '建立分集冊'}
          </h2>
          {editingAlbumId ? (
            <button
              type="button"
              onClick={resetAlbumForm}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
            >
              <X size={16} />
              建立新的分集冊
            </button>
          ) : null}
        </div>

        <form onSubmit={saveAlbum} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-slate-300">分集冊名稱</span>
              <input
                value={albumForm.name}
                onChange={event => setAlbumForm({ ...albumForm, name: event.target.value })}
                required
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-300">主色</span>
              <input
                value={albumForm.cover_color}
                onChange={event => setAlbumForm({ ...albumForm, cover_color: event.target.value })}
                placeholder="#334155"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm text-slate-300">說明</span>
              <textarea
                value={albumForm.description}
                onChange={event => setAlbumForm({ ...albumForm, description: event.target.value })}
                rows={3}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
              />
            </label>
          </div>

          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={albumForm.is_active}
              onChange={event => setAlbumForm({ ...albumForm, is_active: event.target.checked })}
              className="accent-indigo-500"
            />
            啟用這個分集冊
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={savingAlbum}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <Save size={16} />
              {savingAlbum ? '儲存中...' : editingAlbumId ? '更新分集冊' : '建立分集冊'}
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">現有分集冊</h2>

        <div className="grid gap-4 md:grid-cols-2">
          {albums.map(album => (
            <div key={album.id} className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: album.cover_color || '#334155' }} />
                    <p className="font-semibold text-white">{album.name}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">{album.description || '尚未填寫分集冊說明。'}</p>
                  <p className="mt-3 text-xs text-slate-500">卡牌數量：{albumCardCounts[album.id] ?? 0}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    album.is_active ? 'bg-emerald-600/20 text-emerald-300' : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {album.is_active ? '啟用中' : '已停用'}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => beginEditAlbum(album)}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-600/20 px-3 py-2 text-sm text-amber-300 hover:bg-amber-600/30"
                >
                  <Pencil size={16} />
                  編輯
                </button>

                <button
                  type="button"
                  onClick={() => void toggleAlbumActive(album)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                    album.is_active
                      ? 'bg-rose-600/20 text-rose-300 hover:bg-rose-600/30'
                      : 'bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
                  }`}
                >
                  {album.is_active ? <PowerOff size={16} /> : <Power size={16} />}
                  {album.is_active ? '停用' : '啟用'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
