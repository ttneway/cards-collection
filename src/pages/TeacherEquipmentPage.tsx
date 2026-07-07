import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Gift, ImagePlus, KeyRound, Plus, RefreshCw, Save, Server, ShoppingBag, Sparkles, Upload, Wand2, X } from 'lucide-react'
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
import { EFFECT_LABELS, SLOT_LABELS, STYLE_OPTIONS, formatEffectValue, formatEquipmentRarity, getBalanceWarnings } from '../lib/character'
import { useAuthStore } from '../stores/authStore'
import type { EquipmentEffect, EquipmentSlotType, EquipmentSourceType, EquipmentTemplate, ProfessionEffectType, Profile, Rarity, RemoteAiSettings } from '../types'

type EquipmentWithEffects = EquipmentTemplate & { equipment_effects?: EquipmentEffect[] }

type EffectForm = {
  effect_type: ProfessionEffectType
  base_value: number
  description: string
}

type EquipmentForm = {
  name: string
  slot_type: EquipmentSlotType
  rarity: Rarity
  description: string
  image_url: string
  image_prompt: string
  image_style: string
  source_type: EquipmentSourceType
  shop_cost: string
  is_active: boolean
}

type GrantTarget = Pick<Profile, 'id' | 'name' | 'role' | 'class_id'>

const AI_PROVIDER_OPTIONS = [
  { value: 'gemini', label: 'Gemini' },
  { value: 'openai', label: 'OpenAI / ChatGPT' },
  { value: 'huggingface', label: 'Hugging Face' },
] as const

const AI_SOURCE_OPTIONS = [
  { value: 'cloud', label: '雲端 AI' },
  { value: 'remote_comfyui', label: '共享 ComfyUI 主機' },
] as const

const emptyEquipmentForm: EquipmentForm = {
  name: '',
  slot_type: 'headwear',
  rarity: 'N',
  description: '',
  image_url: '',
  image_prompt: '',
  image_style: STYLE_OPTIONS[0],
  source_type: 'teacher',
  shop_cost: '',
  is_active: true,
}

const defaultEffect = (): EffectForm => ({
  effect_type: 'task_points_percent',
  base_value: 1,
  description: '',
})

