import { useEffect, useMemo, useState } from 'react'
import { ShoppingBag, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { formatRarityLabel, RARITY_COLORS, RARITY_ORDER } from '../lib/constants'
import type { CardPack, PackRarityOdds } from '../types'

export default function ShopPage() {
  const { user, refreshProfile } = useAuthStore()
  const [packs, setPacks] = useState<CardPack[]>([])
  const [oddsRows, setOddsRows] = useState<PackRarityOdds[]>([])
  const [buying, setBuying] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([loadPacks(), loadOdds()])
  }, [])

  const oddsByPack = useMemo(() => {
    return oddsRows.reduce<Record<string, PackRarityOdds[]>>((accumulator, row) => {
      if (!accumulator[row.pack_id]) accumulator[row.pack_id] = []
      accumulator[row.pack_id].push(row)
      return accumulator
    }, {})
  }, [oddsRows])

  const loadPacks = async () => {
    const { data } = await supabase
      .from('card_packs')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (data) setPacks(data as CardPack[])
  }

  const loadOdds = async () => {
    const { data, error } = await supabase.rpc('get_pack_rarity_odds')
    if (!error && data) {
      setOddsRows(data as PackRarityOdds[])
    }
  }

  const buyPack = async (packId: string) => {
    if (!user) return

    setBuying(packId)
    const { error } = await supabase.rpc('purchase_pack', {
      p_user_id: user.id,
      p_pack_id: packId
    })

    if (error) {
      alert(error.message)
    } else {
      await refreshProfile()
      alert('抽卡完成，卡片已加入你的牌庫。')
    }

    setBuying(null)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">抽卡商店</h1>
        <p className="mt-1 text-sm text-slate-400">每個卡包都會公告稀有度機率，實際抽卡會依照同一套權重計算。</p>
      </div>

      {packs.length === 0 ? (
        <div className="py-12 text-center text-slate-500">
          <ShoppingBag size={48} className="mx-auto mb-3 text-slate-600" />
          <p>目前還沒有上架中的卡包。</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {packs.map(pack => {
            const odds = [...(oddsByPack[pack.id] ?? [])].sort(
              (left, right) => RARITY_ORDER.indexOf(left.rarity) - RARITY_ORDER.indexOf(right.rarity)
            )

            return (
              <div key={pack.id} className="rounded-xl bg-slate-800 p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-24 w-20 items-center justify-center rounded-xl bg-indigo-900/50 text-indigo-400">
                    <ShoppingBag size={32} />
                  </div>

                  <div className="flex-1">
                    <h3 className="font-semibold">{pack.name}</h3>
                    <p className="text-sm text-slate-400">{pack.description}</p>
                    <div className="mt-2 flex items-center gap-1 text-sm font-medium text-amber-400">
                      <Star size={14} fill="currentColor" />
                      <span>{pack.cost} 點</span>
                    </div>
                  </div>

                  <button
                    onClick={() => buyPack(pack.id)}
                    disabled={buying === pack.id || (user?.stars ?? 0) < pack.cost}
                    className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                  >
                    {buying === pack.id ? '抽卡中...' : '抽卡'}
                  </button>
                </div>

                <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/40 p-3">
                  <p className="mb-2 text-sm font-medium text-slate-200">機率公告</p>
                  {odds.length === 0 ? (
                    <p className="text-sm text-slate-500">這個卡包尚未設定機率資料。</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {odds.map(row => (
                        <div key={`${pack.id}-${row.rarity}`} className="rounded-lg bg-slate-800 px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span style={{ color: RARITY_COLORS[row.rarity] }}>{formatRarityLabel(row.rarity)}</span>
                            <span className="font-semibold text-white">{Number(row.probability_percent).toFixed(2)}%</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            此稀有度共 {row.card_count} 張卡，總權重 {row.total_weight}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
