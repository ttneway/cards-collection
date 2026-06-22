import { useEffect, useMemo, useState } from 'react'
import { CreditCard } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatRarityLabel, RARITY_COLORS } from '../lib/constants'
import { useAuthStore } from '../stores/authStore'
import type { Card, UserCard } from '../types'

type OwnedCardRow = UserCard & { card: Card }

export default function MyCardsPage() {
  const { user } = useAuthStore()
  const [userCards, setUserCards] = useState<OwnedCardRow[]>([])

  useEffect(() => {
    if (!user) return

    supabase
      .from('user_cards')
      .select('*, card:card_id(*)')
      .eq('user_id', user.id)
      .order('acquired_at', { ascending: false })
      .then(({ data }) => {
        if (data) setUserCards(data as OwnedCardRow[])
      })
  }, [user])

  const totalCopies = useMemo(
    () => userCards.reduce((sum, row) => sum + Math.max(row.count ?? 0, 0), 0),
    [userCards]
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">我的牌庫</h1>
        <p className="mt-1 text-sm text-slate-400">
          共 {totalCopies} 張卡片，包含 {userCards.length} 種不同卡牌。
        </p>
      </div>

      {userCards.length === 0 ? (
        <div className="rounded-2xl bg-slate-800 py-12 text-center text-slate-500">
          <CreditCard size={40} className="mx-auto mb-3 text-slate-600" />
          <p>目前還沒有收集到卡片。</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {userCards.map(row => (
            <div
              key={row.id}
              className="relative rounded-2xl p-3 text-center shadow-lg"
              style={{ backgroundColor: row.card.color || '#1e293b' }}
            >
              <div className="absolute right-2 top-2 rounded-full bg-slate-950/70 px-2.5 py-1 text-xs font-semibold text-white">
                x{row.count}
              </div>

              <div
                className="mb-2 flex aspect-[3/4] items-center justify-center rounded-xl text-center text-sm font-bold text-white"
                style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
              >
                <span className="px-2">{row.card.name}</span>
              </div>

              <p className="truncate text-sm font-medium text-white">{row.card.name}</p>
              <p className="mt-1 text-[11px]" style={{ color: RARITY_COLORS[row.card.rarity] }}>
                {formatRarityLabel(row.card.rarity)}
              </p>
              <p className="mt-1 text-[11px] text-white/70">{row.card.series}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
