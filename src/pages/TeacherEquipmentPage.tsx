import { useEffect, useMemo, useState } from 'react'
import { Gift, Plus, Save, ShoppingBag } from 'lucide-react'
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

  const warnings = useMemo(
    () => getBalanceWarnings(effects.length, effects.map(effect => effect.effect_type)),
    [effects],
  )

  useEffect(() => {
    void Promise.all([loadEquipments(), loadGrantTargets()])
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
      })),
    )
    setMessage(`正在編輯裝備「${equipment.name}」`)
    setError(null)
  }

  const saveEquipment = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) return

    setSaving(true)
    setMessage(null)
    setError(null)

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
      if (error) {
        setError(error.message)
        setSaving(false)
        return
      }
      equipmentId = data.id
    } else {
      const { error } = await supabase.from('equipment_templates').update(payload).eq('id', editingId)
      if (error) {
        setError(error.message)
        setSaving(false)
        return
      }
      const { error: deleteError } = await supabase.from('equipment_effects').delete().eq('equipment_id', editingId)
      if (deleteError) {
        setError(deleteError.message)
        setSaving(false)
        return
      }
    }

    const rows = effects.map(effect => ({
      equipment_id: equipmentId,
      effect_type: effect.effect_type,
      base_value: Number(effect.base_value),
      description: effect.description.trim(),
    }))

    if (rows.length > 0) {
      const { error } = await supabase.from('equipment_effects').insert(rows)
      if (error) {
        setError(error.message)
        setSaving(false)
        return
      }
    }

    setMessage(editingId ? `已更新裝備「${payload.name}」` : `已建立裝備「${payload.name}」`)
    resetForm()
    await loadEquipments()
    setSaving(false)
  }

  const grantEquipment = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!grantUserId || !grantEquipmentId) {
      setError('請先選擇學生與裝備')
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
      setMessage(data?.message ?? '已發放裝備')
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

    setMessage(equipment.is_active ? `已停用「${equipment.name}」` : `已啟用「${equipment.name}」`)
    await loadEquipments()
  }

  const updateEffect = (index: number, key: keyof EffectForm, value: string | number) => {
    setEffects(previous =>
      previous.map((effect, effectIndex) => (effectIndex === index ? { ...effect, [key]: value } : effect)),
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">裝備管理</h1>
        <p className="mt-1 text-sm text-slate-400">
          建立裝備模板、設定能力與商店售價，也可以直接發放給學生。
        </p>
      </div>

      {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">{editingId ? '編輯裝備' : '建立新裝備'}</h2>
            <p className="mt-1 text-sm text-slate-400">第一版裝備建議 1 個主效果，稀有裝備可再加 1 個小效果。</p>
          </div>
          {editingId ? (
            <button type="button" onClick={resetForm} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600">
              取消編輯
            </button>
          ) : null}
        </div>

        <form onSubmit={saveEquipment} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-slate-300">裝備名稱</span>
              <input value={equipmentForm.name} onChange={event => setEquipmentForm(previous => ({ ...previous, name: event.target.value }))} required className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-300">裝備欄位</span>
              <select value={equipmentForm.slot_type} onChange={event => setEquipmentForm(previous => ({ ...previous, slot_type: event.target.value as EquipmentSlotType }))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white">
                {Object.entries(SLOT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-300">稀有度</span>
              <select value={equipmentForm.rarity} onChange={event => setEquipmentForm(previous => ({ ...previous, rarity: event.target.value as Rarity }))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white">
                {(['N', 'R', 'SR', 'SSR', 'UR'] as Rarity[]).map(rarity => (
                  <option key={rarity} value={rarity}>{formatEquipmentRarity(rarity)}</option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-300">來源類型</span>
              <select value={equipmentForm.source_type} onChange={event => setEquipmentForm(previous => ({ ...previous, source_type: event.target.value as EquipmentSourceType }))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white">
                <option value="teacher">教師發放</option>
                <option value="task">任務獎勵</option>
                <option value="achievement">成就獎勵</option>
                <option value="shop">商店販售</option>
                <option value="mixed">混合來源</option>
              </select>
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm text-slate-300">描述</span>
              <textarea value={equipmentForm.description} onChange={event => setEquipmentForm(previous => ({ ...previous, description: event.target.value }))} rows={3} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-300">圖片網址</span>
              <input value={equipmentForm.image_url} onChange={event => setEquipmentForm(previous => ({ ...previous, image_url: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-300">AI 風格模板</span>
              <select value={equipmentForm.image_style} onChange={event => setEquipmentForm(previous => ({ ...previous, image_style: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white">
                {STYLE_OPTIONS.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm text-slate-300">AI 提示詞草稿</span>
              <textarea value={equipmentForm.image_prompt} onChange={event => setEquipmentForm(previous => ({ ...previous, image_prompt: event.target.value }))} rows={2} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-300">商店售價（留空代表不上架）</span>
              <input type="number" min="0" value={equipmentForm.shop_cost} onChange={event => setEquipmentForm(previous => ({ ...previous, shop_cost: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white" />
            </label>
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
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs text-slate-400">效果數值</span>
                      <input type="number" step="0.01" value={effect.base_value} onChange={event => updateEffect(index, 'base_value', Number(event.target.value))} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white" />
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs text-slate-400">效果說明</span>
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

          <button type="submit" disabled={saving} className="rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
            <Save size={18} className="mr-2 inline" />
            {saving ? '儲存中...' : editingId ? '更新裝備' : '建立裝備'}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Gift size={18} className="text-emerald-300" />
          <h2 className="text-lg font-semibold text-white">角色發放</h2>
        </div>

        <form onSubmit={grantEquipment} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-2">
            <span className="text-sm text-slate-300">學生 / 幹部</span>
            <select value={grantUserId} onChange={event => setGrantUserId(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white">
              <option value="">請選擇帳號</option>
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
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-white">{equipment.name}</h3>
                    <span className="rounded-full bg-slate-700 px-2.5 py-1 text-xs text-slate-200">{SLOT_LABELS[equipment.slot_type]}</span>
                    <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-xs text-amber-300">{formatEquipmentRarity(equipment.rarity)}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs ${equipment.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>
                      {equipment.is_active ? '啟用中' : '已停用'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">{equipment.description || '尚無描述'}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    來源：{equipment.source_type}
                    {equipment.shop_cost !== null ? ` · 商店售價 ${equipment.shop_cost} 星星` : ''}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button type="button" onClick={() => beginEdit(equipment)} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500">編輯</button>
                  <button type="button" onClick={() => toggleActive(equipment)} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600">
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
