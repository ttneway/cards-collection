import { useEffect, useMemo, useState } from 'react'
import { ImagePlus, KeyRound, Pencil, Plus, Power, PowerOff, RefreshCw, Save, Sparkles, Upload, Wand2, X } from 'lucide-react'
import TeacherCardManagementTabs from '../components/TeacherCardManagementTabs'
import { HUGGING_FACE_MODEL_OPTIONS } from '../lib/aiImage'
import { formatRarityLabel, RARITY_COLORS, RARITY_ORDER } from '../lib/constants'
import { uploadImageFile } from '../lib/imageUpload'
import { supabase } from '../lib/supabase'
import type { Card, CardAlbum, Rarity } from '../types'
import { clampNumber, readStoredNumber } from '../utils/helpers'

declare const __APP_VERSION__: string

type CardWithAlbum = Card & { album?: CardAlbum | null }

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

type AiImageStatus = {
  ready: boolean
  configured_provider: string
  active_provider: string | null
  provider_label: string | null
  model: string | null
  missing_secret: string
  key_source: 'teacher' | 'system' | null
}

type AiDiagnostics = {
  provider?: string | null
  model?: string | null
  status?: number | null
  debug?: string | null
}

const CARD_IMAGE_STYLE_OPTIONS = ['Q版校園奇幻', '日系動漫插畫', '紙牌卡框風格'] as const
const AI_PROVIDER_OPTIONS = [
  { value: 'gemini', label: 'Gemini' },
  { value: 'openai', label: 'OpenAI / ChatGPT' },
  { value: 'huggingface', label: 'Hugging Face' },
] as const
const CARD_SCALE_STORAGE_KEY = 'teacher-cards-scale'
const CARD_SCALE_MIN = 70
const CARD_SCALE_MAX = 130
const CARD_SCALE_DEFAULT = 100

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

function formatDiagnosticsText(diagnostics: AiDiagnostics | string | null | undefined) {
  if (!diagnostics) return null
  if (typeof diagnostics === 'string') return diagnostics

  const lines = [
    diagnostics.provider ? `provider: ${diagnostics.provider}` : null,
    diagnostics.model ? `model: ${diagnostics.model}` : null,
    typeof diagnostics.status === 'number' ? `status: ${diagnostics.status}` : null,
    diagnostics.debug ? `debug: ${diagnostics.debug}` : null,
  ].filter(Boolean)

  return lines.length > 0 ? lines.join('\n') : null
}

async function invokeImageFunction(body: Record<string, unknown>) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-card-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify(body),
  })

  const responseText = await response.text()
  let payload: Record<string, unknown> | null = null

  try {
    payload = responseText ? (JSON.parse(responseText) as Record<string, unknown>) : null
  } catch {
    payload = { error: responseText || `Edge Function returned HTTP ${response.status}` }
  }

  return {
    ok: response.ok,
    status: response.status,
    data: payload,
  }
}

