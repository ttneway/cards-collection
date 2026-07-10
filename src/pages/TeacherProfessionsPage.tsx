import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ImagePlus, KeyRound, Plus, RefreshCw, Save, Server, Sparkles, SwitchCamera, Wand2, X } from 'lucide-react'
import {
  DEFAULT_HUGGING_FACE_AUTHOR,
  DEFAULT_HUGGING_FACE_MODEL_NAME,
  buildHuggingFaceModelPath,
  formatDiagnosticsText,
  invokeAiImageFunction,
  type AiDiagnostics,
  type AiImageStatus,
} from '../lib/aiImage'
import { uploadGeneratedImageBlob, uploadImageFile } from '../lib/imageUpload'
import { checkRemoteAiGateway, generateRemoteImagePreview, loadRemoteAiSettings, releaseRemoteAiModels, type RemoteAiGatewayHealth } from '../lib/remoteAi'
import { supabase } from '../lib/supabase'
import { EFFECT_LABELS, STYLE_OPTIONS, formatEffectValue, getBalanceWarnings, getTierLabel } from '../lib/character'
import { useAuthStore } from '../stores/authStore'
import type { BonusEntry, ProfessionEffect, ProfessionEffectType, ProfessionTemplate, RemoteAiSettings } from '../types'

type ProfessionWithEffects = ProfessionTemplate & { profession_effects?: ProfessionEffect[] }

type EffectForm = {
  effect_type: ProfessionEffectType
  base_value: number
  per_level_value: number
  max_preview_value: number
  stack_group: string
  description: string
}

