import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Power, PowerOff, Save, Trophy, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatRarityLabel, RARITY_ORDER } from '../lib/constants'
import type { Achievement, AchievementConditionType, Card, Rarity } from '../types'

type AchievementForm = {
  name: string
  description: string
  condition_type: AchievementConditionType
  condition_value: number
  condition_card_id: string
  condition_series: string
  condition_rarity: '' | Rarity
  card_reward: string
  points_reward: number
  is_active: boolean
}

const conditionOptions: Array<{ value: AchievementConditionType; label: string }> = [
  { value: 'cards_collected', label: '累積卡牌數' },
  { value: 'points', label: '累積點數' },
  { value: 'tasks_completed', label: '完成任務數' },
  { value: 'series_complete', label: '完成整個系列' },
  { value: 'rarity_collection', label: '收集指定稀有度' }
]

const emptyForm: AchievementForm = {
  name: '',
  description: '',
  condition_type: 'tasks_completed',
  condition_value: 1,
  condition_card_id: '',
  condition_series: '',
  condition_rarity: '',
  card_reward: '',
  points_reward: 0,
  is_active: true
}

function mapAchievementToForm(achievement: Achievement): AchievementForm {
  return {
    name: achievement.name,
    description: achievement.description ?? '',
    condition_type: achievement.condition_type,
    condition_value: achievement.condition_value,
    condition_card_id: achievement.condition_card_id ?? '',
    condition_series: achievement.condition_series ?? '',
    condition_rarity: (achievement.condition_rarity as Rarity | null) ?? '',
    card_reward: achievement.card_reward ?? '',
    points_reward: achievement.points_reward,
    is_active: true
  }
}

function conditionSummary(item: Achievement) {
  switch (item.condition_type) {
    case 'cards_collected':
      return `收集 ${item.condition_value} 張卡牌`
    case 'points':
      return `累積 ${item.condition_value} 點`
    case 'tasks_completed':
      return `完成 ${item.condition_value} 次任務`
    case 'series_complete':
      return `完成系列：${item.condition_series || '未指定'}`
    case 'rarity_collection':
      return `收集 ${formatRarityLabel(item.condition_rarity as Rarity)} ${item.condition_value} 張`
    default:
      return '未設定條件'
  }
}