export default function TeacherCardsPage() {
  const appVersion = __APP_VERSION__
  const [albums, setAlbums] = useState<CardAlbum[]>([])
  const [cards, setCards] = useState<CardWithAlbum[]>([])
  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | Rarity>('all')
  const [cardForm, setCardForm] = useState<CardForm>(emptyCardForm)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingCard, setSavingCard] = useState(false)
  const [generatingCard, setGeneratingCard] = useState(false)
  const [generatingCardId, setGeneratingCardId] = useState<string | null>(null)
  const [aiImageStatus, setAiImageStatus] = useState<AiImageStatus | null>(null)
  const [aiDiagnostics, setAiDiagnostics] = useState<string | null>(null)
  const [checkingAiStatus, setCheckingAiStatus] = useState(false)
  const [probingAiImage, setProbingAiImage] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [aiProvider, setAiProvider] = useState<(typeof AI_PROVIDER_OPTIONS)[number]['value']>('gemini')
  const [teacherApiKey, setTeacherApiKey] = useState('')
  const [huggingFaceModel, setHuggingFaceModel] = useState<string>(HUGGING_FACE_MODEL_OPTIONS[0].value)
  const [cardScale, setCardScale] = useState<number>(() =>
    readStoredNumber(CARD_SCALE_STORAGE_KEY, CARD_SCALE_DEFAULT, CARD_SCALE_MIN, CARD_SCALE_MAX)
  )

  const filteredCards = useMemo(
    () => (filter === 'all' ? cards : cards.filter(card => card.rarity === filter)),
    [cards, filter]
  )
  const hasTeacherApiKey = teacherApiKey.trim().length > 0
  const canUseAiImage = aiImageStatus?.ready !== false || hasTeacherApiKey
  const hasAlbums = albums.length > 0
  const cardGridMinWidth = useMemo(() => Math.round(220 * (cardScale / 100)), [cardScale])

  useEffect(() => {
    void Promise.all([loadAlbums(), loadCards()])
    void loadAiImageStatus()
  }, [])

  useEffect(() => {
    if (!cardForm.album_id && albums[0]) {
      setCardForm(previous => ({ ...previous, album_id: albums[0].id }))
    }
  }, [albums, cardForm.album_id])

  useEffect(() => {
    window.localStorage.setItem(CARD_SCALE_STORAGE_KEY, String(cardScale))
  }, [cardScale])

  async function loadAlbums() {
    const { data, error } = await supabase.from('card_albums').select('*').order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    setAlbums((data ?? []) as CardAlbum[])
  }

  async function loadCards() {
    const { data, error } = await supabase.from('cards').select('*, album:album_id(*)').order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    setCards((data ?? []) as CardWithAlbum[])
  }

  async function loadAiImageStatus() {
    setCheckingAiStatus(true)

    try {
      const result = await invokeImageFunction({
        action: 'status',
        aiProvider,
        apiKey: teacherApiKey.trim() || undefined,
        modelOverride: aiProvider === 'huggingface' ? huggingFaceModel : undefined,
      })

      if (!result.ok || !result.data) {
        throw new Error((result.data?.error as string | undefined) ?? `Edge Function returned HTTP ${result.status}`)
      }

      setAiImageStatus(result.data as unknown as AiImageStatus)
    } catch (statusError) {
      setAiImageStatus({
        ready: false,
        configured_provider: 'unknown',
        active_provider: null,
        provider_label: null,
        model: null,
        missing_secret: 'GEMINI_API_KEY 或 OPENAI_API_KEY',
        key_source: null,
      })
      setError(statusError instanceof Error ? statusError.message : '無法檢查 AI 圖片設定。')
    } finally {
      setCheckingAiStatus(false)
    }
  }

  async function probeAiImage() {
    setProbingAiImage(true)
    setMessage(null)
    setError(null)

    try {
      const result = await invokeImageFunction({
        action: 'probe',
        aiProvider,
        apiKey: teacherApiKey.trim() || undefined,
        modelOverride: aiProvider === 'huggingface' ? huggingFaceModel : undefined,
      })

      const data = result.data as Record<string, any> | null
      const diagnosticsText = formatDiagnosticsText((data?.diagnostics ?? null) as AiDiagnostics | string | null)

      if (!result.ok) {
        setAiDiagnostics(diagnosticsText)
        throw new Error((data?.error as string | undefined) ?? `Edge Function returned HTTP ${result.status}`)
      }

      if (data?.error) {
        setAiDiagnostics(diagnosticsText)
        throw new Error(data.error as string)
      }

      setAiDiagnostics(diagnosticsText)
      setMessage(data?.ok ? 'AI 生圖檢查成功。' : 'AI 生圖檢查完成。')
    } catch (probeError) {
      setError(probeError instanceof Error ? probeError.message : 'AI 生圖檢查失敗。')
    } finally {
      setProbingAiImage(false)
    }
  }

  function resetCardForm() {
    setEditingCardId(null)
    setCardForm({
      ...emptyCardForm,
      album_id: albums[0]?.id ?? '',
    })
  }

  async function handleCardImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    setUploadingImage(true)
    setMessage(null)
    setError(null)

    try {
      const result = await uploadImageFile(file, 'cards')
      setCardForm(previous => ({ ...previous, image_url: result.publicUrl }))
      setMessage('圖片上傳成功，已帶入卡牌圖片網址。')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '圖片上傳失敗。')
    } finally {
      setUploadingImage(false)
    }
  }

  async function saveCardRecord() {
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

    if (!payload.name) {
      throw new Error('請先輸入卡牌名稱。')
    }

    if (!editingCardId) {
      const { data, error } = await supabase.from('cards').insert(payload).select('*, album:album_id(*)').single()
      if (error) throw error
      return { card: data as CardWithAlbum, created: true }
    }

    const { data, error } = await supabase
      .from('cards')
      .update(payload)
      .eq('id', editingCardId)
      .select('*, album:album_id(*)')
      .single()

    if (error) throw error

    return { card: data as CardWithAlbum, created: false }
  }

  async function saveCard(event: React.FormEvent) {
    event.preventDefault()
    setSavingCard(true)
    setMessage(null)
    setError(null)

    try {
      const wasEditing = Boolean(editingCardId)
      const { card, created } = await saveCardRecord()
      await loadCards()

      if (created && !wasEditing) {
        setMessage(`已建立卡牌「${card.name}」，表單已準備好讓你繼續新增下一張。`)
        resetCardForm()
      } else {
        setEditingCardId(card.id)
        setCardForm(mapCardToForm(card))
        setMessage(`已更新卡牌「${card.name}」。`)
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '卡牌儲存失敗。')
    } finally {
      setSavingCard(false)
    }
  }

  async function generateCardImage() {
    setGeneratingCard(true)
    setMessage(null)
    setError(null)
    setAiDiagnostics(null)

    try {
      const { card } = await saveCardRecord()
      setEditingCardId(card.id)
      setCardForm(mapCardToForm(card))
      setGeneratingCardId(card.id)

      const result = await invokeImageFunction({
        cardId: card.id,
        imagePrompt: cardForm.image_prompt.trim(),
        imageStyle: cardForm.image_style,
        aiProvider,
        apiKey: teacherApiKey.trim() || undefined,
        modelOverride: aiProvider === 'huggingface' ? huggingFaceModel : undefined,
      })

      const data = result.data as Record<string, any> | null

      if (!result.ok) {
        setAiDiagnostics(formatDiagnosticsText((data?.diagnostics ?? null) as AiDiagnostics | string | null))
        throw new Error((data?.error as string | undefined) ?? `Edge Function returned HTTP ${result.status}`)
      }

      if (data?.error) {
        setAiDiagnostics(formatDiagnosticsText((data?.diagnostics ?? null) as AiDiagnostics | string | null))
        throw new Error(data.error as string)
      }

      const nextCard = data?.card as CardWithAlbum | undefined
      if (nextCard) {
        setEditingCardId(nextCard.id)
        setCardForm(mapCardToForm(nextCard))
      }

      await loadCards()
      await loadAiImageStatus()
      setMessage(data?.message ?? 'AI 卡圖已生成完成。')
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'AI 生圖失敗。')
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
    setAiDiagnostics(null)

    try {
      const result = await invokeImageFunction({
        cardId: card.id,
        imagePrompt: card.image_prompt ?? '',
        imageStyle: card.image_style ?? CARD_IMAGE_STYLE_OPTIONS[0],
        aiProvider,
        apiKey: teacherApiKey.trim() || undefined,
        modelOverride: aiProvider === 'huggingface' ? huggingFaceModel : undefined,
      })

      const data = result.data as Record<string, any> | null

      if (!result.ok) {
        setAiDiagnostics(formatDiagnosticsText((data?.diagnostics ?? null) as AiDiagnostics | string | null))
        throw new Error((data?.error as string | undefined) ?? `Edge Function returned HTTP ${result.status}`)
      }

      if (data?.error) {
        setAiDiagnostics(formatDiagnosticsText((data?.diagnostics ?? null) as AiDiagnostics | string | null))
        throw new Error(data.error as string)
      }

      const nextCard = data?.card as CardWithAlbum | undefined
      if (nextCard && editingCardId === nextCard.id) {
        setCardForm(mapCardToForm(nextCard))
      }

      await loadCards()
      await loadAiImageStatus()
      setMessage(data?.message ?? `已重新生成「${card.name}」的卡圖。`)
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'AI 生圖失敗。')
    } finally {
      setGeneratingCard(false)
      setGeneratingCardId(null)
    }
  }

  function beginEditCard(card: CardWithAlbum) {
    setEditingCardId(card.id)
    setCardForm(mapCardToForm(card))
    setMessage(`正在編輯卡牌「${card.name}」。`)
    setError(null)
  }

  async function toggleCardActive(card: CardWithAlbum) {
    setMessage(null)
    setError(null)

    const { error } = await supabase.from('cards').update({ is_active: !card.is_active }).eq('id', card.id)

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
        <div className="mb-2 flex justify-end">
          <span className="rounded-full border border-slate-600 bg-slate-900/80 px-3 py-1 text-xs text-slate-300">版本 {appVersion}</span>
        </div>
        <h1 className="text-2xl font-bold text-white">卡牌管理</h1>
        <p className="mt-1 text-sm text-slate-400">這一頁只專心處理卡牌本身。分集冊設定已拆到另一頁，新增多張卡會順很多。</p>
      </div>

      <TeacherCardManagementTabs />

      {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      {!hasAlbums ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          目前還沒有分集冊。請先到「分集冊設定」建立至少一個分集冊，再回來新增卡牌。
        </div>
      ) : null}

      <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              {editingCardId ? <Pencil size={18} className="text-amber-300" /> : <Plus size={18} className="text-indigo-300" />}
              {editingCardId ? '編輯卡牌' : '建立卡牌'}
            </h2>
            <p className="mt-1 text-sm text-slate-400">建立完成後，表單會保留在新增模式，方便你連續做下一張。</p>
          </div>
          {editingCardId ? (
            <button
              type="button"
              onClick={resetCardForm}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
            >
              <X size={16} />
              建立新卡牌
            </button>
          ) : null}
        </div>

        <form onSubmit={saveCard} className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-300">卡牌名稱</span>
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
                <span className="text-sm text-slate-300">卡牌主色</span>
                <input
                  value={cardForm.color}
                  onChange={event => setCardForm({ ...cardForm, color: event.target.value })}
                  placeholder="#334155"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                />
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-slate-300">卡牌說明</span>
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
                  placeholder="已有圖片時可直接貼網址"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">上傳照片</span>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-200 hover:border-indigo-400 hover:text-white">
                  <Upload size={16} />
                  {uploadingImage ? '上傳中...' : '選擇卡牌圖片'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={event => void handleCardImageUpload(event)}
                    disabled={uploadingImage}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-slate-500">支援 PNG、JPG、WEBP，大小上限 5 MB。</p>
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-slate-300">AI 提示詞補充</span>
                <textarea
                  value={cardForm.image_prompt}
                  onChange={event => setCardForm({ ...cardForm, image_prompt: event.target.value })}
                  rows={3}
                  placeholder="補充主體、場景、動作、畫面重點，幫 AI 更貼近你要的卡圖。"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm text-slate-300">
                <ImagePlus size={16} className="text-indigo-300" />
                卡片預覽
              </div>

              <div className="aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 shadow-lg" style={{ backgroundColor: cardForm.color || '#334155' }}>
                {cardForm.image_url ? (
                  <img src={cardForm.image_url} alt={cardForm.name || '卡牌預覽'} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full flex-col justify-between bg-black/10 p-4 text-white">
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-full bg-black/20 px-2 py-1 text-xs">{formatRarityLabel(cardForm.rarity)}</span>
                      <span className="rounded-full bg-black/20 px-2 py-1 text-xs">{cardForm.is_active ? '啟用中' : '已停用'}</span>
                    </div>
                    <div>
                      <p className="text-xl font-bold">{cardForm.name || '尚未命名卡牌'}</p>
                      <p className="mt-1 text-sm text-white/80">
                        {albums.find(album => album.id === cardForm.album_id)?.name ?? '請先選擇分集冊'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-2 rounded-xl border border-slate-700 bg-slate-800/70 p-3 text-sm text-slate-300">
                <p>AI 會參考卡牌名稱、稀有度、分集冊、風格模板與你的補充提示詞來生成卡圖。</p>
                <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <KeyRound size={16} className="text-fuchsia-300" />
                    教師自備 API key
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[0.7fr_1.3fr]">
                    <label className="space-y-1">
                      <span className="text-xs text-slate-400">供應商</span>
                      <select
                        value={aiProvider}
                        onChange={event => setAiProvider(event.target.value as typeof aiProvider)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                      >
                        {AI_PROVIDER_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs text-slate-400">API key</span>
                      <input
                        type="password"
                        value={teacherApiKey}
                        onChange={event => setTeacherApiKey(event.target.value)}
                        placeholder="輸入你自己的金鑰"
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                      />
                    </label>
                  </div>
                  {aiProvider === 'huggingface' ? (
                    <label className="space-y-1">
                      <span className="text-xs text-slate-400">Hugging Face 模型</span>
                      <select
                        value={huggingFaceModel}
                        onChange={event => setHuggingFaceModel(event.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                      >
                        {HUGGING_FACE_MODEL_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <p className="text-xs text-slate-500">這把 key 只會在這次操作傳到 Edge Function，不會直接寫進資料庫。</p>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={aiImageStatus?.ready ? 'text-emerald-200' : 'text-amber-200'}>
                      {aiImageStatus?.ready
                        ? `目前使用 ${aiImageStatus.provider_label}：${aiImageStatus.model}${aiImageStatus.key_source === 'teacher' ? '（教師自備 key）' : '（系統 Secret）'}`
                        : `尚未完成 AI 圖片設定：${aiImageStatus?.missing_secret ?? '請檢查設定'}`}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">若未提供教師自備 key，系統會改用 Supabase Edge Function 內設定好的預設金鑰。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadAiImageStatus()}
                    disabled={checkingAiStatus}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-600 disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={checkingAiStatus ? 'animate-spin' : ''} />
                    檢查
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void probeAiImage()}
                    disabled={probingAiImage}
                    className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-900/40 px-3 py-2 text-xs text-fuchsia-200 hover:bg-fuchsia-900/60 disabled:opacity-50"
                  >
                    {probingAiImage ? <Sparkles size={14} className="animate-pulse" /> : <Wand2 size={14} />}
                    {probingAiImage ? '檢查中...' : '測試生圖'}
                  </button>
                </div>
                {aiDiagnostics ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                    <p className="mb-2 text-xs font-medium text-amber-200">AI 診斷資訊</p>
                    <pre className="whitespace-pre-wrap break-words text-xs text-amber-100">{aiDiagnostics}</pre>
                  </div>
                ) : null}
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
              啟用這張卡牌
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={savingCard || !hasAlbums}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <Save size={16} />
              {savingCard ? '儲存中...' : editingCardId ? '更新卡牌' : '建立卡牌'}
            </button>

            <button
              type="button"
              onClick={generateCardImage}
              disabled={savingCard || generatingCard || !cardForm.name.trim() || !cardForm.album_id || !canUseAiImage || !hasAlbums}
              className="inline-flex items-center gap-2 rounded-xl bg-fuchsia-600 px-5 py-3 font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50"
            >
              {generatingCard ? <Sparkles size={16} className="animate-pulse" /> : <Wand2 size={16} />}
              {generatingCard ? 'AI 生圖中...' : editingCardId ? '更新並生成卡圖' : '建立並生成卡圖'}
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

      <section className="rounded-2xl bg-slate-800 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-semibold text-white">卡牌大小</h2>
            <p className="mt-1 text-sm text-slate-400">拖曳滑桿，調整下方卡牌清單的顯示大小。</p>
          </div>
          <div className="flex items-center gap-3 lg:min-w-[320px]">
            <span className="text-xs text-slate-400">小</span>
            <input
              type="range"
              min={CARD_SCALE_MIN}
              max={CARD_SCALE_MAX}
              step={10}
              value={cardScale}
              onChange={event => setCardScale(clampNumber(Number(event.target.value), CARD_SCALE_MIN, CARD_SCALE_MAX))}
              className="h-2 w-full cursor-pointer accent-indigo-500"
            />
            <span className="text-xs text-slate-400">大</span>
            <span className="w-12 text-right text-sm text-slate-300">{cardScale}%</span>
          </div>
        </div>
      </section>

      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardGridMinWidth}px, 1fr))` }}>
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
                <p className="mt-1 text-sm text-slate-400">{card.description || '尚未填寫卡牌說明。'}</p>
                <p className="mt-2 text-xs text-slate-500">
                  分集冊：{card.album?.name ?? card.series}
                  {card.image_style ? ` | 風格：${card.image_style}` : ''}
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
                  disabled={(generatingCard && generatingCardId === card.id) || !canUseAiImage}
                  className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-600/20 px-3 py-2 text-sm text-fuchsia-300 hover:bg-fuchsia-600/30 disabled:opacity-50"
                >
                  <Wand2 size={16} />
                  {generatingCard && generatingCardId === card.id ? '生圖中...' : 'AI 生圖'}
                </button>

                <button
                  type="button"
                  onClick={() => void toggleCardActive(card)}
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
