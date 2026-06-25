import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Pencil, Plus, Power, PowerOff, Save, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatRarityLabel, RARITY_COLORS, RARITY_ORDER } from '../lib/constants'
import type { Card, CardAlbum, Rarity } from '../types'

type CardWithAlbum = Card & { album?: CardAlbum | null }

type AlbumForm = {
  name: string
  description: string
  cover_color: string
  is_active: boolean
}

type CardForm = {
  name: string
  rarity: Rarity
  description: string
  album_id: string
  color: string
  image_url: string
  is_limited: boolean
  is_active: boolean
}

const emptyAlbumForm: AlbumForm = {
  name: '',
  description: '',
  cover_color: '#334155',
  is_active: true
}

const emptyCardForm: CardForm = {
  name: '',
  rarity: 'N',
  description: '',
  album_id: '',
  color: '#334155',
  image_url: '',
  is_limited: false,
  is_active: true
}

function mapAlbumToForm(album: CardAlbum): AlbumForm {
  return {
    name: album.name,
    description: album.description ?? '',
    cover_color: album.cover_color || '#334155',
    is_active: album.is_active
  }
}

function mapCardToForm(card: CardWithAlbum): CardForm {
  return {
    name: card.name,
    rarity: card.rarity,
    description: card.description ?? '',
    album_id: card.album_id ?? '',
    color: card.color || '#334155',
    image_url: card.image_url ?? '',
    is_limited: card.is_limited,
    is_active: card.is_active
  }
}