export default function TeacherAchievementsPage() {
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AchievementForm>(emptyForm)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const filteredAchievements = useMemo(() => {
    if (filter === 'all') return achievements
    return achievements.filter(item => item.is_active === (filter === 'active'))
  }, [achievements, filter])

  useEffect(() => {
    void Promise.all([loadAchievements(), loadCards()])
  }, [])

  const loadAchievements = async () => {
    const { data, error } = await supabase.from('achievements').select('*').order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      return
    }
    setAchievements((data ?? []) as Achievement[])
  }

  const loadCards = async () => {
    const { data } = await supabase.from('cards').select('*').order('name')
    setCards((data ?? []) as Card[])
  }

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyForm)
    setMessage(null)
    setError(null)
  }

  const beginEdit = (achievement: Achievement) => {
    setEditingId(achievement.id)
    setForm(mapAchievementToForm(achievement))
    setMessage(`正在編輯成就「${achievement.name}」`)
    setError(null)
  }

  const saveAchievement = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    setError(null)

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      condition_type: form.condition_type,
      condition_value: Number(form.condition_value),
      condition_card_id: form.condition_card_id || null,
      condition_series: form.condition_series.trim() || null,
      condition_rarity: form.condition_rarity || null,
      card_reward: form.card_reward || null,
      points_reward: Number(form.points_reward),
      is_active: form.is_active
    }

    if (!editingId) {
      const { error } = await supabase.from('achievements').insert(payload)
      if (error) {
        setError(error.message)
      } else {
        setMessage(`已新增成就「${payload.name}」`)
        setForm(emptyForm)
        await loadAchievements()
      }
      setSaving(false)
      return
    }

    const { error } = await supabase.from('achievements').update(payload).eq('id', editingId)
    if (error) {
      setError(error.message)
    } else {
      setMessage(`已更新成就「${payload.name}」`)
      resetForm()
      await loadAchievements()
    }

    setSaving(false)
  }

  const toggleActive = async (achievement: Achievement) => {
    setMessage(null)
    setError(null)
    const { error } = await supabase
      .from('achievements')
      .update({ is_active: !achievement.is_active })
      .eq('id', achievement.id)

    if (error) {
      setError(error.message)
      return
    }

    setMessage(achievement.is_active ? `已停用「${achievement.name}」` : `已啟用「${achievement.name}」`)
    await loadAchievements()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">成就管理</h1>
        <p className="mt-1 text-sm text-slate-400">建立成就條件、設定點數與卡牌獎勵。</p>
      </div>

      <form onSubmit={saveAchievement} className="space-y-4 rounded-xl bg-slate-800 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold">
            {editingId ? <Pencil size={18} className="text-amber-400" /> : <Plus size={18} className="text-indigo-400" />}
            {editingId ? '編輯成就' : '新增成就'}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
            >
              <X size={16} /> 取消編輯
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={form.name}
            onChange={event => setForm({ ...form, name: event.target.value })}
            placeholder="成就名稱"
            required
            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
          />
          <select
            value={form.condition_type}
            onChange={event => setForm({ ...form, condition_type: event.target.value as AchievementConditionType })}
            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
          >
            {conditionOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            value={form.condition_value}
            onChange={event => setForm({ ...form, condition_value: Number(event.target.value) })}
            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
          />
          <input
            type="number"
            min="0"
            value={form.points_reward}
            onChange={event => setForm({ ...form, points_reward: Number(event.target.value) })}
            placeholder="點數獎勵"
            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
          />

          <input
            value={form.condition_series}
            onChange={event => setForm({ ...form, condition_series: event.target.value })}
            placeholder="系列條件（可留空）"
            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
          />
          <select
            value={form.condition_rarity}
            onChange={event => setForm({ ...form, condition_rarity: event.target.value as '' | Rarity })}
            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
          >
            <option value="">不指定稀有度</option>
            {RARITY_ORDER.map(rarity => (
              <option key={rarity} value={rarity}>
                {formatRarityLabel(rarity)}
              </option>
            ))}
          </select>

          <select
            value={form.condition_card_id}
            onChange={event => setForm({ ...form, condition_card_id: event.target.value })}
            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
          >
            <option value="">不指定條件卡牌</option>
            {cards.map(card => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>
          <select
            value={form.card_reward}
            onChange={event => setForm({ ...form, card_reward: event.target.value })}
            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
          >
            <option value="">不送卡牌</option>
            {cards.map(card => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>

          <textarea
            value={form.description}
            onChange={event => setForm({ ...form, description: event.target.value })}
            placeholder="成就描述"
            rows={3}
            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500 sm:col-span-2"
          />
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={event => setForm({ ...form, is_active: event.target.checked })}
            className="accent-indigo-500"
          />
          立即啟用
        </label>

        {message && <p className="text-sm text-green-400">{message}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          <Save size={16} /> {saving ? '儲存中...' : editingId ? '更新成就' : '新增成就'}
        </button>
      </form>

      <div className="flex gap-2">
        {[
          { key: 'all', label: '全部' },
          { key: 'active', label: '啟用中' },
          { key: 'inactive', label: '已停用' }
        ].map(option => (
          <button
            key={option.key}
            type="button"
            onClick={() => setFilter(option.key as 'all' | 'active' | 'inactive')}
            className={`rounded-full px-3 py-1.5 text-sm ${
              filter === option.key ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {filteredAchievements.map(achievement => (
          <div key={achievement.id} className="rounded-xl bg-slate-800 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`mt-1 flex h-11 w-11 items-center justify-center rounded-xl ${achievement.is_active ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-500'}`}>
                  <Trophy size={22} />
                </div>
                <div>
                  <h3 className="font-semibold">{achievement.name}</h3>
                  <p className="mt-1 text-sm text-slate-400">{achievement.description || '尚無描述'}</p>
                  <p className="mt-2 text-xs text-slate-500">{conditionSummary(achievement)}</p>
                  <p className="mt-1 text-xs text-amber-300">
                    點數獎勵 {achievement.points_reward}
                    {achievement.card_reward ? ' · 含卡牌獎勵' : ''}
                  </p>
                </div>
              </div>

              <span className={`rounded-full px-2.5 py-1 text-xs ${achievement.is_active ? 'bg-green-600/20 text-green-300' : 'bg-slate-700 text-slate-400'}`}>
                {achievement.is_active ? '啟用中' : '已停用'}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => beginEdit(achievement)}
                className="flex items-center gap-2 rounded-lg bg-amber-600/20 px-3 py-2 text-sm text-amber-300 hover:bg-amber-600/30"
              >
                <Pencil size={16} /> 編輯
              </button>
              <button
                type="button"
                onClick={() => toggleActive(achievement)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  achievement.is_active
                    ? 'bg-red-600/20 text-red-300 hover:bg-red-600/30'
                    : 'bg-green-600/20 text-green-300 hover:bg-green-600/30'
                }`}
              >
                {achievement.is_active ? <PowerOff size={16} /> : <Power size={16} />}
                {achievement.is_active ? '停用' : '啟用'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
