import { useEffect, useMemo, useState } from 'react'
import { LibraryBig } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatRarityLabel, RARITY_COLORS, RARITY_ORDER } from '../lib/constants'
import { useAuthStore } from '../stores/authStore'
import type { Card } from '../types'

export default function CardLibraryPage() {
  const { user } = useAuthStore()
  const [cards, setCards] = useState<Card[]>([])
  const [ownedCounts, setOwnedCounts] = useState<Record<string, number>>({})
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    supabase
      .from('cards')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setCards(data as Card[])
      })

    if (!user) return

    supabase
      .from('user_cards')
      .select('card_id, count')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (!data) return

        const nextCounts = data.reduce<Record<string, number>>((accumulator, row) => {
          accumulator[row.card_id] = row.count ?? 0
          return accumulator
        }, {})

        setOwnedCounts(nextCounts)
      })
  }, [user])

  const filteredCards = filter === 'all' ? cards : cards.filter(card => card.rarity === filter)

  const totalOwnedCopies = useMemo(
    () => Object.values(ownedCounts).reduce((sum, count) => sum + Math.max(count, 0), 0),
    [ownedCounts]
  )

  const totalOwnedTypes = useMemo(
    () => Object.values(ownedCounts).filter(count => count > 0).length,
    [ownedCounts]
  )

  const grouped = RARITY_ORDER.map(rarity => ({
    rarity,
    label: formatRarityLabel(rarity),
    color: RARITY_COLORS[rarity],
    cards: filteredCards.filter(card => card.rarity === rarity)
  })).filter(group => group.cards.length > 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">卡牌圖鑑</h1>
        <p className="mt-1 text-sm text-slate-400">
          已收集 {totalOwnedTypes} / {cards.length} 種卡牌，總持有 {totalOwnedCopies} 張。
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {['all', ...RARITY_ORDER].map(rarity => (
          <button
            key={rarity}
            onClick={() => setFilter(rarity)}
            className={`cursor-pointer rounded-full border-none px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
              filter === rarity ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {rarity === 'all' ? '全部' : formatRarityLabel(rarity)}
          </button>
        ))}
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-2xl bg-slate-800 py-12 text-center text-slate-500">
          <LibraryBig size={40} className="mx-auto mb-3 text-slate-600" />
          <p>這個篩選條件下沒有卡片。</p>
        </div>
      ) : (
        grouped.map(group => (
          <div key={group.rarity}>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: group.color }}>
              {group.label}
            </h2>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {group.cards.map(card => {
                const ownedCount = ownedCounts[card.id] ?? 0
                const owned = ownedCount > 0

                return (
                  <div
                    key={card.id}
                    className={`relative rounded-2xl p-3 text-center transition-all ${
                      owned ? 'opacity-100 shadow-lg' : 'opacity-40'
                    }`}
                    style={{ backgroundColor: card.color || '#1e293b' }}
                  >
                    {owned ? (
                      <div className="absolute right-2 top-2 rounded-full bg-slate-950/70 px-2.5 py-1 text-xs font-semibold text-white">
                        x{ownedCount}
                      </div>
                    ) : null}

                    <div
                      className="mb-2 flex aspect-[3/4] items-center justify-center rounded-xl text-center text-sm font-bold text-white"
                      style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
                    >
                      <span className="px-2">{card.name}</span>
                    </div>

                    <p className="truncate text-sm font-medium text-white">{card.name}</p>
                    <p className="mt-1 text-[11px] text-white/70">{card.series}</p>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
