import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, CheckCircle2, ImagePlus, KeyRound, Pencil, Power, PowerOff, RefreshCw, Save, Server, Sparkles, Upload, Wand2, X } from 'lucide-react'
import AiPromptEditor from '../components/AiPromptEditor'
import TeacherCardManagementTabs from '../components/TeacherCardManagementTabs'
import {
  DEFAULT_HUGGING_FACE_AUTHOR,
  DEFAULT_HUGGING_FACE_MODEL_NAME,
  buildHuggingFaceModelPath,
  formatDiagnosticsText,
  invokeAiImageFunction,
  loadAiPromptPreview,
  type AiDiagnostics,
  type AiImageStatus,
  type PromptPreviewResult,
} from '../lib/aiImage'
import { STYLE_OPTIONS } from '../lib/character'
import { uploadGeneratedImageBlob, uploadImageFile } from '../lib/imageUpload'
import {
  checkRemoteAiGateway,
  generateRemoteImagePreview,
  loadRemoteAiSettings,
  loadRemoteAiWorkflows,
  releaseRemoteAiModels,
  type RemoteAiGatewayHealth,
} from '../lib/remoteAi'
import { supabase } from '../lib/supabase'
import type { Card, CardAlbum, RemoteAiSettings, RemoteAiWorkflow } from '../types'

type AlbumForm = {
  name: string
  description: string
  cover_color: string
  image_url: string
  image_prompt: string
  image_style: string
  is_active: boolean
}

type PromptEditorState = {
  visible: boolean
  loading: boolean
  targetId: string | null
  finalPrompt: string
  negativePrompt: string
  seed: string
  supportsNegativePrompt: boolean
  supportsSeed: boolean
}

const AI_PROVIDER_OPTIONS = [
  { value: 'gemini', label: 'Gemini' },
  { value: 'openai', label: 'OpenAI / ChatGPT' },
  { value: 'huggingface', label: 'Hugging Face' },
] as const

const AI_SOURCE_OPTIONS = [
  { value: 'cloud', label: '雲端 AI' },
  { value: 'remote_comfyui', label: '共享 ComfyUI 主機' },
] as const

const emptyAlbumForm: AlbumForm = {
  name: '',
  description: '',
  cover_color: '#334155',
  image_url: '',
  image_prompt: '',
  image_style: STYLE_OPTIONS[0],
  is_active: true,
}

const emptyPromptEditorState: PromptEditorState = {
  visible: false,
  loading: false,
  targetId: null,
  finalPrompt: '',
  negativePrompt: '',
  seed: '',
  supportsNegativePrompt: false,
  supportsSeed: false,
}