type ProfessionForm = {
  name: string
  code: string
  description: string
  theme_color: string
  icon_url: string
  icon_url_male: string
  icon_url_female: string
  image_prompt: string
  image_style: string
  unlock_tier: number
  is_active: boolean
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

const PREVIEW_LEVEL_OPTIONS = [10, 20, 30, 40, 50, 60] as const

type PreviewBonusesPayload = {
  summary: Partial<Record<ProfessionEffectType, number>>
  entries: BonusEntry[]
}

const defaultEffect = (): EffectForm => ({
  effect_type: 'task_points_percent',
  base_value: 1,
  per_level_value: 0.5,
  max_preview_value: 3,
  stack_group: 'task',
  description: '',
})

const emptyForm: ProfessionForm = {
  name: '',
  code: '',
  description: '',
  theme_color: '#6366f1',
  icon_url: '',
  icon_url_male: '',
  icon_url_female: '',
  image_prompt: '',
  image_style: STYLE_OPTIONS[0],
  unlock_tier: 1,
  is_active: true,
}

export default function TeacherProfessionsPage() {
  const { user } = useAuthStore()
  const [professions, setProfessions] = useState<ProfessionWithEffects[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProfessionForm>(emptyForm)
  const [effects, setEffects] = useState<EffectForm[]>([defaultEffect()])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
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
  const [remotePreviewUrl, setRemotePreviewUrl] = useState<string | null>(null)
  const [remotePreviewBase64, setRemotePreviewBase64] = useState<string | null>(null)
  const [remotePreviewMimeType, setRemotePreviewMimeType] = useState<string | null>(null)
  const [remotePreviewProfessionId, setRemotePreviewProfessionId] = useState<string | null>(null)
  const [remotePreviewPrompt, setRemotePreviewPrompt] = useState<string>('')
  const [remotePreviewStyle, setRemotePreviewStyle] = useState<string>(STYLE_OPTIONS[0])
  const [applyingRemotePreview, setApplyingRemotePreview] = useState(false)
  const [previewLevel, setPreviewLevel] = useState<number>(10)
  const [previewBonuses, setPreviewBonuses] = useState<PreviewBonusesPayload | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const warnings = useMemo(
    () => getBalanceWarnings(effects.length, effects.map(effect => effect.effect_type)),
    [effects]
  )
  const hasTeacherApiKey = teacherApiKey.trim().length > 0
  const canUseAiImage = aiImageStatus?.ready !== false || hasTeacherApiKey
  const canUseRemoteAi =
    Boolean(remoteAiSettings?.is_enabled) &&
    Boolean(remoteAiSettings?.base_url.trim()) &&
    Boolean(remoteAiSettings?.workflow_api_json.trim()) &&
    Boolean(remoteAiSettings?.shared_secret_configured)
  const huggingFaceModel = buildHuggingFaceModelPath(huggingFaceAuthor, huggingFaceModelName)
  const aiSourceRef = useRef<(typeof AI_SOURCE_OPTIONS)[number]['value']>(aiSource)

  useEffect(() => {
    void loadProfessions()
    void loadAiImageStatus()
    void refreshRemoteAiSettings()
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

  const loadProfessions = async () => {
    const { data, error } = await supabase
      .from('profession_templates')
      .select('*, profession_effects(*)')
      .order('unlock_tier', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      setError(error.message)
      return
    }

    setProfessions((data ?? []) as ProfessionWithEffects[])
  }

  const refreshRemoteAiSettings = async () => {
    setLoadingRemoteAiSettings(true)

    try {
      const nextSettings = await loadRemoteAiSettings()
      setRemoteAiSettings(nextSettings)
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : '讀取共享生圖設定失敗。')
    } finally {
      setLoadingRemoteAiSettings(false)
    }
  }

  const releaseRemoteModelsIfNeeded = async () => {
    if (!canUseRemoteAi) return

    try {
      await releaseRemoteAiModels()
    } catch {
      // Best effort cleanup only.
    }
  }

  const clearRemotePreview = (shouldRelease = false) => {
    if (remotePreviewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(remotePreviewUrl)
    }

    setRemotePreviewUrl(null)
    setRemotePreviewBase64(null)
    setRemotePreviewMimeType(null)
    setRemotePreviewProfessionId(null)
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
      setError(statusError instanceof Error ? statusError.message : '無法檢查 AI 圖片設定。')
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
      setMessage(data?.ok ? 'AI 生圖檢查成功。' : 'AI 生圖檢查完成。')
    } catch (probeError) {
      setError(probeError instanceof Error ? probeError.message : 'AI 生圖檢查失敗。')
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
      setMessage(result.ready ? '共享生圖主機連線成功。' : result.message ?? '共享生圖主機目前尚未就緒。')
    } catch (healthError) {
      setRemoteAiHealth(null)
      setError(healthError instanceof Error ? healthError.message : '測試共享生圖主機失敗。')
    } finally {
      setTestingRemoteAi(false)
    }
  }

  const loadPreviewBonuses = async (professionId: string, level = previewLevel) => {
    setPreviewLoading(true)

    try {
      const { data, error } = await supabase.rpc('preview_character_bonuses', {
        p_profession_ids: [professionId],
        p_primary_profession_id: professionId,
        p_level: level,
        p_equipment_ids: [],
      })

      if (error) throw error

      const payload = data as PreviewBonusesPayload | null
      setPreviewBonuses({
        summary: payload?.summary ?? {},
        entries: (payload?.entries ?? []) as BonusEntry[],
      })
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : '無法取得職業加成預覽。')
      setPreviewBonuses(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const resetForm = () => {
    clearRemotePreview(true)
    setEditingId(null)
    setForm(emptyForm)
    setEffects([defaultEffect()])
  }

  const beginEdit = (profession: ProfessionWithEffects) => {
    if (remotePreviewProfessionId && remotePreviewProfessionId !== profession.id) {
      clearRemotePreview(true)
    }
    setEditingId(profession.id)
    setForm({
      name: profession.name,
      code: profession.code,
      description: profession.description ?? '',
      theme_color: profession.theme_color,
      icon_url: profession.icon_url ?? '',
      icon_url_male: profession.icon_url_male ?? '',
      icon_url_female: profession.icon_url_female ?? '',
      image_prompt: profession.image_prompt ?? '',
      image_style: profession.image_style ?? STYLE_OPTIONS[0],
      unlock_tier: profession.unlock_tier,
      is_active: profession.is_active,
    })
    setEffects(
      (profession.profession_effects ?? []).map(effect => ({
        effect_type: effect.effect_type,
        base_value: effect.base_value,
        per_level_value: effect.per_level_value,
        max_preview_value: effect.max_preview_value,
        stack_group: effect.stack_group,
        description: effect.description ?? '',
      }))
    )
    setMessage(`正在編輯職業「${profession.name}」。`)
    setError(null)
    void loadPreviewBonuses(profession.id, previewLevel)
  }

  const saveProfessionRecord = async () => {
    if (!user) throw new Error('需要先登入。')

    const payload = {
      name: form.name.trim(),
      code: form.code.trim().toLowerCase(),
      description: form.description.trim(),
      theme_color: form.theme_color,
      icon_url: form.icon_url.trim() || null,
      icon_url_male: form.icon_url_male.trim() || null,
      icon_url_female: form.icon_url_female.trim() || null,
      image_prompt: form.image_prompt.trim() || null,
      image_style: form.image_style.trim() || null,
      unlock_tier: form.unlock_tier,
      is_active: form.is_active,
      created_by: user.id,
    }

    let professionId = editingId

    if (!editingId) {
      const { data, error } = await supabase.from('profession_templates').insert(payload).select('*').single()
      if (error) throw error
      professionId = data.id
    } else {
      const { error } = await supabase.from('profession_templates').update(payload).eq('id', editingId)
      if (error) throw error

      const { error: deleteError } = await supabase.from('profession_effects').delete().eq('profession_id', editingId)
      if (deleteError) throw deleteError
    }

    const rows = effects
      .filter(effect => effect.effect_type)
      .map(effect => ({
        profession_id: professionId,
        effect_type: effect.effect_type,
        base_value: Number(effect.base_value),
        per_level_value: Number(effect.per_level_value),
        max_preview_value: Number(effect.max_preview_value),
        stack_group: effect.stack_group.trim() || 'general',
        description: effect.description.trim(),
      }))

    if (rows.length > 0) {
      const { error } = await supabase.from('profession_effects').insert(rows)
      if (error) throw error
    }

    const { data: latest, error: latestError } = await supabase
      .from('profession_templates')
      .select('*, profession_effects(*)')
      .eq('id', professionId)
      .single()

    if (latestError) throw latestError

    return latest as ProfessionWithEffects
  }

  const saveProfession = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    setError(null)

    try {
      const wasEditing = Boolean(editingId)
      const nextProfession = await saveProfessionRecord()
      setMessage(wasEditing ? `已更新職業「${nextProfession.name}」。` : `已建立職業「${nextProfession.name}」。`)
      resetForm()
      await loadProfessions()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '職業儲存失敗。')
    } finally {
      setSaving(false)
    }
  }

  const handleProfessionImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    field: 'icon_url' | 'icon_url_male' | 'icon_url_female'
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    setMessage(null)
    setError(null)

    try {
      const result = await uploadImageFile(file, 'professions')
      setForm(previous => ({ ...previous, [field]: result.publicUrl }))
      setMessage('職業圖片上傳完成。')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '職業圖片上傳失敗。')
    } finally {
      event.target.value = ''
    }
  }

  const generateProfessionImage = async () => {
    setGeneratingImage(true)
    setMessage(null)
    setError(null)
    setAiDiagnostics(null)

    try {
      const nextProfession = await saveProfessionRecord()
      setEditingId(nextProfession.id)

      if (aiSource === 'remote_comfyui') {
        const preview = await generateRemoteImagePreview({
          targetType: 'profession',
          targetId: nextProfession.id,
          imagePrompt: form.image_prompt.trim(),
          imageStyle: form.image_style,
        })

        clearRemotePreview(true)
        setRemotePreviewUrl(`data:${preview.mime_type};base64,${preview.preview_image_base64}`)
        setRemotePreviewBase64(preview.preview_image_base64)
        setRemotePreviewMimeType(preview.mime_type)
        setRemotePreviewProfessionId(nextProfession.id)
        setRemotePreviewPrompt(form.image_prompt.trim())
        setRemotePreviewStyle(form.image_style)
        setMessage('共享 ComfyUI 主機已產生職業預覽圖，確認後即可套用。')
        return
      }

      const result = await invokeAiImageFunction({
        targetType: 'profession',
        targetId: nextProfession.id,
        imagePrompt: form.image_prompt.trim(),
        imageStyle: form.image_style,
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

      const updatedProfession = data?.profession as ProfessionWithEffects | undefined
      if (updatedProfession) {
        beginEdit(updatedProfession)
      }

      await loadProfessions()
      await loadAiImageStatus()
      setMessage(data?.message ?? 'AI 職業圖片已生成完成。')
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'AI 生圖失敗。')
    } finally {
      setGeneratingImage(false)
    }
  }

  const applyRemotePreview = async () => {
    if (!remotePreviewUrl || !remotePreviewBase64 || !remotePreviewMimeType || !remotePreviewProfessionId) {
      setError('目前沒有可套用的職業預覽圖。')
      return
    }

    setApplyingRemotePreview(true)
    setMessage(null)
    setError(null)

    try {
      const binary = atob(remotePreviewBase64)
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
      const blob = new Blob([bytes], { type: remotePreviewMimeType })
      const targetProfession = professions.find(profession => profession.id === remotePreviewProfessionId)
      const uploadResult = await uploadGeneratedImageBlob(blob, 'professions', (targetProfession?.name ?? form.name ?? 'profession-preview').trim())

      const { data, error: updateError } = await supabase
        .from('profession_templates')
        .update({
          icon_url: uploadResult.publicUrl,
          image_prompt: remotePreviewPrompt || null,
          image_style: remotePreviewStyle,
        })
        .eq('id', remotePreviewProfessionId)
        .select('*, profession_effects(*)')
        .single()

      if (updateError) {
        throw updateError
      }

      await loadProfessions()
      if (editingId === remotePreviewProfessionId) {
        beginEdit(data as ProfessionWithEffects)
      }
      clearRemotePreview(true)
      setMessage('已套用共享 ComfyUI 職業預覽圖。')
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : '套用職業預覽圖失敗。')
    } finally {
      setApplyingRemotePreview(false)
    }
  }

  const toggleActive = async (profession: ProfessionWithEffects) => {
    setMessage(null)
    setError(null)

    const { error } = await supabase
      .from('profession_templates')
      .update({ is_active: !profession.is_active })
      .eq('id', profession.id)

    if (error) {
      setError(error.message)
      return
    }

    setMessage(profession.is_active ? `已停用職業「${profession.name}」。` : `已啟用職業「${profession.name}」。`)
    await loadProfessions()
  }

  const updateEffect = (index: number, key: keyof EffectForm, value: string | number) => {
    setEffects(previous => previous.map((effect, effectIndex) => (effectIndex === index ? { ...effect, [key]: value } : effect)))
  }

  useEffect(() => {
    if (!editingId) {
      setPreviewBonuses(null)
      return
    }

    void loadPreviewBonuses(editingId, previewLevel)
  }, [editingId, previewLevel])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">職業管理</h1>
        <p className="mt-1 text-sm text-slate-400">建立職業模板、效果與職業圖片。現在也能直接在這裡生成 AI 職業圖。</p>
      </div>

      {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">{editingId ? '編輯職業' : '建立職業'}</h2>
            <p className="mt-1 text-sm text-slate-400">先整理名稱與效果，再用 AI 生成職業形象圖。</p>
          </div>
          {editingId ? (
            <button type="button" onClick={resetForm} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600">
              <X size={16} className="mr-1 inline" />
              建立新職業
            </button>
          ) : null}
        </div>

        <form onSubmit={saveProfession} className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-300">職業名稱</span>
                <input value={form.name} onChange={event => setForm(previous => ({ ...previous, name: event.target.value }))} required className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">代碼</span>
                <input value={form.code} onChange={event => setForm(previous => ({ ...previous, code: event.target.value }))} required className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">解鎖梯次</span>
                <select value={form.unlock_tier} onChange={event => setForm(previous => ({ ...previous, unlock_tier: Number(event.target.value) }))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white">
                  <option value={1}>10 等</option>
                  <option value={2}>20 等</option>
                  <option value={3}>30 等以上</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">主色</span>
                <input type="color" value={form.theme_color} onChange={event => setForm(previous => ({ ...previous, theme_color: event.target.value }))} className="h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-2 py-2" />
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-slate-300">說明</span>
                <textarea value={form.description} onChange={event => setForm(previous => ({ ...previous, description: event.target.value }))} rows={3} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">圖片網址</span>
                <input value={form.icon_url} onChange={event => setForm(previous => ({ ...previous, icon_url: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">男生職業圖片</span>
                <input value={form.icon_url_male} onChange={event => setForm(previous => ({ ...previous, icon_url_male: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">女生職業圖片</span>
                <input value={form.icon_url_female} onChange={event => setForm(previous => ({ ...previous, icon_url_female: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">上傳預設圖片</span>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-200 hover:border-indigo-400 hover:text-white">
                  <ImagePlus size={16} />
                  上傳圖片
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void handleProfessionImageUpload(event, 'icon_url')} className="hidden" />
                </label>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">上傳男生圖片</span>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-200 hover:border-indigo-400 hover:text-white">
                  <ImagePlus size={16} />
                  上傳圖片
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void handleProfessionImageUpload(event, 'icon_url_male')} className="hidden" />
                </label>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">上傳女生圖片</span>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-200 hover:border-indigo-400 hover:text-white">
                  <ImagePlus size={16} />
                  上傳圖片
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void handleProfessionImageUpload(event, 'icon_url_female')} className="hidden" />
                </label>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">AI 風格模板</span>
                <select value={form.image_style} onChange={event => setForm(previous => ({ ...previous, image_style: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white">
                  {STYLE_OPTIONS.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-slate-300">AI 提示詞補充</span>
                <textarea value={form.image_prompt} onChange={event => setForm(previous => ({ ...previous, image_prompt: event.target.value }))} rows={2} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
              </label>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm text-slate-300">
                <ImagePlus size={16} className="text-indigo-300" />
                職業預覽
              </div>

              <div className="aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 shadow-lg" style={{ backgroundColor: form.theme_color }}>
                {remotePreviewUrl ? (
                  <img src={remotePreviewUrl} alt={form.name || '????'} className="h-full w-full object-cover" />
                ) : form.icon_url ? (
                  <img src={form.icon_url} alt={form.name || '職業預覽'} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full flex-col justify-between bg-black/10 p-4 text-white">
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-full bg-black/20 px-2 py-1 text-xs">{getTierLabel(form.unlock_tier)}</span>
                      <span className="rounded-full bg-black/20 px-2 py-1 text-xs">{form.code || 'CODE'}</span>
                    </div>
                    <div>
                      <p className="text-xl font-bold">{form.name || '尚未命名職業'}</p>
                      <p className="mt-1 text-sm text-white/80">{form.description || '可先儲存，再用 AI 生成職業圖片。'}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-2 rounded-xl border border-slate-700 bg-slate-800/70 p-3 text-sm text-slate-300">
                <p>AI 會自動參考職業名稱、解鎖階段、主題與你的補充提示詞來生成職業圖片。</p>
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

                {aiSource === 'cloud' ? (
                  <>
                    <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-white">
                        <KeyRound size={16} className="text-fuchsia-300" />
                        教師自備 API key
                      </div>
                      <p className="text-xs text-slate-400">
                        不確定怎麼填時，可查看
                        <a href="/teacher/help#ai-image" className="ml-1 text-indigo-300 hover:text-indigo-200">
                          教師後台說明
                        </a>
                        。
                      </p>
                      <div className="grid gap-3 sm:grid-cols-[0.7fr_1.3fr]">
                        <label className="space-y-1">
                          <span className="text-xs text-slate-400">提供者</span>
                          <select value={aiProvider} onChange={event => setAiProvider(event.target.value as typeof aiProvider)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
                            {AI_PROVIDER_OPTIONS.map(option => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="space-y-1">
                          <span className="text-xs text-slate-400">API key</span>
                          <input type="password" value={teacherApiKey} onChange={event => setTeacherApiKey(event.target.value)} autoComplete="off" spellCheck={false} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
                        </label>
                      </div>

                      {aiProvider === 'huggingface' ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="space-y-1">
                            <span className="text-xs text-slate-400">作者 / 組織</span>
                            <input type="text" value={huggingFaceAuthor} onChange={event => setHuggingFaceAuthor(event.target.value)} autoComplete="off" spellCheck={false} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs text-slate-400">模型名稱</span>
                            <input type="text" value={huggingFaceModelName} onChange={event => setHuggingFaceModelName(event.target.value)} autoComplete="off" spellCheck={false} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
                          </label>
                          <p className="sm:col-span-2 text-xs text-slate-500">目前模型路徑：{huggingFaceModel}</p>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className={aiImageStatus?.ready ? 'text-emerald-200' : 'text-amber-200'}>
                          {aiImageStatus?.ready
                            ? `目前使用 ${aiImageStatus.provider_label}：${aiImageStatus.model}${aiImageStatus.key_source === 'teacher' ? '（教師自備 key）' : '（系統 Secret）'}`
                            : `尚未完成 AI 生圖設定：${aiImageStatus?.missing_secret ?? '請先設定金鑰'}`}
                        </p>
                      </div>
                      <button type="button" onClick={() => void loadAiImageStatus()} disabled={checkingAiStatus} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-600 disabled:opacity-50">
                        <RefreshCw size={14} className={checkingAiStatus ? 'animate-spin' : ''} />
                        重新整理
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void probeAiImage()} disabled={probingAiImage} className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-900/40 px-3 py-2 text-xs text-fuchsia-200 hover:bg-fuchsia-900/60 disabled:opacity-50">
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
                  </>
                ) : (
                  <>
                    <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-white">
                        <Server size={16} className="text-indigo-300" />
                        共享 ComfyUI 主機
                      </div>
                      <p className="text-xs text-slate-400">這裡會使用教師後台統一設定的 Gateway 公開網址、共享金鑰與 ComfyUI workflow。</p>
                      <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300">
                        {loadingRemoteAiSettings
                          ? '正在讀取共享生圖設定...'
                          : remoteAiSettings?.base_url
                            ? `Gateway：${remoteAiSettings.base_url}`
                            : '尚未設定 Gateway 公開網址'}
                      </div>
                    </div>

                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className={canUseRemoteAi ? 'text-emerald-200' : 'text-amber-200'}>
                          {canUseRemoteAi ? '共享 ComfyUI 主機設定已就緒。' : '共享生圖主機尚未完成設定或尚未啟用。'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {!remoteAiSettings?.shared_secret_configured
                            ? '尚未設定共享金鑰。'
                            : remoteAiHealth?.message ?? '尚未設定共享金鑰。請先檢查設定。'}
                        </p>
                      </div>
                      <button type="button" onClick={() => void testRemoteAiGateway()} disabled={testingRemoteAi} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-600 disabled:opacity-50">
                        <RefreshCw size={14} className={testingRemoteAi ? 'animate-spin' : ''} />
                        {testingRemoteAi ? '測試中' : '測試連線'}
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

                    {remotePreviewUrl ? (
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                        <div className="flex items-center gap-2 text-xs font-medium text-emerald-100">
                          <CheckCircle2 size={14} />
                          已產生共享預覽圖
                        </div>
                        <p className="mt-2 text-xs text-emerald-100/80">確認預覽沒問題後，再套用到目前這張職業卡。</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={() => void applyRemotePreview()} disabled={applyingRemotePreview} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
                            {applyingRemotePreview ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            {applyingRemotePreview ? '套用中...' : '套用到職業'}
                          </button>
                          <button type="button" onClick={() => clearRemotePreview(true)} disabled={applyingRemotePreview} className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-xs text-slate-100 hover:bg-slate-600 disabled:opacity-50">
                            <X size={14} />
                            捨棄預覽
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-white">職業效果</h3>
              <button type="button" onClick={() => setEffects(previous => [...previous, defaultEffect()])} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600">
                <Plus size={16} className="mr-1 inline" />
                新增效果
              </button>
            </div>

            <div className="space-y-4">
              {effects.map((effect, index) => (
                <div key={`${effect.effect_type}-${index}`} className="rounded-2xl border border-slate-700 bg-slate-800 p-4">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <label className="space-y-2">
                      <span className="text-xs text-slate-400">效果類型</span>
                      <select value={effect.effect_type} onChange={event => updateEffect(index, 'effect_type', event.target.value as ProfessionEffectType)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white">
                        {Object.entries(EFFECT_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs text-slate-400">基礎值</span>
                      <input type="number" step="0.01" value={effect.base_value} onChange={event => updateEffect(index, 'base_value', Number(event.target.value))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white" />
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs text-slate-400">每 10 等增加</span>
                      <input type="number" step="0.01" value={effect.per_level_value} onChange={event => updateEffect(index, 'per_level_value', Number(event.target.value))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white" />
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs text-slate-400">預覽上限</span>
                      <input type="number" step="0.01" value={effect.max_preview_value} onChange={event => updateEffect(index, 'max_preview_value', Number(event.target.value))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white" />
                    </label>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-slate-900/70 px-3 py-2 text-sm text-slate-300">
                    <span>{EFFECT_LABELS[effect.effect_type]}</span>
                    <span className="font-semibold text-emerald-300">
                      基礎 {formatEffectValue(effect.effect_type, effect.base_value)} / 每 10 等 {formatEffectValue(effect.effect_type, effect.per_level_value)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {warnings.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                <div className="mb-2 flex items-center gap-2 font-semibold">
                  <Wand2 size={16} />
                  平衡提醒
                </div>
                <ul className="space-y-1">
                  {warnings.map(warning => (
                    <li key={warning}>- {warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={saving} className="rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
              <Save size={18} className="mr-2 inline" />
              {saving ? '儲存中...' : editingId ? '更新職業' : '建立職業'}
            </button>

            <button type="button" onClick={() => void generateProfessionImage()} disabled={saving || generatingImage || !form.name.trim() || !form.code.trim() || !(aiSource === 'cloud' ? canUseAiImage : canUseRemoteAi)} className="rounded-xl bg-fuchsia-600 px-5 py-3 font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50">
              {generatingImage ? <Sparkles size={18} className="mr-2 inline animate-pulse" /> : <Wand2 size={18} className="mr-2 inline" />}
              {generatingImage ? 'AI 生圖中...' : aiSource === 'remote_comfyui' ? '產生預覽' : editingId ? '更新並生成職業圖' : '建立並生成職業圖'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">加成預覽</h2>
            <p className="mt-1 text-sm text-slate-400">查看目前編輯中的職業在不同等級時，會帶來哪些角色加成。</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {PREVIEW_LEVEL_OPTIONS.map(level => (
              <button
                key={level}
                type="button"
                onClick={() => setPreviewLevel(level)}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  previewLevel === level ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Lv.{level}
              </button>
            ))}
          </div>
        </div>

        {!editingId ? (
          <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
            先儲存或選擇一個現有職業，才能使用角色加成預覽。
          </div>
        ) : previewLoading ? (
          <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
            正在載入 Lv.{previewLevel} 的加成預覽...
          </div>
        ) : previewBonuses ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {Object.entries(previewBonuses.summary).map(([effectType, value]) => (
                <div key={effectType} className="rounded-xl bg-slate-900/60 px-4 py-3">
                  <p className="text-sm text-slate-400">{EFFECT_LABELS[effectType as ProfessionEffectType] ?? effectType}</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-300">
                    {formatEffectValue(effectType as ProfessionEffectType, Number(value ?? 0))}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
              <h3 className="font-semibold text-white">加成明細</h3>
              {previewBonuses.entries.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">目前沒有可預覽的加成項目。</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {previewBonuses.entries.map((entry, index) => (
                    <div key={`${entry.source_name}-${entry.effect_type}-${index}`} className="flex items-center justify-between rounded-xl bg-slate-800 px-3 py-2 text-sm">
                      <div>
                        <p className="text-slate-100">{entry.source_name}</p>
                        <p className="text-xs text-slate-500">{EFFECT_LABELS[entry.effect_type] ?? entry.effect_type}</p>
                      </div>
                      <span className="font-semibold text-emerald-300">{formatEffectValue(entry.effect_type, Number(entry.value))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-indigo-300" />
          <h2 className="text-lg font-semibold text-white">職業列表</h2>
        </div>

        <div className="grid gap-4">
          {professions.map(profession => (
            <div key={profession.id} className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex gap-4">
                  <div className="h-24 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-slate-900">
                    {profession.icon_url ? (
                      <img src={profession.icon_url} alt={profession.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center px-2 text-center text-xs text-slate-500">無圖片</div>
                    )}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">{profession.name}</h3>
                      <span className="rounded-full px-2.5 py-1 text-xs font-medium text-white" style={{ backgroundColor: profession.theme_color }}>
                        {getTierLabel(profession.unlock_tier)}
                      </span>
                      {profession.is_system ? <span className="rounded-full bg-slate-700 px-2.5 py-1 text-xs text-slate-200">系統預設</span> : null}
                      <span className={`rounded-full px-2.5 py-1 text-xs ${profession.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>
                        {profession.is_active ? '啟用中' : '已停用'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">{profession.description || '尚未填寫職業說明。'}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => beginEdit(profession)} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500">
                    <SwitchCamera size={16} className="mr-1 inline" />
                    編輯
                  </button>
                  <button type="button" onClick={() => void toggleActive(profession)} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600">
                    {profession.is_active ? '停用' : '啟用'}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {(profession.profession_effects ?? []).map(effect => (
                  <div key={effect.id} className="rounded-xl bg-slate-900/60 px-4 py-3">
                    <p className="text-sm text-slate-300">{EFFECT_LABELS[effect.effect_type]}</p>
                    <p className="mt-1 text-lg font-semibold text-emerald-300">{formatEffectValue(effect.effect_type, effect.base_value)}</p>
                    <p className="mt-1 text-xs text-slate-500">每 10 等增加 {formatEffectValue(effect.effect_type, effect.per_level_value)}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
