import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { RARITY_COLORS, RARITY_LABELS, RARITY_ORDER } from '../lib/constants'
import type { Card } from '../types'

export default function CardLibraryPage() {
  const { user } = useAuthStore()
  const [cards, setCards] = useState<Card[]>([])
  const [userCardIds, setUserCardIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    supabase.from('cards').select('*').eq('is_active', true).order('rarity').then(({ data }) => {
      if (data) setCards(data)
    })
    if (user) {
      supabase.from('user_cards').select('card_id').eq('user_id', user.id).then(({ data }) => {
        if (data) setUserCardIds(new Set(data.map(u => u.card_id)))
      })
    }
  }, [user])

  const filtered = filter === 'all' ? cards : cards.filter(c => c.rarity === filter)
  const grouped = RARITY_ORDER.map(r => ({
    rarity: r,
    label: RARITY_LABELS[r],
    color: RARITY_COLORS[r],
    cards: filtered.filter(c => c.rarity === r)
  })).filter(g => g.cards.length > 0)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">卡牌圖鑑</h1>
      <p className="text-sm text-slate-400">
        已收集 {userCardIds.size} / {cards.length}
      </p>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {['all', ...RARITY_ORDER].map(r => (
          <button
            key={r}
            onClick={() => setFilter(r)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap cursor-pointer border-none ${
              filter === r ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {r === 'all' ? '全部' : RARITY_LABELS[r]}
          </button>
        ))}
      </div>

      {grouped.map(g => (
        <div key={g.rarity}>
          <h2 className="text-lg font-semibold mb-3" style={{ color: g.color }}>
            {g.label}
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {g.cards.map(card => {
              const owned = userCardIds.has(card.id)
              return (
                <div
                  key={card.id}
                  className={`rounded-xl p-3 text-center transition-all ${
                    owned ? 'opacity-100' : 'opacity-40'
                  }`}
                  style={{ backgroundColor: card.color || '#1e293b' }}
                >
                  <div className="aspect-[3/4] rounded-lg flex items-center justify-center text-white text-xs font-bold mb-2"
                    style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
                    {card.name}
                  </div>
                  <p className="text-white text-xs font-medium truncate">{card.name}</p>
                  <p className="text-[10px] text-white/70">{card.series}</p>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