export default function TeacherCardsPage() {
  const [albums, setAlbums] = useState<CardAlbum[]>([])
  const [cards, setCards] = useState<CardWithAlbum[]>([])
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null)
  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | Rarity>('all')
  const [albumForm, setAlbumForm] = useState<AlbumForm>(emptyAlbumForm)
  const [cardForm, setCardForm] = useState<CardForm>(emptyCardForm)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingAlbum, setSavingAlbum] = useState(false)
  const [savingCard, setSavingCard] = useState(false)

  const filteredCards = useMemo(
    () => (filter === 'all' ? cards : cards.filter(card => card.rarity === filter)),
    [cards, filter]
  )

  useEffect(() => {
    void Promise.all([loadAlbums(), loadCards()])
  }, [])

  useEffect(() => {
    if (!cardForm.album_id && albums[0]) {
      setCardForm(previous => ({ ...previous, album_id: albums[0].id }))
    }
  }, [albums, cardForm.album_id])

  const loadAlbums = async () => {
    const { data, error } = await supabase
      .from('card_albums')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    setAlbums((data ?? []) as CardAlbum[])
  }

  const loadCards = async () => {
    const { data, error } = await supabase
      .from('cards')
      .select('*, album:album_id(*)')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    setCards((data ?? []) as CardWithAlbum[])
  }

  const resetAlbumForm = () => {
    setEditingAlbumId(null)
    setAlbumForm(emptyAlbumForm)
    setMessage(null)
    setError(null)
  }

  const resetCardForm = () => {
    setEditingCardId(null)
    setCardForm({
      ...emptyCardForm,
      album_id: albums[0]?.id ?? ''
    })
    setMessage(null)
    setError(null)
  }

  const saveAlbum = async (event: React.FormEvent) => {
    event.preventDefault()
    setSavingAlbum(true)
    setMessage(null)
    setError(null)

    const payload = {
      name: albumForm.name.trim(),
      description: albumForm.description.trim(),
      cover_color: albumForm.cover_color,
      is_active: albumForm.is_active
    }

    if (!editingAlbumId) {
      const { error } = await supabase.from('card_albums').insert(payload)

      if (error) {
        setError(error.message)
      } else {
        setMessage(`已建立收集冊「${payload.name}」。`)
        resetAlbumForm()
        await loadAlbums()
      }

      setSavingAlbum(false)
      return
    }

    const { error } = await supabase
      .from('card_albums')
      .update(payload)
      .eq('id', editingAlbumId)

    if (error) {
      setError(error.message)
    } else {
      setMessage(`已更新收集冊「${payload.name}」。`)
      resetAlbumForm()
      await Promise.all([loadAlbums(), loadCards()])
    }

    setSavingAlbum(false)
  }

  const saveCard = async (event: React.FormEvent) => {
    event.preventDefault()
    setSavingCard(true)
    setMessage(null)
    setError(null)

    const selectedAlbum = albums.find(album => album.id === cardForm.album_id)
    if (!selectedAlbum) {
      setError('請先選擇收集冊。')
      setSavingCard(false)
      return
    }

    const payload = {
      name: cardForm.name.trim(),
      rarity: cardForm.rarity,
      description: cardForm.description.trim(),
      album_id: selectedAlbum.id,
      series: selectedAlbum.name,
      color: cardForm.color,
      image_url: cardForm.image_url.trim() || null,
      is_limited: cardForm.is_limited,
      is_active: cardForm.is_active
    }

    if (!editingCardId) {
      const { error } = await supabase.from('cards').insert(payload)

      if (error) {
        setError(error.message)
      } else {
        setMessage(`已新增卡牌「${payload.name}」。`)
        resetCardForm()
        await loadCards()
      }

      setSavingCard(false)
      return
    }

    const { error } = await supabase
      .from('cards')
      .update(payload)
      .eq('id', editingCardId)

    if (error) {
      setError(error.message)
    } else {
      setMessage(`已更新卡牌「${payload.name}」。`)
      resetCardForm()
      await loadCards()
    }

    setSavingCard(false)
  }

  const beginEditAlbum = (album: CardAlbum) => {
    setEditingAlbumId(album.id)
    setAlbumForm(mapAlbumToForm(album))
    setMessage(`正在編輯收集冊「${album.name}」。`)
    setError(null)
  }

  const beginEditCard = (card: CardWithAlbum) => {
    setEditingCardId(card.id)
    setCardForm(mapCardToForm(card))
    setMessage(`正在編輯卡牌「${card.name}」。`)
    setError(null)
  }

  const toggleAlbumActive = async (album: CardAlbum) => {
    setMessage(null)
    setError(null)

    const { error } = await supabase
      .from('card_albums')
      .update({ is_active: !album.is_active })
      .eq('id', album.id)

    if (error) {
      setError(error.message)
      return
    }

    setMessage(album.is_active ? `已停用收集冊「${album.name}」。` : `已啟用收集冊「${album.name}」。`)
    await loadAlbums()
  }

  const toggleCardActive = async (card: CardWithAlbum) => {
    setMessage(null)
    setError(null)

    const { error } = await supabase
      .from('cards')
      .update({ is_active: !card.is_active })
      .eq('id', card.id)

    if (error) {
      setError(error.message)
      return
    }

    setMessage(card.is_active ? `已停用卡牌「${card.name}」。` : `已啟用卡牌「${card.name}」。`)
    await loadCards()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">卡牌與收集冊管理</h1>
        <p className="mt-1 text-sm text-slate-400">教師可以先建立收集冊，再把卡牌放進對應主題冊中。</p>
      </div>

      <section className="space-y-4 rounded-2xl bg-slate-800 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold text-white">
            <BookOpen size={18} className="text-indigo-400" />
            {editingAlbumId ? '編輯收集冊' : '新增收集冊'}
          </h2>
          {editingAlbumId ? (
            <button
              type="button"
              onClick={resetAlbumForm}
              className="flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
            >
              <X size={16} /> 取消編輯
            </button>
          ) : null}
        </div>

        <form onSubmit={saveAlbum} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={albumForm.name}
              onChange={event => setAlbumForm({ ...albumForm, name: event.target.value })}
              placeholder="收集冊名稱"
              required
              className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
            <input
              value={albumForm.cover_color}
              onChange={event => setAlbumForm({ ...albumForm, cover_color: event.target.value })}
              placeholder="#334155"
              className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
            <textarea
              value={albumForm.description}
              onChange={event => setAlbumForm({ ...albumForm, description: event.target.value })}
              placeholder="這本收集冊的主題說明"
              rows={3}
              className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500 sm:col-span-2"
            />
          </div>

          <label className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={albumForm.is_active}
              onChange={event => setAlbumForm({ ...albumForm, is_active: event.target.checked })}
              className="accent-indigo-500"
            />
            啟用這本收集冊
          </label>

          <button
            disabled={savingAlbum}
            className="flex w-fit items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Save size={16} /> {savingAlbum ? '儲存中...' : editingAlbumId ? '更新收集冊' : '建立收集冊'}
          </button>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {albums.map(album => (
            <div key={album.id} className="space-y-3 rounded-xl bg-slate-900/40 p-4">
              <div className="rounded-xl p-4" style={{ backgroundColor: album.cover_color }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{album.name}</p>
                    <p className="mt-1 text-sm text-white/80">{album.description || '尚未填寫描述'}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[11px] ${
                    album.is_active ? 'bg-emerald-600/20 text-emerald-100' : 'bg-slate-900/30 text-white/70'
                  }`}>
                    {album.is_active ? '啟用中' : '已停用'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => beginEditAlbum(album)}
                  className="flex items-center gap-2 rounded-lg bg-amber-600/20 px-3 py-2 text-sm text-amber-300 hover:bg-amber-600/30"
                >
                  <Pencil size={16} /> 編輯
                </button>
                <button
                  type="button"
                  onClick={() => toggleAlbumActive(album)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                    album.is_active
                      ? 'bg-red-600/20 text-red-300 hover:bg-red-600/30'
                      : 'bg-green-600/20 text-green-300 hover:bg-green-600/30'
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

      <section className="space-y-4 rounded-2xl bg-slate-800 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold text-white">
            {editingCardId ? <Pencil size={18} className="text-amber-400" /> : <Plus size={18} className="text-indigo-400" />}
            {editingCardId ? '編輯卡牌' : '新增卡牌'}
          </h2>
          {editingCardId ? (
            <button
              type="button"
              onClick={resetCardForm}
              className="flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
            >
              <X size={16} /> 取消編輯
            </button>
          ) : null}
        </div>

        <form onSubmit={saveCard} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={cardForm.name}
              onChange={event => setCardForm({ ...cardForm, name: event.target.value })}
              placeholder="卡牌名稱"
              required
              className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
            <select
              value={cardForm.album_id}
              onChange={event => setCardForm({ ...cardForm, album_id: event.target.value })}
              required
              className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            >
              <option value="">選擇收集冊</option>
              {albums
                .filter(album => album.is_active || album.id === cardForm.album_id)
                .map(album => (
                  <option key={album.id} value={album.id}>
                    {album.name}
                  </option>
                ))}
            </select>
            <select
              value={cardForm.rarity}
              onChange={event => setCardForm({ ...cardForm, rarity: event.target.value as Rarity })}
              className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            >
              {RARITY_ORDER.map(rarity => (
                <option key={rarity} value={rarity}>
                  {formatRarityLabel(rarity)}
                </option>
              ))}
            </select>
            <input
              value={cardForm.color}
              onChange={event => setCardForm({ ...cardForm, color: event.target.value })}
              placeholder="#334155"
              className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
            <input
              value={cardForm.image_url}
              onChange={event => setCardForm({ ...cardForm, image_url: event.target.value })}
              placeholder="圖片網址（之後可接 AI 產圖）"
              className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500 sm:col-span-2"
            />
            <textarea
              value={cardForm.description}
              onChange={event => setCardForm({ ...cardForm, description: event.target.value })}
              placeholder="卡牌描述"
              rows={3}
              className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500 sm:col-span-2"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={cardForm.is_limited}
                onChange={event => setCardForm({ ...cardForm, is_limited: event.target.checked })}
                className="accent-indigo-500"
              />
              限定卡
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={cardForm.is_active}
                onChange={event => setCardForm({ ...cardForm, is_active: event.target.checked })}
                className="accent-indigo-500"
              />
              啟用卡牌
            </label>
          </div>

          {message ? <p className="text-sm text-green-400">{message}</p> : null}
          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <button
            disabled={savingCard}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Save size={16} /> {savingCard ? '儲存中...' : editingCardId ? '更新卡牌' : '新增卡牌'}
          </button>
        </form>
      </section>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`rounded-full px-3 py-1.5 text-sm ${filter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}
        >
          全部
        </button>
        {RARITY_ORDER.map(rarity => (
          <button
            key={rarity}
            type="button"
            onClick={() => setFilter(rarity)}
            className={`rounded-full px-3 py-1.5 text-sm ${filter === rarity ? 'text-white' : 'bg-slate-800 text-slate-400'}`}
            style={filter === rarity ? { backgroundColor: RARITY_COLORS[rarity] } : undefined}
          >
            {formatRarityLabel(rarity)}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filteredCards.map(card => (
          <div key={card.id} className="space-y-3 rounded-xl bg-slate-800 p-4">
            <div className="aspect-[3/4] rounded-lg p-3 text-white" style={{ backgroundColor: card.color || '#334155' }}>
              <div className="flex h-full flex-col justify-between rounded-lg bg-black/15 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-full bg-black/20 px-2 py-1 text-[11px]">{formatRarityLabel(card.rarity)}</span>
                  <span className={`rounded-full px-2 py-1 text-[11px] ${card.is_active ? 'bg-green-600/30' : 'bg-slate-700/70'}`}>
                    {card.is_active ? '啟用中' : '已停用'}
                  </span>
                </div>
                <div>
                  <p className="text-lg font-bold">{card.name}</p>
                  <p className="text-xs text-white/80">{card.album?.name ?? card.series}</p>
                </div>
              </div>
            </div>

            <div>
              <p className="font-medium">{card.name}</p>
              <p className="mt-1 text-sm text-slate-400">{card.description || '尚未填寫描述'}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => beginEditCard(card)}
                className="flex items-center gap-2 rounded-lg bg-amber-600/20 px-3 py-2 text-sm text-amber-300 hover:bg-amber-600/30"
              >
                <Pencil size={16} /> 編輯
              </button>
              <button
                type="button"
                onClick={() => toggleCardActive(card)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  card.is_active
                    ? 'bg-red-600/20 text-red-300 hover:bg-red-600/30'
                    : 'bg-green-600/20 text-green-300 hover:bg-green-600/30'
                }`}
              >
                {card.is_active ? <PowerOff size={16} /> : <Power size={16} />}
                {card.is_active ? '停用' : '啟用'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