function mapAlbumToForm(album: CardAlbum): AlbumForm {
  return {
    name: album.name,
    description: album.description ?? '',
    cover_color: album.cover_color || '#334155',
    image_url: album.image_url ?? '',
    image_prompt: album.image_prompt ?? '',
    image_style: album.image_style ?? STYLE_OPTIONS[0],
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
  const [uploadingImage, setUploadingImage] = useState(false)
  const [generatingImage, setGeneratingImage] = useState(false)
  const [aiImageStatus, setAiImageStatus] = useState<AiImageStatus | null>(null)
  const [aiDiagnostics, setAiDiagnostics] = useState<string | null>(null)
  const [checkingAiStatus, setCheckingAiStatus] = useState(false)
  const [probingAiImage, setProbingAiImage] = useState(false)
  const [aiSource, setAiSource] = useState<(typeof AI_SOURCE_OPTIONS)[number]['value']>('cloud')
  const [aiProvider, setAiProvider] = useState<(typeof AI_PROVIDER_OPTIONS)[number]['value']>('gemini')
  const [teacherApiKey, setTeacherApiKey] = useState('')
  const [huggingFaceAuthor, setHuggingFaceAuthor] = useState(DEFAULT_HUGGING_FACE_AUTHOR)
  const [huggingFaceModelName, setHuggingFaceModelName] = useState(DEFAULT_HUGGING_FACE_MODEL_NAME)
  const [remoteAiSettings, setRemoteAiSettings] = useState<RemoteAiSettings | null>(null)
  const [loadingRemoteAiSettings, setLoadingRemoteAiSettings] = useState(false)
  const [remoteAiHealth, setRemoteAiHealth] = useState<RemoteAiGatewayHealth | null>(null)
  const [testingRemoteAi, setTestingRemoteAi] = useState(false)
  const [remoteWorkflows, setRemoteWorkflows] = useState<RemoteAiWorkflow[]>([])
  const [loadingRemoteWorkflows, setLoadingRemoteWorkflows] = useState(false)
  const [selectedRemoteWorkflowId, setSelectedRemoteWorkflowId] = useState<string>('')
  const [remoteSourceImageDataUrl, setRemoteSourceImageDataUrl] = useState<string | null>(null)
  const [remoteSourceImageName, setRemoteSourceImageName] = useState<string | null>(null)
  const [remotePreviewUrl, setRemotePreviewUrl] = useState<string | null>(null)
  const [remotePreviewBase64, setRemotePreviewBase64] = useState<string | null>(null)
  const [remotePreviewMimeType, setRemotePreviewMimeType] = useState<string | null>(null)
  const [remotePreviewAlbumId, setRemotePreviewAlbumId] = useState<string | null>(null)
  const [remotePreviewPrompt, setRemotePreviewPrompt] = useState('')
  const [remotePreviewStyle, setRemotePreviewStyle] = useState<string>(STYLE_OPTIONS[0])
  const [applyingRemotePreview, setApplyingRemotePreview] = useState(false)
  const [promptEditor, setPromptEditor] = useState<PromptEditorState>(emptyPromptEditorState)

  const albumCardCounts = useMemo(() => {
    return cards.reduce<Record<string, number>>((counts, card) => {
      if (!card.album_id) return counts
      counts[card.album_id] = (counts[card.album_id] ?? 0) + 1
      return counts
    }, {})
  }, [cards])
  const hasTeacherApiKey = teacherApiKey.trim().length > 0
  const canUseAiImage = aiImageStatus?.ready !== false || hasTeacherApiKey
  const canUseRemoteAi =
    Boolean(remoteAiSettings?.is_enabled) &&
    Boolean(remoteAiSettings?.base_url.trim()) &&
    Boolean(
      (remoteAiSettings?.workflow_api_json ?? '').trim() ||
        remoteWorkflows.some(workflow => workflow.is_active && (workflow.target_type === 'all' || workflow.target_type === 'album'))
    ) &&
    Boolean(remoteAiSettings?.shared_secret_configured)
  const availableRemoteWorkflows = useMemo(
    () => remoteWorkflows.filter(workflow => workflow.is_active && (workflow.target_type === 'all' || workflow.target_type === 'album')),
    [remoteWorkflows]
  )
  const huggingFaceModel = buildHuggingFaceModelPath(huggingFaceAuthor, huggingFaceModelName)
  const aiSourceRef = useRef<(typeof AI_SOURCE_OPTIONS)[number]['value']>(aiSource)

  useEffect(() => {
    void Promise.all([loadAlbums(), loadCards()])
    void loadAiImageStatus()
    void refreshRemoteAiSettings()
    void refreshRemoteWorkflows()
  }, [])

  useEffect(() => {
    return () => {
      if (remotePreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(remotePreviewUrl)
      }
    }
  }, [remotePreviewUrl])

  useEffect(() => {
    const previousSource = aiSourceRef.current
    aiSourceRef.current = aiSource

    if (previousSource === 'remote_comfyui' && aiSource !== 'remote_comfyui') {
      clearRemotePreview(true)
    }
  }, [aiSource])

  useEffect(() => {
    return () => {
      if (aiSourceRef.current === 'remote_comfyui') {
        void releaseRemoteAiModels().catch(() => {})
      }
    }
  }, [])

  useEffect(() => {
    if (!selectedRemoteWorkflowId) return

    const workflowStillAvailable = availableRemoteWorkflows.some(workflow => workflow.id === selectedRemoteWorkflowId)
    if (!workflowStillAvailable) {
      setSelectedRemoteWorkflowId('')
    }
  }, [availableRemoteWorkflows, selectedRemoteWorkflowId])

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

  const refreshRemoteAiSettings = async () => {
    setLoadingRemoteAiSettings(true)

    try {
      setRemoteAiSettings(await loadRemoteAiSettings())
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : 'Failed to load shared ComfyUI settings.')
    } finally {
      setLoadingRemoteAiSettings(false)
    }
  }

  const refreshRemoteWorkflows = async () => {
    setLoadingRemoteWorkflows(true)

    try {
      setRemoteWorkflows(await loadRemoteAiWorkflows())
    } catch (workflowError) {
      setError(workflowError instanceof Error ? workflowError.message : 'Failed to load shared workflows.')
    } finally {
      setLoadingRemoteWorkflows(false)
    }
  }

  const releaseRemoteModelsIfNeeded = async () => {
    if (!canUseRemoteAi) return

    try {
      await releaseRemoteAiModels()
    } catch {
      // Best effort only.
    }
  }

  const clearRemotePreview = (shouldRelease = false) => {
    if (remotePreviewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(remotePreviewUrl)
    }

    setRemotePreviewUrl(null)
    setRemotePreviewBase64(null)
    setRemotePreviewMimeType(null)
    setRemotePreviewAlbumId(null)
    setRemotePreviewPrompt('')
    setRemotePreviewStyle(STYLE_OPTIONS[0])

    if (shouldRelease) {
      void releaseRemoteModelsIfNeeded()
    }
  }

  const loadAiImageStatus = async () => {
    setCheckingAiStatus(true)

    try {
      const result = await invokeAiImageFunction({
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
        missing_secret: 'GEMINI_API_KEY or OPENAI_API_KEY',
        key_source: null,
      })
      setError(statusError instanceof Error ? statusError.message : 'Failed to check AI image status.')
    } finally {
      setCheckingAiStatus(false)
    }
  }

  const probeAiImage = async () => {
    setProbingAiImage(true)
    setMessage(null)
    setError(null)

    try {
      const result = await invokeAiImageFunction({
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
      setMessage(data?.ok ? 'AI image probe succeeded.' : 'AI image probe finished.')
    } catch (probeError) {
      setError(probeError instanceof Error ? probeError.message : 'AI image probe failed.')
    } finally {
      setProbingAiImage(false)
    }
  }

  const testRemoteAiGateway = async () => {
    setTestingRemoteAi(true)
    setMessage(null)
    setError(null)

    try {
      const result = await checkRemoteAiGateway()
      setRemoteAiHealth(result)
      setMessage(result.ready ? 'Shared ComfyUI host is ready.' : result.message ?? 'Shared ComfyUI host is not ready yet.')
    } catch (healthError) {
      setRemoteAiHealth(null)
      setError(healthError instanceof Error ? healthError.message : 'Failed to test shared ComfyUI host.')
    } finally {
      setTestingRemoteAi(false)
    }
  }

  function resetAlbumForm() {
    clearRemotePreview(true)
    setPromptEditor(emptyPromptEditorState)
    setEditingAlbumId(null)
    setAlbumForm(emptyAlbumForm)
  }

  function beginEditAlbum(album: CardAlbum) {
    if (remotePreviewAlbumId && remotePreviewAlbumId !== album.id) {
      clearRemotePreview(true)
    }

    setPromptEditor(emptyPromptEditorState)
    setEditingAlbumId(album.id)
    setAlbumForm(mapAlbumToForm(album))
    setMessage(`正在編輯分集冊「${album.name}」。`)
    setError(null)
  }

  async function ensureAlbumForImage() {
    const payload = {
      name: albumForm.name.trim(),
      description: albumForm.description.trim(),
      cover_color: albumForm.cover_color,
      image_url: albumForm.image_url.trim() || null,
      image_prompt: albumForm.image_prompt.trim() || null,
      image_style: albumForm.image_style.trim() || null,
      is_active: albumForm.is_active,
    }

    if (!payload.name) {
      throw new Error('請先輸入分集冊名稱。')
    }

    if (!editingAlbumId) {
      const { data, error } = await supabase.from('card_albums').insert(payload).select('*').single()
      if (error) throw error
      const album = data as CardAlbum
      setEditingAlbumId(album.id)
      return album
    }

    const { data, error } = await supabase.from('card_albums').update(payload).eq('id', editingAlbumId).select('*').single()
    if (error) throw error
    return data as CardAlbum
  }

  async function saveAlbum(event: React.FormEvent) {
    event.preventDefault()
    setSavingAlbum(true)
    setMessage(null)
    setError(null)

    try {
      const album = await ensureAlbumForImage()
      setMessage(editingAlbumId ? `已更新分集冊「${album.name}」。` : `已建立分集冊「${album.name}」。`)
      resetAlbumForm()
      await loadAlbums()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '儲存分集冊失敗。')
    } finally {
      setSavingAlbum(false)
    }
  }

  async function handleAlbumImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploadingImage(true)
    setMessage(null)
    setError(null)

    try {
      const result = await uploadImageFile(file, 'albums')
      setAlbumForm(previous => ({ ...previous, image_url: result.publicUrl }))
      setMessage('分集冊封面已上傳。')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '分集冊封面上傳失敗。')
    } finally {
      setUploadingImage(false)
    }
  }

  async function handleRemoteSourceImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setMessage(null)
    setError(null)

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
        reader.onerror = () => reject(new Error('讀取參考圖片失敗。'))
        reader.readAsDataURL(file)
      })

      if (!dataUrl) {
        throw new Error('讀取參考圖片失敗。')
      }

      setRemoteSourceImageDataUrl(dataUrl)
      setRemoteSourceImageName(file.name)
      setMessage(`已載入圖生圖參考圖片：${file.name}`)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '讀取參考圖片失敗。')
    }
  }

  const getPromptOverrides = () => {
    if (!promptEditor.visible || !promptEditor.finalPrompt.trim()) {
      return {
        finalPromptOverride: undefined,
        negativePromptOverride: undefined,
        seedOverride: undefined,
      }
    }

    const parsedSeed = Number(promptEditor.seed.trim())

    return {
      finalPromptOverride: promptEditor.finalPrompt.trim(),
      negativePromptOverride: promptEditor.supportsNegativePrompt ? promptEditor.negativePrompt.trim() : undefined,
      seedOverride:
        promptEditor.supportsSeed && Number.isFinite(parsedSeed) ? Math.max(0, Math.floor(parsedSeed)) : undefined,
    }
  }

  const applyPromptPreviewResult = (result: PromptPreviewResult) => {
    setPromptEditor({
      visible: true,
      loading: false,
      targetId: result.target_id,
      finalPrompt: result.final_prompt,
      negativePrompt: result.negative_prompt ?? '',
      seed: result.seed === null || result.seed === undefined ? '' : String(result.seed),
      supportsNegativePrompt: result.supports_negative_prompt,
      supportsSeed: result.supports_seed,
    })
  }

  const openPromptPreview = async () => {
    setMessage(null)
    setError(null)
    setPromptEditor(previous => ({ ...previous, visible: true, loading: true }))

    try {
      const album = await ensureAlbumForImage()
      setEditingAlbumId(album.id)
      await loadAlbums()

      const preview = await loadAiPromptPreview({
        targetType: 'album',
        targetId: album.id,
        imagePrompt: albumForm.image_prompt.trim(),
        imageStyle: albumForm.image_style,
        generationSource: aiSource,
        workflowId: selectedRemoteWorkflowId || undefined,
      })

      applyPromptPreviewResult(preview)
    } catch (previewError) {
      setPromptEditor(previous => ({ ...previous, loading: false }))
      setError(previewError instanceof Error ? previewError.message : 'Failed to load AI prompt preview.')
    }
  }

  const generateAlbumImage = async () => {
    setGeneratingImage(true)
    setMessage(null)
    setError(null)
    setAiDiagnostics(null)

    try {
      const album = await ensureAlbumForImage()
      setEditingAlbumId(album.id)

      if (aiSource === 'remote_comfyui') {
        const preview = await generateRemoteImagePreview({
          targetType: 'album',
          targetId: album.id,
          imagePrompt: albumForm.image_prompt.trim(),
          imageStyle: albumForm.image_style,
          workflowId: selectedRemoteWorkflowId || undefined,
          sourceImageDataUrl: remoteSourceImageDataUrl,
          sourceImageName: remoteSourceImageName,
          ...getPromptOverrides(),
        })

        clearRemotePreview(true)
        setRemotePreviewUrl(`data:${preview.mime_type};base64,${preview.preview_image_base64}`)
        setRemotePreviewBase64(preview.preview_image_base64)
        setRemotePreviewMimeType(preview.mime_type)
        setRemotePreviewAlbumId(album.id)
        setRemotePreviewPrompt(albumForm.image_prompt.trim())
        setRemotePreviewStyle(albumForm.image_style)
        setMessage('共享 ComfyUI 主機已產生分集冊封面預覽圖，確認後即可套用。')
        return
      }

      const result = await invokeAiImageFunction({
        action: 'generate',
        targetType: 'album',
        targetId: album.id,
        imagePrompt: albumForm.image_prompt.trim(),
        imageStyle: albumForm.image_style,
        aiProvider,
        apiKey: teacherApiKey.trim() || undefined,
        modelOverride: aiProvider === 'huggingface' ? huggingFaceModel : undefined,
        ...getPromptOverrides(),
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

      if (typeof data?.image_url === 'string') {
        setAlbumForm(previous => ({ ...previous, image_url: data.image_url as string }))
      }

      await loadAlbums()
      setMessage((data?.message as string | undefined) ?? 'Album cover generated.')
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Album cover generation failed.')
    } finally {
      setGeneratingImage(false)
    }
  }

  const applyRemotePreview = async () => {
    if (!remotePreviewUrl || !remotePreviewBase64 || !remotePreviewMimeType || !remotePreviewAlbumId) {
      setError('No shared ComfyUI preview is ready to apply.')
      return
    }

    setApplyingRemotePreview(true)
    setMessage(null)
    setError(null)

    try {
      const binary = atob(remotePreviewBase64)
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
      const blob = new Blob([bytes], { type: remotePreviewMimeType })
      const targetAlbum = albums.find(album => album.id === remotePreviewAlbumId)
      const uploadResult = await uploadGeneratedImageBlob(blob, 'albums', (targetAlbum?.name ?? albumForm.name ?? 'album-cover').trim())

      const { data, error: updateError } = await supabase
        .from('card_albums')
        .update({
          image_url: uploadResult.publicUrl,
          image_storage_path: uploadResult.path,
          image_prompt: remotePreviewPrompt || null,
          image_style: remotePreviewStyle,
        })
        .eq('id', remotePreviewAlbumId)
        .select('*')
        .single()

      if (updateError) throw updateError

      await loadAlbums()
      if (editingAlbumId === remotePreviewAlbumId) {
        beginEditAlbum(data as CardAlbum)
      }
      clearRemotePreview(true)
      setMessage('已套用共享 ComfyUI 分集冊封面預覽圖。')
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Failed to apply shared ComfyUI preview.')
    } finally {
      setApplyingRemotePreview(false)
    }
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">分集冊設定</h1>
        <p className="mt-1 text-sm text-slate-400">先整理分集冊，再到卡牌管理頁建立卡牌。現在也可以直接幫分集冊做封面圖。</p>
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

        <form onSubmit={saveAlbum} className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-300">分集冊名稱</span>
                <input
                  value={albumForm.name}
                  onChange={event => setAlbumForm(previous => ({ ...previous, name: event.target.value }))}
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">封面主色</span>
                <input
                  value={albumForm.cover_color}
                  onChange={event => setAlbumForm(previous => ({ ...previous, cover_color: event.target.value }))}
                  placeholder="#334155"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                />
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-slate-300">說明</span>
                <textarea
                  value={albumForm.description}
                  onChange={event => setAlbumForm(previous => ({ ...previous, description: event.target.value }))}
                  rows={3}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                />
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300 md:col-span-2">
                <input
                  type="checkbox"
                  checked={albumForm.is_active}
                  onChange={event => setAlbumForm(previous => ({ ...previous, is_active: event.target.checked }))}
                  className="accent-indigo-500"
                />
                啟用這個分集冊
              </label>
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <ImagePlus size={16} className="text-indigo-300" />
                分集冊封面預覽
              </div>

              <div className="aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 shadow-lg" style={{ backgroundColor: albumForm.cover_color }}>
                {remotePreviewUrl ? (
                  <img src={remotePreviewUrl} alt={albumForm.name || 'Album preview'} className="h-full w-full object-cover" />
                ) : albumForm.image_url ? (
                  <img src={albumForm.image_url} alt={albumForm.name || 'Album cover'} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full flex-col justify-between bg-black/10 p-4 text-white">
                    <span className="rounded-full bg-black/20 px-2 py-1 text-xs w-fit">{albumCardCounts[editingAlbumId ?? ''] ?? 0} 張卡</span>
                    <div>
                      <p className="text-xl font-bold">{albumForm.name || '尚未命名分集冊'}</p>
                      <p className="mt-1 text-sm text-white/80">{albumForm.description || '封面可使用上傳圖片或 AI 生成。'}</p>
                    </div>
                  </div>
                )}
              </div>

              <label className="space-y-1">
                <span className="text-xs text-slate-400">Image URL</span>
                <input
                  value={albumForm.image_url}
                  onChange={event => setAlbumForm(previous => ({ ...previous, image_url: event.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                />
              </label>

              <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-600">
                <Upload size={16} />
                {uploadingImage ? 'Uploading...' : 'Upload image'}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void handleAlbumImageUpload(event)} className="hidden" />
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs text-slate-400">Style</span>
                  <select
                    value={albumForm.image_style}
                    onChange={event => setAlbumForm(previous => ({ ...previous, image_style: event.target.value }))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                  >
                    {STYLE_OPTIONS.map(style => (
                      <option key={style} value={style}>
                        {style}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="space-y-1">
                  <span className="text-xs text-slate-400">Image source</span>
                  <div className="flex flex-wrap gap-2">
                    {AI_SOURCE_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setAiSource(option.value)}
                        className={`rounded-lg border px-3 py-2 text-xs ${
                          aiSource === option.value
                            ? 'border-indigo-500 bg-indigo-500/15 text-white'
                            : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs text-slate-400">Prompt details</span>
                  <textarea
                    value={albumForm.image_prompt}
                    onChange={event => setAlbumForm(previous => ({ ...previous, image_prompt: event.target.value }))}
                    rows={2}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                  />
                </label>
              </div>

              {aiSource === 'cloud' ? (
                <div className="space-y-3 rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <KeyRound size={16} className="text-fuchsia-300" />
                    Teacher API key
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs text-slate-400">AI provider</span>
                      <select value={aiProvider} onChange={event => setAiProvider(event.target.value as typeof aiProvider)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white">
                        {AI_PROVIDER_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-slate-400">Teacher API key optional</span>
                      <input type="password" value={teacherApiKey} onChange={event => setTeacherApiKey(event.target.value)} autoComplete="off" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white" />
                    </label>
                    {aiProvider === 'huggingface' ? (
                      <>
                        <label className="space-y-1">
                          <span className="text-xs text-slate-400">Hugging Face author</span>
                          <input value={huggingFaceAuthor} onChange={event => setHuggingFaceAuthor(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white" />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs text-slate-400">Hugging Face model</span>
                          <input value={huggingFaceModelName} onChange={event => setHuggingFaceModelName(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white" />
                        </label>
                      </>
                    ) : null}
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={aiImageStatus?.ready ? 'text-emerald-200' : 'text-amber-200'}>
                        {aiImageStatus?.ready
                          ? `目前使用 ${aiImageStatus.provider_label}: ${aiImageStatus.model}${aiImageStatus.key_source === 'teacher' ? '（教師自備 key）' : '（系統設定）'}`
                          : `目前尚未就緒：${aiImageStatus?.missing_secret ?? '請補上 API key 或系統密鑰'}`}
                      </p>
                    </div>
                    <button type="button" onClick={() => void loadAiImageStatus()} disabled={checkingAiStatus} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-600 disabled:opacity-50">
                      <RefreshCw size={14} className={checkingAiStatus ? 'animate-spin' : ''} />
                      重新檢查
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void probeAiImage()} disabled={probingAiImage} className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-900/40 px-3 py-2 text-xs text-fuchsia-200 hover:bg-fuchsia-900/60 disabled:opacity-50">
                      {probingAiImage ? <Sparkles size={14} className="animate-pulse" /> : <Wand2 size={14} />}
                      {probingAiImage ? '檢查中...' : '檢查 AI 連線'}
                    </button>
                  </div>

                  {aiDiagnostics ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                      <p className="mb-2 text-xs font-medium text-amber-200">AI 診斷資訊</p>
                      <pre className="whitespace-pre-wrap break-words text-xs text-amber-100">{aiDiagnostics}</pre>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3 rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <Server size={16} className="text-indigo-300" />
                    共享 ComfyUI 主機
                  </div>
                  <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300">
                    {loadingRemoteAiSettings ? '正在讀取共享生圖設定...' : remoteAiSettings?.base_url ? `Gateway：${remoteAiSettings.base_url}` : '尚未設定 Gateway 公開網址'}
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={canUseRemoteAi ? 'text-emerald-200' : 'text-amber-200'}>
                        {canUseRemoteAi ? '共享 ComfyUI 主機設定已就緒。' : '共享生圖主機尚未完成設定或尚未啟用。'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {!remoteAiSettings?.shared_secret_configured ? '尚未設定共享金鑰。' : remoteAiHealth?.message ?? '可先按測試連線，確認 Gateway 與 ComfyUI 是否正常。'}
                      </p>
                    </div>
                    <button type="button" onClick={() => void testRemoteAiGateway()} disabled={testingRemoteAi} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-600 disabled:opacity-50">
                      <RefreshCw size={14} className={testingRemoteAi ? 'animate-spin' : ''} />
                      {testingRemoteAi ? '測試中...' : '測試連線'}
                    </button>
                  </div>

                  {remoteAiHealth ? (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className={`rounded-lg border px-3 py-2 text-xs ${remoteAiHealth.configured ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-100' : 'border-slate-700 bg-slate-900/60 text-slate-300'}`}>
                        設定：{remoteAiHealth.configured ? '完成' : '未完成'}
                      </div>
                      <div className={`rounded-lg border px-3 py-2 text-xs ${remoteAiHealth.gateway_reachable ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-rose-500/30 bg-rose-500/10 text-rose-100'}`}>
                        Gateway：{remoteAiHealth.gateway_reachable ? '可連線' : '失敗'}
                      </div>
                      <div className={`rounded-lg border px-3 py-2 text-xs ${remoteAiHealth.comfyui_reachable ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-amber-500/30 bg-amber-500/10 text-amber-100'}`}>
                        ComfyUI：{remoteAiHealth.comfyui_reachable ? '就緒' : '未就緒'}
                      </div>
                    </div>
                  ) : null}

                  <label className="space-y-1">
                    <span className="text-xs text-slate-400">共享 workflow</span>
                    <select value={selectedRemoteWorkflowId} onChange={event => setSelectedRemoteWorkflowId(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white">
                      <option value="">{loadingRemoteWorkflows ? '載入中...' : '使用預設 workflow'}</option>
                      {availableRemoteWorkflows.map(workflow => (
                        <option key={workflow.id} value={workflow.id}>
                          {workflow.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-900/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">圖生圖參考圖片</p>
                        <p className="mt-1 text-xs text-slate-400">若你選的是圖生圖 workflow，請先上傳參考圖再按生成預覽。</p>
                      </div>
                      {remoteSourceImageDataUrl ? (
                        <button
                          type="button"
                          onClick={() => {
                            setRemoteSourceImageDataUrl(null)
                            setRemoteSourceImageName(null)
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-600"
                        >
                          <X size={14} />
                          清除
                        </button>
                      ) : null}
                    </div>
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-950 px-4 py-3 text-sm text-slate-200 hover:border-indigo-400 hover:text-white">
                      <Upload size={16} />
                      {remoteSourceImageName ? `已選擇：${remoteSourceImageName}` : '上傳參考圖片'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={event => void handleRemoteSourceImageUpload(event)}
                        className="hidden"
                      />
                    </label>
                    {remoteSourceImageDataUrl ? (
                      <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950">
                        <img src={remoteSourceImageDataUrl} alt={remoteSourceImageName ?? '圖生圖參考圖片'} className="h-40 w-full object-cover" />
                      </div>
                    ) : null}
                  </div>

                  {remotePreviewUrl ? (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-emerald-100">
                        <CheckCircle2 size={14} />
                        已產生分集冊封面預覽圖
                      </div>
                      <p className="mt-2 text-xs text-emerald-100/80">預覽圖還未寫入資料庫，確認後再套用到分集冊。</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void applyRemotePreview()} disabled={applyingRemotePreview} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
                          {applyingRemotePreview ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                          {applyingRemotePreview ? '套用中...' : '套用到分集冊'}
                        </button>
                        <button type="button" onClick={() => clearRemotePreview(true)} disabled={applyingRemotePreview} className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-xs text-slate-100 hover:bg-slate-600 disabled:opacity-50">
                          <X size={14} />
                          捨棄預覽
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              <AiPromptEditor
                visible={promptEditor.visible}
                loading={promptEditor.loading}
                generating={generatingImage}
                finalPrompt={promptEditor.finalPrompt}
                negativePrompt={promptEditor.negativePrompt}
                seed={promptEditor.seed}
                supportsNegativePrompt={promptEditor.supportsNegativePrompt}
                supportsSeed={promptEditor.supportsSeed}
                onToggle={() => {
                  if (!promptEditor.visible) {
                    void openPromptPreview()
                    return
                  }

                  setPromptEditor(previous => ({ ...previous, visible: false }))
                }}
                onRefresh={() => void openPromptPreview()}
                onGenerate={() => void generateAlbumImage()}
                onFinalPromptChange={value => setPromptEditor(previous => ({ ...previous, finalPrompt: value }))}
                onNegativePromptChange={value => setPromptEditor(previous => ({ ...previous, negativePrompt: value }))}
                onSeedChange={value => setPromptEditor(previous => ({ ...previous, seed: value }))}
                disabled={savingAlbum || !albumForm.name.trim()}
              />

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => void generateAlbumImage()} disabled={savingAlbum || generatingImage || !albumForm.name.trim() || (aiSource === 'cloud' ? !canUseAiImage : !canUseRemoteAi)} className="inline-flex items-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50">
                  {generatingImage ? <RefreshCw size={16} className="animate-spin" /> : <Wand2 size={16} />}
                  {generatingImage ? 'Generating...' : aiSource === 'remote_comfyui' ? 'Generate preview' : 'Generate album cover'}
                </button>

                <button type="submit" disabled={savingAlbum} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
                  <Save size={16} />
                  {savingAlbum ? '儲存中...' : editingAlbumId ? '更新分集冊' : '建立分集冊'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">現有分集冊</h2>

        <div className="grid gap-4 md:grid-cols-2">
          {albums.map(album => (
            <div key={album.id} className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
              <div className="flex items-start gap-4">
                <div className="h-28 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10" style={{ backgroundColor: album.cover_color || '#334155' }}>
                  {album.image_url ? (
                    <img src={album.image_url} alt={album.name} className="h-full w-full object-cover" />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: album.cover_color || '#334155' }} />
                        <p className="font-semibold text-white">{album.name}</p>
                      </div>
                      <p className="mt-2 text-sm text-slate-400">{album.description || '尚未填寫分集冊說明。'}</p>
                      <p className="mt-3 text-xs text-slate-500">卡牌數量：{albumCardCounts[album.id] ?? 0}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${album.is_active ? 'bg-emerald-600/20 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}>
                      {album.is_active ? '啟用中' : '已停用'}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => beginEditAlbum(album)} className="inline-flex items-center gap-2 rounded-lg bg-amber-600/20 px-3 py-2 text-sm text-amber-300 hover:bg-amber-600/30">
                      <Pencil size={16} />
                      編輯
                    </button>

                    <button
                      type="button"
                      onClick={() => void toggleAlbumActive(album)}
                      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                        album.is_active ? 'bg-rose-600/20 text-rose-300 hover:bg-rose-600/30' : 'bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
                      }`}
                    >
                      {album.is_active ? <PowerOff size={16} /> : <Power size={16} />}
                      {album.is_active ? '停用' : '啟用'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
