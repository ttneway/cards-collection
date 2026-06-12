import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { RARITY_COLORS, RARITY_LABELS } from '../lib/constants'
import type { UserCard, Card } from '../types'

export default function MyCardsPage() {
  const { user } = useAuthStore()
  const [userCards, setUserCards] = useState<(UserCard & { card: Card })[]>([])

  useEffect(() => {
    if (!user) return
    supabase
      .from('user_cards')
      .select('*, card:card_id(*)')
      .eq('user_id', user.id)
      .order('acquired_at', { ascending: false })
      .then(({ data }) => {
        if (data) setUserCards(data as any)
      })
  }, [user])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">我的牌庫</h1>
      <p className="text-sm text-slate-400">共 {userCards.length} 張卡片</p>

      {userCards.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <p>還沒有卡片，去商店抽卡包吧！</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {userCards.map(uc => (
            <div
              key={uc.id}
              className="rounded-xl p-3 text-center"
              style={{ backgroundColor: uc.card.color || '#1e293b' }}
            >
              <div className="aspect-[3/4] rounded-lg flex items-center justify-center text-white text-xs font-bold mb-2"
                style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
                {uc.card.name}
              </div>
              <p className="text-white text-xs font-medium truncate">{uc.card.name}</p>
              <p className="text-[10px]" style={{ color: RARITY_COLORS[uc.card.rarity] }}>
                {RARITY_LABELS[uc.card.rarity]} {uc.count > 1 && `×${uc.count}`}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