export default function TeacherEquipmentPage() {
  const { user } = useAuthStore()
  const [equipments, setEquipments] = useState<EquipmentWithEffects[]>([])
  const [students, setStudents] = useState<GrantTarget[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [equipmentForm, setEquipmentForm] = useState<EquipmentForm>(emptyEquipmentForm)
  const [effects, setEffects] = useState<EffectForm[]>([defaultEffect()])
  const [grantUserId, setGrantUserId] = useState('')
  const [grantEquipmentId, setGrantEquipmentId] = useState('')
  const [grantQuantity, setGrantQuantity] = useState(1)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [granting, setGranting] = useState(false)
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
  const [remotePreviewUrl, setRemotePreviewUrl] = useState<string | null>(null)
  const [remotePreviewBase64, setRemotePreviewBase64] = useState<string | null>(null)
  const [remotePreviewMimeType, setRemotePreviewMimeType] = useState<string | null>(null)
  const [remotePreviewEquipmentId, setRemotePreviewEquipmentId] = useState<string | null>(null)
  const [remotePreviewPrompt, setRemotePreviewPrompt] = useState<string>('')
  const [remotePreviewStyle, setRemotePreviewStyle] = useState<string>(STYLE_OPTIONS[0])
  const [applyingRemotePreview, setApplyingRemotePreview] = useState(false)

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
    void Promise.all([loadEquipments(), loadGrantTargets()])
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

  const loadEquipments = async () => {
    const { data, error } = await supabase
      .from('equipment_templates')
      .select('*, equipment_effects(*)')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    setEquipments((data ?? []) as EquipmentWithEffects[])
  }

  const loadGrantTargets = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, role, class_id')
      .in('role', ['student', 'leader'])
      .order('name', { ascending: true })

    if (error) {
      setError(error.message)
      return
    }

    setStudents((data ?? []) as GrantTarget[])
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
    setRemotePreviewEquipmentId(null)
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

  const resetForm = () => {
    clearRemotePreview(true)
    setEditingId(null)
    setEquipmentForm(emptyEquipmentForm)
    setEffects([defaultEffect()])
  }

  const beginEdit = (equipment: EquipmentWithEffects) => {
    if (remotePreviewEquipmentId && remotePreviewEquipmentId !== equipment.id) {
      clearRemotePreview(true)
    }
    setEditingId(equipment.id)
    setEquipmentForm({
      name: equipment.name,
      slot_type: equipment.slot_type,
      rarity: equipment.rarity,
      description: equipment.description ?? '',
      image_url: equipment.image_url ?? '',
      image_prompt: equipment.image_prompt ?? '',
      image_style: equipment.image_style ?? STYLE_OPTIONS[0],
      source_type: equipment.source_type,
      shop_cost: equipment.shop_cost?.toString() ?? '',
      is_active: equipment.is_active,
    })
    setEffects(
      (equipment.equipment_effects ?? []).map(effect => ({
        effect_type: effect.effect_type,
        base_value: effect.base_value,
        description: effect.description ?? '',
      }))
    )
    setMessage(`正在編輯裝備「${equipment.name}」。`)
    setError(null)
  }

  const handleEquipmentImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    setUploadingImage(true)
    setMessage(null)
    setError(null)

    try {
      const result = await uploadImageFile(file, 'equipment')
      setEquipmentForm(previous => ({ ...previous, image_url: result.publicUrl }))
      setMessage('圖片上傳成功，已帶入裝備圖片網址。')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '圖片上傳失敗。')
    } finally {
      setUploadingImage(false)
    }
  }

  const saveEquipmentRecord = async () => {
    if (!user) throw new Error('需要先登入。')

    const payload = {
      name: equipmentForm.name.trim(),
      slot_type: equipmentForm.slot_type,
      rarity: equipmentForm.rarity,
      description: equipmentForm.description.trim(),
      image_url: equipmentForm.image_url.trim() || null,
      image_prompt: equipmentForm.image_prompt.trim() || null,
      image_style: equipmentForm.image_style.trim() || null,
      source_type: equipmentForm.source_type,
      shop_cost: equipmentForm.shop_cost.trim() === '' ? null : Number(equipmentForm.shop_cost),
      is_active: equipmentForm.is_active,
      created_by: user.id,
    }

    let equipmentId = editingId

    if (!editingId) {
      const { data, error } = await supabase.from('equipment_templates').insert(payload).select('*').single()
      if (error) throw error
      equipmentId = data.id
    } else {
      const { error } = await supabase.from('equipment_templates').update(payload).eq('id', editingId)
      if (error) throw error

      const { error: deleteError } = await supabase.from('equipment_effects').delete().eq('equipment_id', editingId)
      if (deleteError) throw deleteError
    }

    const rows = effects.map(effect => ({
      equipment_id: equipmentId,
      effect_type: effect.effect_type,
      base_value: Number(effect.base_value),
      description: effect.description.trim(),
    }))

    if (rows.length > 0) {
      const { error } = await supabase.from('equipment_effects').insert(rows)
      if (error) throw error
    }

    const { data: latest, error: latestError } = await supabase
      .from('equipment_templates')
      .select('*, equipment_effects(*)')
      .eq('id', equipmentId)
      .single()

    if (latestError) throw latestError

    return latest as EquipmentWithEffects
  }

  const saveEquipment = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    setError(null)

    try {
      const nextEquipment = await saveEquipmentRecord()
      setMessage(editingId ? `已更新裝備「${nextEquipment.name}」。` : `已建立裝備「${nextEquipment.name}」。`)
      resetForm()
      await loadEquipments()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '裝備儲存失敗。')
    } finally {
      setSaving(false)
    }
  }

  const generateEquipmentImage = async () => {
    setGeneratingImage(true)
    setMessage(null)
    setError(null)
    setAiDiagnostics(null)

    try {
      const nextEquipment = await saveEquipmentRecord()
      setEditingId(nextEquipment.id)
      setEquipmentForm({
        name: nextEquipment.name,
        slot_type: nextEquipment.slot_type,
        rarity: nextEquipment.rarity,
        description: nextEquipment.description ?? '',
        image_url: nextEquipment.image_url ?? '',
        image_prompt: nextEquipment.image_prompt ?? '',
        image_style: nextEquipment.image_style ?? STYLE_OPTIONS[0],
        source_type: nextEquipment.source_type,
        shop_cost: nextEquipment.shop_cost?.toString() ?? '',
        is_active: nextEquipment.is_active,
      })

      if (aiSource === 'remote_comfyui') {
        const preview = await generateRemoteImagePreview({
          targetType: 'equipment',
          targetId: nextEquipment.id,
          imagePrompt: equipmentForm.image_prompt.trim(),
          imageStyle: equipmentForm.image_style,
        })

        clearRemotePreview(true)
        setRemotePreviewUrl(`data:${preview.mime_type};base64,${preview.preview_image_base64}`)
        setRemotePreviewBase64(preview.preview_image_base64)
        setRemotePreviewMimeType(preview.mime_type)
        setRemotePreviewEquipmentId(nextEquipment.id)
        setRemotePreviewPrompt(equipmentForm.image_prompt.trim())
        setRemotePreviewStyle(equipmentForm.image_style)
        setMessage('共享 ComfyUI 主機已產生裝備預覽圖，確認後即可套用。')
        return
      }

      const result = await invokeAiImageFunction({
        targetType: 'equipment',
        targetId: nextEquipment.id,
        imagePrompt: equipmentForm.image_prompt.trim(),
        imageStyle: equipmentForm.image_style,
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

      const updatedEquipment = data?.equipment as EquipmentWithEffects | undefined
      if (updatedEquipment) {
        beginEdit(updatedEquipment)
      }

      await loadEquipments()
      await loadAiImageStatus()
      setMessage(data?.message ?? 'AI 裝備圖片已生成完成。')
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'AI 生圖失敗。')
    } finally {
      setGeneratingImage(false)
    }
  }

  const applyRemotePreview = async () => {
    if (!remotePreviewUrl || !remotePreviewBase64 || !remotePreviewMimeType || !remotePreviewEquipmentId) {
      setError('目前沒有可套用的裝備預覽圖。')
      return
    }

    setApplyingRemotePreview(true)
    setMessage(null)
    setError(null)

    try {
      const binary = atob(remotePreviewBase64)
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
      const blob = new Blob([bytes], { type: remotePreviewMimeType })
      const targetEquipment = equipments.find(equipment => equipment.id === remotePreviewEquipmentId)
      const uploadResult = await uploadGeneratedImageBlob(blob, 'equipment', (targetEquipment?.name ?? equipmentForm.name ?? 'equipment-preview').trim())

      const { data, error: updateError } = await supabase
        .from('equipment_templates')
        .update({
          image_url: uploadResult.publicUrl,
          image_prompt: remotePreviewPrompt || null,
          image_style: remotePreviewStyle,
        })
        .eq('id', remotePreviewEquipmentId)
        .select('*, equipment_effects(*)')
        .single()

      if (updateError) {
        throw updateError
      }

      await loadEquipments()
      if (editingId === remotePreviewEquipmentId) {
        beginEdit(data as EquipmentWithEffects)
      }
      clearRemotePreview(true)
      setMessage('已套用共享 ComfyUI 裝備預覽圖。')
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : '套用裝備預覽圖失敗。')
    } finally {
      setApplyingRemotePreview(false)
    }
  }

  const grantEquipment = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!grantUserId || !grantEquipmentId) {
      setError('請先選擇要發放的學生與裝備。')
      return
    }

    setGranting(true)
    setError(null)
    setMessage(null)

    const { data, error } = await supabase.rpc('grant_equipment_to_user', {
      p_user_id: grantUserId,
      p_equipment_id: grantEquipmentId,
      p_quantity: grantQuantity,
      p_is_bound: false,
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage(data?.message ?? '裝備已發放完成。')
      setGrantQuantity(1)
    }

    setGranting(false)
  }

  const toggleActive = async (equipment: EquipmentWithEffects) => {
    setMessage(null)
    setError(null)

    const { error } = await supabase
      .from('equipment_templates')
      .update({ is_active: !equipment.is_active })
      .eq('id', equipment.id)

    if (error) {
      setError(error.message)
      return
    }

    setMessage(equipment.is_active ? `已停用裝備「${equipment.name}」。` : `已啟用裝備「${equipment.name}」。`)
    await loadEquipments()
  }

  const updateEffect = (index: number, key: keyof EffectForm, value: string | number) => {
    setEffects(previous => previous.map((effect, effectIndex) => (effectIndex === index ? { ...effect, [key]: value } : effect)))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">裝備管理</h1>
        <p className="mt-1 text-sm text-slate-400">建立裝備、設定效果。現在也能直接上傳照片，或用 AI 生成裝備圖片。</p>
      </div>

      {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">{editingId ? '編輯裝備' : '建立裝備'}</h2>
            <p className="mt-1 text-sm text-slate-400">裝備圖片可以貼網址、上傳照片，也可以讓 AI 直接生成。</p>
          </div>
          {editingId ? (
            <button type="button" onClick={resetForm} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600">
              <X size={16} className="mr-1 inline" />
              建立新裝備
            </button>
          ) : null}
        </div>

        <form onSubmit={saveEquipment} className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-300">裝備名稱</span>
                <input value={equipmentForm.name} onChange={event => setEquipmentForm(previous => ({ ...previous, name: event.target.value }))} required className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">裝備部位</span>
                <select value={equipmentForm.slot_type} onChange={event => setEquipmentForm(previous => ({ ...previous, slot_type: event.target.value as EquipmentSlotType }))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white">
                  {Object.entries(SLOT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">稀有度</span>
                <select value={equipmentForm.rarity} onChange={event => setEquipmentForm(previous => ({ ...previous, rarity: event.target.value as Rarity }))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white">
                  {(['N', 'R', 'SR', 'SSR', 'UR'] as Rarity[]).map(rarity => (
                    <option key={rarity} value={rarity}>
                      {formatEquipmentRarity(rarity)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">來源類型</span>
                <select value={equipmentForm.source_type} onChange={event => setEquipmentForm(previous => ({ ...previous, source_type: event.target.value as EquipmentSourceType }))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white">
                  <option value="teacher">教師發放</option>
                  <option value="task">任務獎勵</option>
                  <option value="achievement">成就獎勵</option>
                  <option value="shop">商店購買</option>
                  <option value="mixed">混合來源</option>
                </select>
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-slate-300">說明</span>
                <textarea value={equipmentForm.description} onChange={event => setEquipmentForm(previous => ({ ...previous, description: event.target.value }))} rows={3} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">圖片網址</span>
                <input value={equipmentForm.image_url} onChange={event => setEquipmentForm(previous => ({ ...previous, image_url: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
              </label>

              <div className="space-y-2">
                <span className="text-sm text-slate-300">上傳照片</span>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-200 hover:border-indigo-400 hover:text-white">
                  <Upload size={16} />
                  {uploadingImage ? '上傳中...' : '選擇裝備圖片'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void handleEquipmentImageUpload(event)} disabled={uploadingImage} className="hidden" />
                </label>
                <p className="text-xs text-slate-500">支援 PNG、JPG、WEBP，大小上限 5 MB。</p>
              </div>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">AI 風格模板</span>
                <select value={equipmentForm.image_style} onChange={event => setEquipmentForm(previous => ({ ...previous, image_style: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white">
                  {STYLE_OPTIONS.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-slate-300">AI 提示詞補充</span>
                <textarea value={equipmentForm.image_prompt} onChange={event => setEquipmentForm(previous => ({ ...previous, image_prompt: event.target.value }))} rows={2} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">商店價格</span>
                <input type="number" min="0" value={equipmentForm.shop_cost} onChange={event => setEquipmentForm(previous => ({ ...previous, shop_cost: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
              </label>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm text-slate-300">
                <ImagePlus size={16} className="text-indigo-300" />
                裝備預覽
              </div>

              <div className="aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-lg">
                {remotePreviewUrl ? (
                  <img src={remotePreviewUrl} alt={equipmentForm.name || '????'} className="h-full w-full object-cover" />
                ) : equipmentForm.image_url ? (
                  <img src={equipmentForm.image_url} alt={equipmentForm.name || '裝備預覽'} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full flex-col justify-between bg-black/10 p-4 text-white">
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-full bg-black/20 px-2 py-1 text-xs">{formatEquipmentRarity(equipmentForm.rarity)}</span>
                      <span className="rounded-full bg-black/20 px-2 py-1 text-xs">{SLOT_LABELS[equipmentForm.slot_type]}</span>
                    </div>
                    <div>
                      <p className="text-xl font-bold">{equipmentForm.name || '尚未命名裝備'}</p>
                      <p className="mt-1 text-sm text-white/80">{equipmentForm.description || '可上傳照片、貼圖片網址，或使用 AI 生圖。'}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-2 rounded-xl border border-slate-700 bg-slate-800/70 p-3 text-sm text-slate-300">
                <p>AI 會自動參考裝備名稱、稀有度、部位與你的補充提示詞來生成裝備圖片。</p>
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
                        <p className="mt-2 text-xs text-emerald-100/80">確認預覽沒問題後，再套用到目前這張裝備卡。</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={() => void applyRemotePreview()} disabled={applyingRemotePreview} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
                            {applyingRemotePreview ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            {applyingRemotePreview ? '套用中...' : '套用到裝備'}
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
              {equipmentForm.image_url ? (
                <button type="button" onClick={() => setEquipmentForm(previous => ({ ...previous, image_url: '' }))} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600">
                  <X size={16} />
                  清除圖片
                </button>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-white">裝備效果</h3>
              <button type="button" onClick={() => setEffects(previous => [...previous, defaultEffect()])} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600">
                <Plus size={16} className="mr-1 inline" />
                新增效果
              </button>
            </div>

            <div className="space-y-4">
              {effects.map((effect, index) => (
                <div key={`${effect.effect_type}-${index}`} className="rounded-2xl border border-slate-700 bg-slate-800 p-4">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                      <span className="text-xs text-slate-400">數值</span>
                      <input type="number" step="0.01" value={effect.base_value} onChange={event => updateEffect(index, 'base_value', Number(event.target.value))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white" />
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs text-slate-400">說明</span>
                      <input value={effect.description} onChange={event => updateEffect(index, 'description', event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white" />
                    </label>
                  </div>

                  <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-900/70 px-3 py-2 text-sm text-slate-300">
                    <span>{EFFECT_LABELS[effect.effect_type]}</span>
                    <span className="font-semibold text-emerald-300">{formatEffectValue(effect.effect_type, effect.base_value)}</span>
                  </div>
                </div>
              ))}
            </div>

            {warnings.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                {warnings.map(warning => (
                  <div key={warning}>- {warning}</div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={saving} className="rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
              <Save size={18} className="mr-2 inline" />
              {saving ? '儲存中...' : editingId ? '更新裝備' : '建立裝備'}
            </button>

            <button type="button" onClick={() => void generateEquipmentImage()} disabled={saving || generatingImage || !equipmentForm.name.trim() || !(aiSource === 'cloud' ? canUseAiImage : canUseRemoteAi)} className="rounded-xl bg-fuchsia-600 px-5 py-3 font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50">
              {generatingImage ? <Sparkles size={18} className="mr-2 inline animate-pulse" /> : <Wand2 size={18} className="mr-2 inline" />}
              {generatingImage ? 'AI 生圖中...' : aiSource === 'remote_comfyui' ? '產生預覽' : editingId ? '更新並生成裝備圖' : '建立並生成裝備圖'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Gift size={18} className="text-emerald-300" />
          <h2 className="text-lg font-semibold text-white">裝備發放</h2>
        </div>

        <form onSubmit={grantEquipment} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-2">
            <span className="text-sm text-slate-300">學生 / 幹部</span>
            <select value={grantUserId} onChange={event => setGrantUserId(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white">
              <option value="">請選擇對象</option>
              {students.map(student => (
                <option key={student.id} value={student.id}>
                  {student.name}（{student.role}）
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm text-slate-300">裝備</span>
            <select value={grantEquipmentId} onChange={event => setGrantEquipmentId(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white">
              <option value="">請選擇裝備</option>
              {equipments.filter(item => item.is_active).map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}（{SLOT_LABELS[item.slot_type]}）
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm text-slate-300">數量</span>
            <input type="number" min="1" value={grantQuantity} onChange={event => setGrantQuantity(Number(event.target.value))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
          </label>

          <div className="flex items-end">
            <button type="submit" disabled={granting} className="w-full rounded-xl bg-emerald-600 px-5 py-3 font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
              {granting ? '發放中...' : '發放裝備'}
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ShoppingBag size={18} className="text-amber-300" />
          <h2 className="text-lg font-semibold text-white">裝備列表</h2>
        </div>

        <div className="grid gap-4">
          {equipments.map(equipment => (
            <div key={equipment.id} className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex gap-4">
                  <div className="h-24 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-slate-900">
                    {equipment.image_url ? (
                      <img src={equipment.image_url} alt={equipment.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center px-2 text-center text-xs text-slate-500">無圖片</div>
                    )}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">{equipment.name}</h3>
                      <span className="rounded-full bg-slate-700 px-2.5 py-1 text-xs text-slate-200">{SLOT_LABELS[equipment.slot_type]}</span>
                      <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-xs text-amber-300">{formatEquipmentRarity(equipment.rarity)}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs ${equipment.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>
                        {equipment.is_active ? '啟用中' : '已停用'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">{equipment.description || '尚未填寫裝備說明。'}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      來源：{equipment.source_type}
                      {equipment.shop_cost !== null ? ` | 商店價格 ${equipment.shop_cost}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button type="button" onClick={() => beginEdit(equipment)} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500">編輯</button>
                  <button type="button" onClick={() => void toggleActive(equipment)} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600">
                    {equipment.is_active ? '停用' : '啟用'}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {(equipment.equipment_effects ?? []).map(effect => (
                  <div key={effect.id} className="rounded-xl bg-slate-900/60 px-4 py-3">
                    <p className="text-sm text-slate-300">{EFFECT_LABELS[effect.effect_type]}</p>
                    <p className="mt-1 text-lg font-semibold text-emerald-300">{formatEffectValue(effect.effect_type, effect.base_value)}</p>
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
