import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Power, PowerOff, Save, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { RARITY_COLORS, RARITY_LABELS, RARITY_ORDER } from '../lib/constants'
import type { Card, Rarity } from '../types'

type CardForm = {
  name: string
  rarity: Rarity
  description: string
  series: string
  color: string
  image_url: string
  is_limited: boolean
  is_active: boolean
}

const emptyForm: CardForm = {
  name: '',
  rarity: 'N',
  description: '',
  series: '校園',
  color: '#334155',
  image_url: '',
  is_limited: false,
  is_active: true
}

function mapCardToForm(card: Card): CardForm {
  return {
    name: card.name,
    rarity: card.rarity,
    description: card.description ?? '',
    series: card.series ?? '校園',
    color: card.color || '#334155',
    image_url: card.image_url ?? '',
    is_limited: card.is_limited,
    is_active: card.is_active
  }
}

export default function TeacherCardsPage() {
  const [cards, setCards] = useState<Card[]>([])
  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | Rarity>('all')
  const [form, setForm] = useState<CardForm>(emptyForm)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const filteredCards = useMemo(
    () => (filter === 'all' ? cards : cards.filter(card => card.rarity === filter)),
    [cards, filter]
  )

  useEffect(() => {
    void loadCards()
  }, [])

  const loadCards = async () => {
    const { data, error } = await supabase.from('cards').select('*').order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      return
    }

    setCards((data ?? []) as Card[])
  }

  const resetForm = () => {
    setEditingCardId(null)
    setForm(emptyForm)
    setMessage(null)
    setError(null)
  }

  const saveCard = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    setError(null)

    const payload = {
      name: form.name.trim(),
      rarity: form.rarity,
      description: form.description.trim(),
      series: form.series.trim(),
      color: form.color,
      image_url: form.image_url.trim() || null,
      is_limited: form.is_limited,
      is_active: form.is_active
    }

    if (!editingCardId) {
      const { error } = await supabase.from('cards').insert(payload)
      if (error) {
        setError(error.message)
      } else {
        setMessage(`已新增卡牌「${payload.name}」`)
        setForm(emptyForm)
        await loadCards()
      }
      setSaving(false)
      return
    }

    const { error } = await supabase.from('cards').update(payload).eq('id', editingCardId)
    if (error) {
      setError(error.message)
    } else {
      setMessage(`已更新卡牌「${payload.name}」`)
      resetForm()
      await loadCards()
    }

    setSaving(false)
  }

  const beginEdit = (card: Card) => {
    setEditingCardId(card.id)
    setForm(mapCardToForm(card))
    setMessage(`正在編輯「${card.name}」`)
    setError(null)
  }

  const toggleActive = async (card: Card) => {
    setMessage(null)
    setError(null)
    const { error } = await supabase.from('cards').update({ is_active: !card.is_active }).eq('id', card.id)
    if (error) {
      setError(error.message)
      return
    }

    setMessage(card.is_active ? `已停用「${card.name}」` : `已啟用「${card.name}」`)
    await loadCards()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">卡牌管理</h1>
        <p className="mt-1 text-sm text-slate-400">建立卡牌、調整稀有度、控制上下架。</p>
      </div>

      <form onSubmit={saveCard} className="space-y-4 rounded-xl bg-slate-800 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold">
            {editingCardId ? <Pencil size={18} className="text-amber-400" /> : <Plus size={18} className="text-indigo-400" />}
            {editingCardId ? '編輯卡牌' : '新增卡牌'}
          </h2>
          {editingCardId && (
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
            placeholder="卡牌名稱"
            required
            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
          />
          <input
            value={form.series}
            onChange={event => setForm({ ...form, series: event.target.value })}
            placeholder="系列 / 分冊"
            required
            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
          />
          <select
            value={form.rarity}
            onChange={event => setForm({ ...form, rarity: event.target.value as Rarity })}
            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
          >
            {RARITY_ORDER.map(rarity => (
              <option key={rarity} value={rarity}>
                {RARITY_LABELS[rarity]}
              </option>
            ))}
          </select>
          <input
            value={form.color}
            onChange={event => setForm({ ...form, color: event.target.value })}
            placeholder="#334155"
            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500"
          />
          <input
            value={form.image_url}
            onChange={event => setForm({ ...form, image_url: event.target.value })}
            placeholder="圖片網址（可留空）"
            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500 sm:col-span-2"
          />
          <textarea
            value={form.description}
            onChange={event => setForm({ ...form, description: event.target.value })}
            placeholder="卡牌描述"
            rows={3}
            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white outline-none focus:border-indigo-500 sm:col-span-2"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.is_limited}
              onChange={event => setForm({ ...form, is_limited: event.target.checked })}
              className="accent-indigo-500"
            />
            限定卡
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={event => setForm({ ...form, is_active: event.target.checked })}
              className="accent-indigo-500"
            />
            立即上架
          </label>
        </div>

        {message && <p className="text-sm text-green-400">{message}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          <Save size={16} /> {saving ? '儲存中...' : editingCardId ? '更新卡牌' : '新增卡牌'}
        </button>
      </form>

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
            {RARITY_LABELS[rarity]}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filteredCards.map(card => (
          <div key={card.id} className="space-y-3 rounded-xl bg-slate-800 p-4">
            <div className="aspect-[3/4] rounded-lg p-3 text-white" style={{ backgroundColor: card.color || '#334155' }}>
              <div className="flex h-full flex-col justify-between rounded-lg bg-black/15 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-full bg-black/20 px-2 py-1 text-[11px]">{RARITY_LABELS[card.rarity]}</span>
                  <span className={`rounded-full px-2 py-1 text-[11px] ${card.is_active ? 'bg-green-600/30' : 'bg-slate-700/70'}`}>
                    {card.is_active ? '上架中' : '已停用'}
                  </span>
                </div>
                <div>
                  <p className="text-lg font-bold">{card.name}</p>
                  <p className="text-xs text-white/80">{card.series}</p>
                </div>
              </div>
            </div>

            <div>
              <p className="font-medium">{card.name}</p>
              <p className="mt-1 text-sm text-slate-400">{card.description || '尚無描述'}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => beginEdit(card)}
                className="flex items-center gap-2 rounded-lg bg-amber-600/20 px-3 py-2 text-sm text-amber-300 hover:bg-amber-600/30"
              >
                <Pencil size={16} /> 編輯
              </button>
              <button
                type="button"
                onClick={() => toggleActive(card)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  card.is_active
                    ? 'bg-red-600/20 text-red-300 hover:bg-red-600/30'
                    : 'bg-green-600/20 text-green-300 hover:bg-green-600/30'
                }`}
              >
                {card.is_active ? <PowerOff size={16} /> : <Power size={16} />}
                {card.is_active ? '停用' : '啟用'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
