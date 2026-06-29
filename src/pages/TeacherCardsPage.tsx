import { useEffect, useMemo, useState } from 'react'
import { BookOpen, ImagePlus, Pencil, Plus, Power, PowerOff, Save, Sparkles, Wand2, X } from 'lucide-react'
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
  image_prompt: string
  image_style: string
  is_limited: boolean
  is_active: boolean
}

const CARD_IMAGE_STYLE_OPTIONS = ['Q版校園奇幻', '校徽 / 徽章式收藏卡風'] as const

const emptyAlbumForm: AlbumForm = {
  name: '',
  description: '',
  cover_color: '#334155',
  is_active: true,
}

const emptyCardForm: CardForm = {
  name: '',
  rarity: 'N',
  description: '',
  album_id: '',
  color: '#334155',
  image_url: '',
  image_prompt: '',
  image_style: CARD_IMAGE_STYLE_OPTIONS[0],
  is_limited: false,
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

function mapCardToForm(card: CardWithAlbum): CardForm {
  return {
    name: card.name,
    rarity: card.rarity,
    description: card.description ?? '',
    album_id: card.album_id ?? '',
    color: card.color || '#334155',
    image_url: card.image_url ?? '',
    image_prompt: card.image_prompt ?? '',
    image_style: card.image_style ?? CARD_IMAGE_STYLE_OPTIONS[0],
    is_limited: card.is_limited,
    is_active: card.is_active,
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
  const [generatingCard, setGeneratingCard] = useState(false)
  const [generatingCardId, setGeneratingCardId] = useState<string | null>(null)

  const filteredCards = useMemo(
    () => (filter === 'all' ? cards : cards.filter(card => card.rarity === filter)),
    [cards, filter],
  )

  useEffect(() => {
    void Promise.all([loadAlbums(), loadCards()])
  }, [])

  useEffect(() => {
    if (!cardForm.album_id && albums[0]) {
      setCardForm(previous => ({ ...previous, album_id: albums[0].id }))
    }
  }, [albums, cardForm.album_id])

  async function loadAlbums() {
    const { data, error } = await supabase.from('card_albums').select('*').order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    setAlbums((data ?? []) as CardAlbum[])
  }

  async function loadCards() {
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

  function resetAlbumForm() {
    setEditingAlbumId(null)
    setAlbumForm(emptyAlbumForm)
  }

  function resetCardForm() {
    setEditingCardId(null)
    setCardForm({
      ...emptyCardForm,
      album_id: albums[0]?.id ?? '',
    })
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

    if (!editingAlbumId) {
      const { error } = await supabase.from('card_albums').insert(payload)

      if (error) {
        setError(error.message)
      } else {
        setMessage(`已建立分集冊「${payload.name}」。`)
        resetAlbumForm()
        await loadAlbums()
      }

      setSavingAlbum(false)
      return
    }

    const { error } = await supabase.from('card_albums').update(payload).eq('id', editingAlbumId)

    if (error) {
      setError(error.message)
    } else {
      setMessage(`已更新分集冊「${payload.name}」。`)
      resetAlbumForm()
      await Promise.all([loadAlbums(), loadCards()])
    }

    setSavingAlbum(false)
  }

  async function upsertCard() {
    const selectedAlbum = albums.find(album => album.id === cardForm.album_id)
    if (!selectedAlbum) {
      throw new Error('請先選擇分集冊。')
    }

    const payload = {
      name: cardForm.name.trim(),
      rarity: cardForm.rarity,
      description: cardForm.description.trim(),
      album_id: selectedAlbum.id,
      series: selectedAlbum.name,
      color: cardForm.color,
      image_url: cardForm.image_url.trim() || null,
      image_prompt: cardForm.image_prompt.trim() || null,
      image_style: cardForm.image_style.trim() || null,
      is_limited: cardForm.is_limited,
      is_active: cardForm.is_active,
    }

    if (!editingCardId) {
      const { data, error } = await supabase.from('cards').insert(payload).select('*, album:album_id(*)').single()
      if (error) throw error

      const nextCard = data as CardWithAlbum
      setEditingCardId(nextCard.id)
      setCardForm(mapCardToForm(nextCard))
      await loadCards()
      return nextCard
    }

    const { data, error } = await supabase
      .from('cards')
      .update(payload)
      .eq('id', editingCardId)
      .select('*, album:album_id(*)')
      .single()

    if (error) throw error

    const nextCard = data as CardWithAlbum
    setCardForm(mapCardToForm(nextCard))
    await loadCards()
    return nextCard
  }

  async function saveCard(event: React.FormEvent) {
    event.preventDefault()
    setSavingCard(true)
    setMessage(null)
    setError(null)

    try {
      const nextCard = await upsertCard()
      setMessage(editingCardId ? `已更新卡片「${nextCard.name}」。` : `已建立卡片「${nextCard.name}」。`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '儲存卡片失敗。')
    } finally {
      setSavingCard(false)
    }
  }

  async function generateCardImage() {
    setGeneratingCard(true)
    setMessage(null)
    setError(null)

    try {
      const card = await upsertCard()
      setGeneratingCardId(card.id)

      const { data, error } = await supabase.functions.invoke('generate-card-image', {
        body: {
          cardId: card.id,
          imagePrompt: cardForm.image_prompt.trim(),
          imageStyle: cardForm.image_style,
        },
      })

      if (error) {
        throw new Error(error.message)
      }

      if (data?.error) {
        throw new Error(data.error)
      }

      const nextCard = data?.card as CardWithAlbum | undefined
      if (nextCard) {
        setEditingCardId(nextCard.id)
        setCardForm(mapCardToForm(nextCard))
      }

      await loadCards()
      setMessage(data?.message ?? '已生成卡片圖片。')
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : '生成卡圖失敗。')
    } finally {
      setGeneratingCard(false)
      setGeneratingCardId(null)
    }
  }

  async function generateCardImageForCard(card: CardWithAlbum) {
    setGeneratingCard(true)
    setGeneratingCardId(card.id)
    setMessage(null)
    setError(null)

    try {
      const { data, error } = await supabase.functions.invoke('generate-card-image', {
        body: {
          cardId: card.id,
          imagePrompt: card.image_prompt ?? '',
          imageStyle: card.image_style ?? CARD_IMAGE_STYLE_OPTIONS[0],
        },
      })

      if (error) {
        throw new Error(error.message)
      }

      if (data?.error) {
        throw new Error(data.error)
      }

      const nextCard = data?.card as CardWithAlbum | undefined
      if (nextCard && editingCardId === nextCard.id) {
        setCardForm(mapCardToForm(nextCard))
      }

      await loadCards()
      setMessage(data?.message ?? `已為卡片「${card.name}」生成圖片。`)
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : '生成卡圖失敗。')
    } finally {
      setGeneratingCard(false)
      setGeneratingCardId(null)
    }
  }

  function beginEditAlbum(album: CardAlbum) {
    setEditingAlbumId(album.id)
    setAlbumForm(mapAlbumToForm(album))
    setMessage(`正在編輯分集冊「${album.name}」。`)
    setError(null)
  }

  function beginEditCard(card: CardWithAlbum) {
    setEditingCardId(card.id)
    setCardForm(mapCardToForm(card))
    setMessage(`正在編輯卡片「${card.name}」。`)
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

  async function toggleCardActive(card: CardWithAlbum) {
    setMessage(null)
    setError(null)

    const { error } = await supabase.from('cards').update({ is_active: !card.is_active }).eq('id', card.id)

    if (error) {
      setError(error.message)
      return
    }

    setMessage(card.is_active ? `已停用卡片「${card.name}」。` : `已啟用卡片「${card.name}」。`)
    await loadCards()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">卡牌與分集冊管理</h1>
        <p className="mt-1 text-sm text-slate-400">
          教師可建立分集冊、維護卡片資料，並利用 AI 依固定風格生成卡圖。
        </p>
      </div>

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
              取消編輯
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
              <span className="text-sm text-slate-300">封面主色</span>
              <input
                value={albumForm.cover_color}
                onChange={event => setAlbumForm({ ...albumForm, cover_color: event.target.value })}
                placeholder="#334155"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm text-slate-300">分集冊說明</span>
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
            這本分集冊目前開放使用
          </label>

          <button
            type="submit"
            disabled={savingAlbum}
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Save size={16} />
            {savingAlbum ? '儲存中...' : editingAlbumId ? '更新分集冊' : '建立分集冊'}
          </button>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {albums.map(album => (
            <div key={album.id} className="space-y-3 rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
              <div className="rounded-2xl p-4 text-white" style={{ backgroundColor: album.cover_color }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{album.name}</p>
                    <p className="mt-1 text-sm text-white/85">{album.description || '尚未填寫分集冊說明。'}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs ${album.is_active ? 'bg-emerald-600/25 text-emerald-50' : 'bg-black/20 text-white/75'}`}>
                    {album.is_active ? '啟用中' : '已停用'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
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
                  onClick={() => toggleAlbumActive(album)}
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

      <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              {editingCardId ? <Pencil size={18} className="text-amber-300" /> : <Plus size={18} className="text-indigo-300" />}
              {editingCardId ? '編輯卡片' : '建立卡片'}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              先儲存卡片，再用 AI 依分集冊主題與提示詞生成圖片。
            </p>
          </div>
          {editingCardId ? (
            <button
              type="button"
              onClick={resetCardForm}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
            >
              <X size={16} />
              取消編輯
            </button>
          ) : null}
        </div>

        <form onSubmit={saveCard} className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-300">卡片名稱</span>
                <input
                  value={cardForm.name}
                  onChange={event => setCardForm({ ...cardForm, name: event.target.value })}
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">分集冊</span>
                <select
                  value={cardForm.album_id}
                  onChange={event => setCardForm({ ...cardForm, album_id: event.target.value })}
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                >
                  <option value="">請選擇分集冊</option>
                  {albums.filter(album => album.is_active || album.id === cardForm.album_id).map(album => (
                    <option key={album.id} value={album.id}>
                      {album.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">稀有度</span>
                <select
                  value={cardForm.rarity}
                  onChange={event => setCardForm({ ...cardForm, rarity: event.target.value as Rarity })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                >
                  {RARITY_ORDER.map(rarity => (
                    <option key={rarity} value={rarity}>
                      {formatRarityLabel(rarity)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">卡片主色</span>
                <input
                  value={cardForm.color}
                  onChange={event => setCardForm({ ...cardForm, color: event.target.value })}
                  placeholder="#334155"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                />
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-slate-300">卡片說明</span>
                <textarea
                  value={cardForm.description}
                  onChange={event => setCardForm({ ...cardForm, description: event.target.value })}
                  rows={3}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">AI 風格模板</span>
                <select
                  value={cardForm.image_style}
                  onChange={event => setCardForm({ ...cardForm, image_style: event.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                >
                  {CARD_IMAGE_STYLE_OPTIONS.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">圖片網址</span>
                <input
                  value={cardForm.image_url}
                  onChange={event => setCardForm({ ...cardForm, image_url: event.target.value })}
                  placeholder="可手動貼上圖片網址，或使用 AI 自動生成"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                />
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-slate-300">AI 提示詞補充</span>
                <textarea
                  value={cardForm.image_prompt}
                  onChange={event => setCardForm({ ...cardForm, image_prompt: event.target.value })}
                  rows={3}
                  placeholder="例如：晨光中的校門、背著書包的學生、星星徽章、藍金配色"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm text-slate-300">
                <ImagePlus size={16} className="text-indigo-300" />
                卡片預覽
              </div>

              <div
                className="aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 shadow-lg"
                style={{ backgroundColor: cardForm.color || '#334155' }}
              >
                {cardForm.image_url ? (
                  <img src={cardForm.image_url} alt={cardForm.name || '卡片預覽'} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full flex-col justify-between bg-black/10 p-4 text-white">
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-full bg-black/20 px-2 py-1 text-xs">{formatRarityLabel(cardForm.rarity)}</span>
                      <span className="rounded-full bg-black/20 px-2 py-1 text-xs">{cardForm.is_active ? '啟用中' : '停用中'}</span>
                    </div>
                    <div>
                      <p className="text-xl font-bold">{cardForm.name || '未命名卡片'}</p>
                      <p className="mt-1 text-sm text-white/80">
                        {albums.find(album => album.id === cardForm.album_id)?.name ?? '尚未選擇分集冊'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-2 rounded-xl border border-slate-700 bg-slate-800/70 p-3 text-sm text-slate-300">
                <p>AI 會自動參考：卡片名稱、稀有度、分集冊主題、主色與你的補充提示詞。</p>
                <p>如果尚未設定 `OPENAI_API_KEY`，系統會提示你先補上 Supabase Secret。</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={cardForm.is_limited}
                onChange={event => setCardForm({ ...cardForm, is_limited: event.target.checked })}
                className="accent-indigo-500"
              />
              限定卡
            </label>

            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={cardForm.is_active}
                onChange={event => setCardForm({ ...cardForm, is_active: event.target.checked })}
                className="accent-indigo-500"
              />
              啟用這張卡片
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={savingCard}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <Save size={16} />
              {savingCard ? '儲存中...' : editingCardId ? '更新卡片' : '建立卡片'}
            </button>

            <button
              type="button"
              onClick={generateCardImage}
              disabled={savingCard || generatingCard || !cardForm.name.trim() || !cardForm.album_id}
              className="inline-flex items-center gap-2 rounded-xl bg-fuchsia-600 px-5 py-3 font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50"
            >
              {generatingCard ? <Sparkles size={16} className="animate-pulse" /> : <Wand2 size={16} />}
              {generatingCard ? 'AI 生成中...' : editingCardId ? '重新生成卡圖' : '建立並生成卡圖'}
            </button>
          </div>
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filteredCards.map(card => (
          <div key={card.id} className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-800/70">
            <div className="aspect-[3/4]" style={{ backgroundColor: card.color || '#334155' }}>
              {card.image_url ? (
                <img src={card.image_url} alt={card.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col justify-between p-4 text-white">
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-full bg-black/20 px-2 py-1 text-xs">{formatRarityLabel(card.rarity)}</span>
                    <span className={`rounded-full px-2 py-1 text-xs ${card.is_active ? 'bg-emerald-600/25 text-emerald-50' : 'bg-black/20 text-white/70'}`}>
                      {card.is_active ? '啟用中' : '已停用'}
                    </span>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{card.name}</p>
                    <p className="text-sm text-white/80">{card.album?.name ?? card.series}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 p-4">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{card.name}</p>
                  <span className="rounded-full bg-slate-900 px-2 py-1 text-xs text-slate-300">{formatRarityLabel(card.rarity)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-400">{card.description || '尚未填寫卡片說明。'}</p>
                <p className="mt-2 text-xs text-slate-500">
                  分集冊：{card.album?.name ?? card.series}
                  {card.image_style ? ` · 風格：${card.image_style}` : ''}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => beginEditCard(card)}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-600/20 px-3 py-2 text-sm text-amber-300 hover:bg-amber-600/30"
                >
                  <Pencil size={16} />
                  編輯
                </button>

                <button
                  type="button"
                  onClick={() => void generateCardImageForCard(card)}
                  disabled={generatingCard && generatingCardId === card.id}
                  className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-600/20 px-3 py-2 text-sm text-fuchsia-300 hover:bg-fuchsia-600/30 disabled:opacity-50"
                >
                  <Wand2 size={16} />
                  {generatingCard && generatingCardId === card.id ? '生成中...' : 'AI 生圖'}
                </button>

                <button
                  type="button"
                  onClick={() => toggleCardActive(card)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                    card.is_active
                      ? 'bg-rose-600/20 text-rose-300 hover:bg-rose-600/30'
                      : 'bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
                  }`}
                >
                  {card.is_active ? <PowerOff size={16} /> : <Power size={16} />}
                  {card.is_active ? '停用' : '啟用'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
