import { useEffect, useMemo, useState } from 'react'
import { ImagePlus, KeyRound, Plus, RefreshCw, Save, Sparkles, SwitchCamera, Wand2, X } from 'lucide-react'
import {
  DEFAULT_HUGGING_FACE_AUTHOR,
  DEFAULT_HUGGING_FACE_MODEL_NAME,
  buildHuggingFaceModelPath,
  formatDiagnosticsText,
  invokeAiImageFunction,
  type AiDiagnostics,
  type AiImageStatus,
} from '../lib/aiImage'
import { supabase } from '../lib/supabase'
import { EFFECT_LABELS, STYLE_OPTIONS, formatEffectValue, getBalanceWarnings, getTierLabel } from '../lib/character'
import { useAuthStore } from '../stores/authStore'
import type { BonusEntry, ProfessionEffect, ProfessionEffectType, ProfessionTemplate } from '../types'

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
  const [aiProvider, setAiProvider] = useState<(typeof AI_PROVIDER_OPTIONS)[number]['value']>('gemini')
  const [teacherApiKey, setTeacherApiKey] = useState('')
  const [huggingFaceAuthor, setHuggingFaceAuthor] = useState(DEFAULT_HUGGING_FACE_AUTHOR)
  const [huggingFaceModelName, setHuggingFaceModelName] = useState(DEFAULT_HUGGING_FACE_MODEL_NAME)
  const [previewLevel, setPreviewLevel] = useState<number>(10)
  const [previewBonuses, setPreviewBonuses] = useState<PreviewBonusesPayload | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const warnings = useMemo(
    () => getBalanceWarnings(effects.length, effects.map(effect => effect.effect_type)),
    [effects]
  )
  const hasTeacherApiKey = teacherApiKey.trim().length > 0
  const canUseAiImage = aiImageStatus?.ready !== false || hasTeacherApiKey
  const huggingFaceModel = buildHuggingFaceModelPath(huggingFaceAuthor, huggingFaceModelName)

  useEffect(() => {
    void loadProfessions()
    void loadAiImageStatus()
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
    setEditingId(null)
    setForm(emptyForm)
    setEffects([defaultEffect()])
  }

  const beginEdit = (profession: ProfessionWithEffects) => {
    setEditingId(profession.id)
    setForm({
      name: profession.name,
      code: profession.code,
      description: profession.description ?? '',
      theme_color: profession.theme_color,
      icon_url: profession.icon_url ?? '',
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

  const generateProfessionImage = async () => {
    setGeneratingImage(true)
    setMessage(null)
    setError(null)
    setAiDiagnostics(null)

    try {
      const nextProfession = await saveProfessionRecord()
      setEditingId(nextProfession.id)

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
                {form.icon_url ? (
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
                <p>AI 會依照職業名稱、解鎖梯次、主色與提示詞補充來生成職業形象圖。</p>
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

            <button type="button" onClick={() => void generateProfessionImage()} disabled={saving || generatingImage || !form.name.trim() || !form.code.trim() || !canUseAiImage} className="rounded-xl bg-fuchsia-600 px-5 py-3 font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50">
              {generatingImage ? <Sparkles size={18} className="mr-2 inline animate-pulse" /> : <Wand2 size={18} className="mr-2 inline" />}
              {generatingImage ? 'AI 生圖中...' : editingId ? '更新並生成職業圖' : '建立並生成職業圖'}
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
