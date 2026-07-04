import { useEffect, useMemo, useState } from 'react'
import { Gift, ImagePlus, KeyRound, Plus, RefreshCw, Save, ShoppingBag, Sparkles, Upload, Wand2, X } from 'lucide-react'
import { formatDiagnosticsText, invokeAiImageFunction, type AiDiagnostics, type AiImageStatus } from '../lib/aiImage'
import { uploadImageFile } from '../lib/imageUpload'
import { supabase } from '../lib/supabase'
import { EFFECT_LABELS, SLOT_LABELS, STYLE_OPTIONS, formatEffectValue, formatEquipmentRarity, getBalanceWarnings } from '../lib/character'
import { useAuthStore } from '../stores/authStore'
import type { EquipmentEffect, EquipmentSlotType, EquipmentSourceType, EquipmentTemplate, ProfessionEffectType, Profile, Rarity } from '../types'

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
  const [aiProvider, setAiProvider] = useState<(typeof AI_PROVIDER_OPTIONS)[number]['value']>('gemini')
  const [teacherApiKey, setTeacherApiKey] = useState('')

  const warnings = useMemo(
    () => getBalanceWarnings(effects.length, effects.map(effect => effect.effect_type)),
    [effects]
  )
  const hasTeacherApiKey = teacherApiKey.trim().length > 0
  const canUseAiImage = aiImageStatus?.ready !== false || hasTeacherApiKey

  useEffect(() => {
    void Promise.all([loadEquipments(), loadGrantTargets()])
    void loadAiImageStatus()
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

  const loadAiImageStatus = async () => {
    setCheckingAiStatus(true)

    try {
      const result = await invokeAiImageFunction({
        action: 'status',
        aiProvider,
        apiKey: teacherApiKey.trim() || undefined,
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

  const resetForm = () => {
    setEditingId(null)
    setEquipmentForm(emptyEquipmentForm)
    setEffects([defaultEffect()])
  }

  const beginEdit = (equipment: EquipmentWithEffects) => {
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

      const result = await invokeAiImageFunction({
        targetType: 'equipment',
        targetId: nextEquipment.id,
        imagePrompt: equipmentForm.image_prompt.trim(),
        imageStyle: equipmentForm.image_style,
        aiProvider,
        apiKey: teacherApiKey.trim() || undefined,
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
                {equipmentForm.image_url ? (
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
                <p>AI 會依照裝備名稱、稀有度、部位與提示詞補充來生成裝備圖片。</p>
                <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <KeyRound size={16} className="text-fuchsia-300" />
                    教師自備 API key
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[0.7fr_1.3fr]">
                    <label className="space-y-1">
                      <span className="text-xs text-slate-400">供應商</span>
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
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={aiImageStatus?.ready ? 'text-emerald-200' : 'text-amber-200'}>
                      {aiImageStatus?.ready
                        ? `目前使用 ${aiImageStatus.provider_label}：${aiImageStatus.model}${aiImageStatus.key_source === 'teacher' ? '（教師自備 key）' : '（系統 Secret）'}`
                        : `尚未完成 AI 圖片設定：${aiImageStatus?.missing_secret ?? '請檢查設定'}`}
                    </p>
                  </div>
                  <button type="button" onClick={() => void loadAiImageStatus()} disabled={checkingAiStatus} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-600 disabled:opacity-50">
                    <RefreshCw size={14} className={checkingAiStatus ? 'animate-spin' : ''} />
                    檢查
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

            <button type="button" onClick={() => void generateEquipmentImage()} disabled={saving || generatingImage || !equipmentForm.name.trim() || !canUseAiImage} className="rounded-xl bg-fuchsia-600 px-5 py-3 font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50">
              {generatingImage ? <Sparkles size={18} className="mr-2 inline animate-pulse" /> : <Wand2 size={18} className="mr-2 inline" />}
              {generatingImage ? 'AI 生圖中...' : editingId ? '更新並生成裝備圖' : '建立並生成裝備圖'}
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
