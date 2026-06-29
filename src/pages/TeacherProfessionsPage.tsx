import { useEffect, useMemo, useState } from 'react'
import { Plus, Save, Sparkles, SwitchCamera, Wand2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { EFFECT_LABELS, STYLE_OPTIONS, formatEffectValue, getBalanceWarnings, getTierLabel } from '../lib/character'
import { useAuthStore } from '../stores/authStore'
import type { ProfessionEffect, ProfessionEffectType, ProfessionTemplate } from '../types'

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

  const warnings = useMemo(
    () => getBalanceWarnings(effects.length, effects.map(effect => effect.effect_type)),
    [effects],
  )

  useEffect(() => {
    void loadProfessions()
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
      })),
    )
    setMessage(`正在編輯職業「${profession.name}」`)
    setError(null)
  }

  const saveProfession = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) return

    setSaving(true)
    setMessage(null)
    setError(null)

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
      if (error) {
        setError(error.message)
        setSaving(false)
        return
      }

      professionId = data.id
    } else {
      const { error } = await supabase.from('profession_templates').update(payload).eq('id', editingId)
      if (error) {
        setError(error.message)
        setSaving(false)
        return
      }

      const { error: deleteError } = await supabase.from('profession_effects').delete().eq('profession_id', editingId)
      if (deleteError) {
        setError(deleteError.message)
        setSaving(false)
        return
      }
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
      if (error) {
        setError(error.message)
        setSaving(false)
        return
      }
    }

    setMessage(editingId ? `已更新職業「${payload.name}」` : `已建立職業「${payload.name}」`)
    resetForm()
    await loadProfessions()
    setSaving(false)
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

    setMessage(profession.is_active ? `已停用「${profession.name}」` : `已啟用「${profession.name}」`)
    await loadProfessions()
  }

  const updateEffect = (index: number, key: keyof EffectForm, value: string | number) => {
    setEffects(previous =>
      previous.map((effect, effectIndex) =>
        effectIndex === index ? { ...effect, [key]: value } : effect,
      ),
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">職業管理</h1>
        <p className="mt-1 text-sm text-slate-400">
          建立職業模板、設定解鎖梯次，並定義被動能力。
        </p>
      </div>

      {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">{editingId ? '編輯職業' : '建立新職業'}</h2>
            <p className="mt-1 text-sm text-slate-400">第一版建議 1 到 2 個效果，數值先保守。</p>
          </div>
          {editingId ? (
            <button type="button" onClick={resetForm} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600">
              取消編輯
            </button>
          ) : null}
        </div>

        <form onSubmit={saveProfession} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-slate-300">職業名稱</span>
              <input value={form.name} onChange={event => setForm(previous => ({ ...previous, name: event.target.value }))} required className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-300">代號</span>
              <input value={form.code} onChange={event => setForm(previous => ({ ...previous, code: event.target.value }))} required className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-300">解鎖梯次</span>
              <select value={form.unlock_tier} onChange={event => setForm(previous => ({ ...previous, unlock_tier: Number(event.target.value) }))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white">
                <option value={1}>10 級職業池</option>
                <option value={2}>20 級職業池</option>
                <option value={3}>30 級以上職業池</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-300">主題色</span>
              <input type="color" value={form.theme_color} onChange={event => setForm(previous => ({ ...previous, theme_color: event.target.value }))} className="h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-2 py-2" />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm text-slate-300">描述</span>
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
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm text-slate-300">AI 提示詞草稿</span>
              <textarea value={form.image_prompt} onChange={event => setForm(previous => ({ ...previous, image_prompt: event.target.value }))} rows={2} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
            </label>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-white">能力效果</h3>
              <button
                type="button"
                onClick={() => setEffects(previous => [...previous, defaultEffect()])}
                className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
              >
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
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs text-slate-400">基礎值</span>
                      <input type="number" step="0.01" value={effect.base_value} onChange={event => updateEffect(index, 'base_value', Number(event.target.value))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white" />
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs text-slate-400">每 10 級成長</span>
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
                      起始 {formatEffectValue(effect.effect_type, effect.base_value)} / 每 10 級 {formatEffectValue(effect.effect_type, effect.per_level_value)}
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

          <button type="submit" disabled={saving} className="rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
            <Save size={18} className="mr-2 inline" />
            {saving ? '儲存中...' : editingId ? '更新職業' : '建立職業'}
          </button>
        </form>
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
                  <p className="mt-2 text-sm text-slate-400">{profession.description || '尚無描述'}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => beginEdit(profession)} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500">
                    <SwitchCamera size={16} className="mr-1 inline" />
                    編輯
                  </button>
                  <button type="button" onClick={() => toggleActive(profession)} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600">
                    {profession.is_active ? '停用' : '啟用'}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {(profession.profession_effects ?? []).map(effect => (
                  <div key={effect.id} className="rounded-xl bg-slate-900/60 px-4 py-3">
                    <p className="text-sm text-slate-300">{EFFECT_LABELS[effect.effect_type]}</p>
                    <p className="mt-1 text-lg font-semibold text-emerald-300">
                      {formatEffectValue(effect.effect_type, effect.base_value)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      每 10 級成長 {formatEffectValue(effect.effect_type, effect.per_level_value)}
                    </p>
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
