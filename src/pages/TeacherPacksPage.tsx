import { useEffect, useMemo, useState } from 'react'
import { Package, Pencil, Power, PowerOff, Save, Search, Sparkles, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatRarityLabel, RARITY_COLORS, RARITY_ORDER } from '../lib/constants'
import type { Card, CardPack, PackContent, PackRarityOdds, Rarity } from '../types'

type CardPackWithContents = CardPack & { pack_contents?: Array<PackContent & { card?: Card | null }> }

type PackForm = {
  name: string
  description: string
  cost: string
  cards_per_open: string
  image_url: string
  is_active: boolean
}

type PackContentDraft = {
  key: string
  card_id: string
  weight: number
  card?: Card | null
}

const emptyPackForm: PackForm = {
  name: '',
  description: '',
  cost: '100',
  cards_per_open: '1',
  image_url: '',
  is_active: true,
}

function toContentDraft(item: PackContent & { card?: Card | null }): PackContentDraft {
  return {
    key: item.id,
    card_id: item.card_id,
    weight: item.weight,
    card: item.card ?? null,
  }
}

function createContentKey(cardId: string) {
  return `${cardId}-${crypto.randomUUID()}`
}

export default function TeacherPacksPage() {
  const [packs, setPacks] = useState<CardPackWithContents[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [editingPackId, setEditingPackId] = useState<string | null>(null)
  const [packForm, setPackForm] = useState<PackForm>(emptyPackForm)
  const [contentDrafts, setContentDrafts] = useState<PackContentDraft[]>([])
  const [cardSearch, setCardSearch] = useState('')
  const [rarityFilter, setRarityFilter] = useState<'all' | Rarity>('all')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [oddsRows, setOddsRows] = useState<PackRarityOdds[]>([])

  useEffect(() => {
    void Promise.all([loadPacks(), loadCards(), loadOdds()])
  }, [])

  const cardMap = useMemo(() => {
    return cards.reduce<Record<string, Card>>((accumulator, card) => {
      accumulator[card.id] = card
      return accumulator
    }, {})
  }, [cards])

  const filteredCards = useMemo(() => {
    const search = cardSearch.trim().toLowerCase()
    return cards.filter(card => {
      if (rarityFilter !== 'all' && card.rarity !== rarityFilter) return false
      if (!search) return true

      return (
        card.name.toLowerCase().includes(search) ||
        (card.series ?? '').toLowerCase().includes(search) ||
        (card.description ?? '').toLowerCase().includes(search)
      )
    })
  }, [cards, cardSearch, rarityFilter])

  const selectedCardIds = useMemo(() => new Set(contentDrafts.map(item => item.card_id)), [contentDrafts])

  const currentOdds = useMemo(() => {
    if (contentDrafts.length === 0) return []

    const totals = new Map<Rarity, { cardCount: number; totalWeight: number }>()
    let grandTotal = 0

    contentDrafts.forEach(item => {
      const card = item.card ?? cardMap[item.card_id]
      if (!card) return
      grandTotal += item.weight

      const existing = totals.get(card.rarity) ?? { cardCount: 0, totalWeight: 0 }
      existing.cardCount += 1
      existing.totalWeight += item.weight
      totals.set(card.rarity, existing)
    })

    return RARITY_ORDER.map(rarity => {
      const current = totals.get(rarity)
      if (!current || grandTotal <= 0) return null

      return {
        rarity,
        card_count: current.cardCount,
        total_weight: current.totalWeight,
        probability_percent: Number(((current.totalWeight / grandTotal) * 100).toFixed(2)),
      }
    }).filter(Boolean) as Array<{
      rarity: Rarity
      card_count: number
      total_weight: number
      probability_percent: number
    }>
  }, [contentDrafts, cardMap])

  const oddsByPack = useMemo(() => {
    return oddsRows.reduce<Record<string, PackRarityOdds[]>>((accumulator, row) => {
      if (!accumulator[row.pack_id]) accumulator[row.pack_id] = []
      accumulator[row.pack_id].push(row)
      return accumulator
    }, {})
  }, [oddsRows])

  async function loadPacks() {
    const { data, error } = await supabase
      .from('card_packs')
      .select('*, pack_contents(*, card:card_id(*))')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    setPacks((data ?? []) as CardPackWithContents[])
  }

  async function loadCards() {
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .eq('is_active', true)
      .order('rarity', { ascending: true })
      .order('name', { ascending: true })

    if (error) {
      setError(error.message)
      return
    }

    setCards((data ?? []) as Card[])
  }

  async function loadOdds() {
    const { data, error } = await supabase.rpc('get_pack_rarity_odds')
    if (error) {
      setError(error.message)
      return
    }

    setOddsRows((data ?? []) as PackRarityOdds[])
  }

  function resetForm() {
    setEditingPackId(null)
    setPackForm(emptyPackForm)
    setContentDrafts([])
    setCardSearch('')
    setRarityFilter('all')
  }

  function beginEdit(pack: CardPackWithContents) {
    setEditingPackId(pack.id)
    setPackForm({
      name: pack.name,
      description: pack.description ?? '',
      cost: String(pack.cost ?? 0),
      cards_per_open: String(pack.cards_per_open ?? 1),
      image_url: pack.image_url ?? '',
      is_active: pack.is_active,
    })
    setContentDrafts((pack.pack_contents ?? []).map(item => toContentDraft(item)))
    setMessage(`正在編輯卡包「${pack.name}」。`)
    setError(null)
  }

  async function savePack(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    setError(null)

    if (contentDrafts.length === 0) {
      setError('請至少加入一張卡片到卡包內容。')
      setSaving(false)
      return
    }

    if (contentDrafts.some(item => item.weight <= 0)) {
      setError('所有卡片權重都必須大於 0。')
      setSaving(false)
      return
    }

    const cardsPerOpen = Number(packForm.cards_per_open)
    if (!Number.isFinite(cardsPerOpen) || cardsPerOpen < 1 || cardsPerOpen > 20) {
      setError('每次開包張數需介於 1 到 20 張。')
      setSaving(false)
      return
    }

    const payload = {
      name: packForm.name.trim(),
      description: packForm.description.trim(),
      cost: Number(packForm.cost),
      cards_per_open: cardsPerOpen,
      image_url: packForm.image_url.trim() || null,
      is_active: packForm.is_active,
    }

    try {
      let packId = editingPackId

      if (!editingPackId) {
        const { data, error } = await supabase.from('card_packs').insert(payload).select('*').single()
        if (error) throw error
        packId = data.id
      } else {
        const { error } = await supabase.from('card_packs').update(payload).eq('id', editingPackId)
        if (error) throw error

        const { error: deleteError } = await supabase.from('pack_contents').delete().eq('pack_id', editingPackId)
        if (deleteError) throw deleteError
      }

      const rows = contentDrafts.map(item => ({
        pack_id: packId,
        card_id: item.card_id,
        weight: Number(item.weight),
      }))

      const { error: insertError } = await supabase.from('pack_contents').insert(rows)
      if (insertError) throw insertError

      setMessage(editingPackId ? `已更新卡包「${payload.name}」。` : `已建立卡包「${payload.name}」。`)
      resetForm()
      await Promise.all([loadPacks(), loadOdds()])
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '儲存卡包失敗。')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(pack: CardPackWithContents) {
    setMessage(null)
    setError(null)

    const { error } = await supabase
      .from('card_packs')
      .update({ is_active: !pack.is_active })
      .eq('id', pack.id)

    if (error) {
      setError(error.message)
      return
    }

    setMessage(pack.is_active ? `已停用卡包「${pack.name}」。` : `已啟用卡包「${pack.name}」。`)
    await Promise.all([loadPacks(), loadOdds()])
  }

  function addCard(card: Card) {
    if (selectedCardIds.has(card.id)) return
    setContentDrafts(previous => [...previous, { key: createContentKey(card.id), card_id: card.id, weight: 1, card }])
  }

  function addFilteredCards() {
    const nextCards = filteredCards.filter(card => !selectedCardIds.has(card.id))
    if (nextCards.length === 0) return

    setContentDrafts(previous => [
      ...previous,
      ...nextCards.map(card => ({ key: createContentKey(card.id), card_id: card.id, weight: 1, card })),
    ])
  }

  function removeCard(key: string) {
    setContentDrafts(previous => previous.filter(item => item.key !== key))
  }

  function updateWeight(key: string, weight: number) {
    setContentDrafts(previous =>
      previous.map(item => (item.key === key ? { ...item, weight: Number.isFinite(weight) ? weight : item.weight } : item)),
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">抽卡卡包管理</h1>
        <p className="mt-1 text-sm text-slate-400">
          教師可建立卡包、設定售價、啟用狀態、卡包內容與掉落權重，並即時查看各稀有度機率。
        </p>
      </div>

      {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Package size={18} className="text-indigo-300" />
              {editingPackId ? '編輯卡包' : '建立卡包'}
            </h2>
            <p className="mt-1 text-sm text-slate-400">右側先挑卡、設定權重，左側再儲存整包。</p>
          </div>
          {editingPackId ? (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
            >
              <X size={16} />
              取消編輯
            </button>
          ) : null}
        </div>

        <form onSubmit={savePack} className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <label className="space-y-2">
              <span className="text-sm text-slate-300">卡包名稱</span>
              <input
                value={packForm.name}
                onChange={event => setPackForm(previous => ({ ...previous, name: event.target.value }))}
                required
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-300">卡包說明</span>
              <textarea
                value={packForm.description}
                onChange={event => setPackForm(previous => ({ ...previous, description: event.target.value }))}
                rows={3}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-300">售價</span>
                <input
                  type="number"
                  min="0"
                  value={packForm.cost}
                  onChange={event => setPackForm(previous => ({ ...previous, cost: event.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">每次開包張數</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={packForm.cards_per_open}
                  onChange={event => setPackForm(previous => ({ ...previous, cards_per_open: event.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">封面圖片網址</span>
                <input
                  value={packForm.image_url}
                  onChange={event => setPackForm(previous => ({ ...previous, image_url: event.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                />
              </label>
            </div>

            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={packForm.is_active}
                onChange={event => setPackForm(previous => ({ ...previous, is_active: event.target.checked }))}
                className="accent-indigo-500"
              />
              這個卡包目前開放抽取
            </label>

            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                <Sparkles size={16} className="text-amber-300" />
                即時機率預覽
              </div>

              {currentOdds.length === 0 ? (
                <p className="text-sm text-slate-400">尚未加入卡片內容。</p>
              ) : (
                <div className="space-y-2">
                  {currentOdds.map(row => (
                    <div key={row.rarity} className="rounded-xl bg-slate-800 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span style={{ color: RARITY_COLORS[row.rarity] }}>{formatRarityLabel(row.rarity)}</span>
                        <span className="font-semibold text-white">{row.probability_percent.toFixed(2)}%</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        卡片數 {row.card_count} · 權重總和 {row.total_weight}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? '儲存中...' : editingPackId ? '更新卡包' : '建立卡包'}
            </button>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_150px_auto]">
                <label className="relative block">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    value={cardSearch}
                    onChange={event => setCardSearch(event.target.value)}
                    placeholder="搜尋卡片名稱、分冊、描述"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-10 py-3 text-white"
                  />
                </label>

                <select
                  value={rarityFilter}
                  onChange={event => setRarityFilter(event.target.value as 'all' | Rarity)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                >
                  <option value="all">全部稀有度</option>
                  {RARITY_ORDER.map(rarity => (
                    <option key={rarity} value={rarity}>
                      {formatRarityLabel(rarity)}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={addFilteredCards}
                  className="rounded-xl bg-slate-700 px-4 py-3 text-sm font-medium text-white hover:bg-slate-600"
                >
                  批次加入
                </button>
              </div>

              <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
                {filteredCards.map(card => {
                  const disabled = selectedCardIds.has(card.id)
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => addCard(card)}
                      disabled={disabled}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-left text-sm text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{card.name}</p>
                        <p className="truncate text-xs text-slate-400">
                          {card.series} · {formatRarityLabel(card.rarity)}
                        </p>
                      </div>
                      <span className="rounded-lg bg-indigo-600/20 px-2 py-1 text-xs text-indigo-200">
                        {disabled ? '已加入' : '加入'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-white">卡包內容</h3>
                <span className="text-sm text-slate-400">{contentDrafts.length} 張</span>
              </div>

              {contentDrafts.length === 0 ? (
                <p className="text-sm text-slate-400">還沒有加入任何卡片。</p>
              ) : (
                <div className="space-y-3">
                  {contentDrafts.map(item => {
                    const card = item.card ?? cardMap[item.card_id]
                    if (!card) return null

                    return (
                      <div key={item.key} className="grid gap-3 rounded-xl border border-slate-700 bg-slate-800 p-3 md:grid-cols-[1fr_120px_auto] md:items-center">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white">{card.name}</p>
                          <p className="truncate text-xs text-slate-400">
                            {card.series} · <span style={{ color: RARITY_COLORS[card.rarity] }}>{formatRarityLabel(card.rarity)}</span>
                          </p>
                        </div>

                        <label className="space-y-1">
                          <span className="text-xs text-slate-400">權重</span>
                          <input
                            type="number"
                            min="1"
                            value={item.weight}
                            onChange={event => updateWeight(item.key, Number(event.target.value))}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => removeCard(item.key)}
                          className="rounded-lg bg-rose-600/20 px-3 py-2 text-sm text-rose-300 hover:bg-rose-600/30"
                        >
                          移除
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">已建立卡包</h2>
          <p className="mt-1 text-sm text-slate-400">可直接檢查目前各卡包的啟用狀態與公開機率。</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {packs.map(pack => {
            const odds = [...(oddsByPack[pack.id] ?? [])].sort(
              (left, right) => RARITY_ORDER.indexOf(left.rarity) - RARITY_ORDER.indexOf(right.rarity),
            )

            return (
              <div key={pack.id} className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{pack.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">{pack.description || '尚未填寫卡包說明。'}</p>
                    <p className="mt-2 text-sm text-amber-300">售價：{pack.cost} 星星</p>
                    <p className="mt-1 text-sm text-sky-300">每次開包：{pack.cards_per_open ?? 1} 張</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs ${pack.is_active ? 'bg-emerald-500/15 text-emerald-200' : 'bg-slate-700 text-slate-300'}`}>
                    {pack.is_active ? '啟用中' : '已停用'}
                  </span>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
                  <p className="mb-3 text-sm font-medium text-slate-200">公開機率</p>
                  {odds.length === 0 ? (
                    <p className="text-sm text-slate-500">這個卡包目前還沒有可用機率資料。</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {odds.map(row => (
                        <div key={`${pack.id}-${row.rarity}`} className="rounded-xl bg-slate-800 px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span style={{ color: RARITY_COLORS[row.rarity] }}>{formatRarityLabel(row.rarity)}</span>
                            <span className="font-semibold text-white">{Number(row.probability_percent).toFixed(2)}%</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            卡片數 {row.card_count} · 權重總和 {row.total_weight}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => beginEdit(pack)}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-600/20 px-3 py-2 text-sm text-amber-300 hover:bg-amber-600/30"
                  >
                    <Pencil size={16} />
                    編輯
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleActive(pack)}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                      pack.is_active
                        ? 'bg-rose-600/20 text-rose-300 hover:bg-rose-600/30'
                        : 'bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
                    }`}
                  >
                    {pack.is_active ? <PowerOff size={16} /> : <Power size={16} />}
                    {pack.is_active ? '停用' : '啟用'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
