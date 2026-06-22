import { useEffect, useMemo, useState } from 'react'
import { ShoppingBag, Sparkles, Star, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatRarityLabel, RARITY_COLORS, RARITY_ORDER } from '../lib/constants'
import { useAuthStore } from '../stores/authStore'
import type { Card, CardPack, PackRarityOdds } from '../types'

type DrawStage = 'idle' | 'opening' | 'revealed'

interface DrawResult {
  card: Card
  packName: string
}

export default function ShopPage() {
  const { user, refreshProfile } = useAuthStore()
  const [packs, setPacks] = useState<CardPack[]>([])
  const [oddsRows, setOddsRows] = useState<PackRarityOdds[]>([])
  const [buying, setBuying] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [drawStage, setDrawStage] = useState<DrawStage>('idle')
  const [drawResult, setDrawResult] = useState<DrawResult | null>(null)

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
    if (!error && data) setOddsRows(data as PackRarityOdds[])
  }

  const closeDrawModal = () => {
    setDrawStage('idle')
    setDrawResult(null)
  }

  const buyPack = async (pack: CardPack) => {
    if (!user || buying) return

    setMessage(null)
    setBuying(pack.id)
    setDrawStage('opening')
    setDrawResult(null)

    try {
      const { data: drawnCardId, error } = await supabase.rpc('purchase_pack', {
        p_user_id: user.id,
        p_pack_id: pack.id
      })

      if (error) throw error

      const { data: drawnCard, error: cardError } = await supabase
        .from('cards')
        .select('*')
        .eq('id', drawnCardId)
        .single()

      if (cardError || !drawnCard) {
        throw new Error(cardError?.message || '抽卡完成，但讀取卡片資料失敗。')
      }

      await refreshProfile()

      window.setTimeout(() => {
        setDrawResult({
          card: drawnCard as Card,
          packName: pack.name
        })
        setDrawStage('revealed')
      }, 1400)
    } catch (error: any) {
      setDrawStage('idle')
      setDrawResult(null)
      setMessage(error?.message || '抽卡失敗，請稍後再試。')
    } finally {
      setBuying(null)
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold">抽卡商店</h1>
          <p className="mt-1 text-sm text-slate-400">
            使用星星購買卡包。每次抽卡都會先開包，再揭示這次抽到的卡片。
          </p>
        </div>

        {message ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {message}
          </div>
        ) : null}

        {packs.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <ShoppingBag size={48} className="mx-auto mb-3 text-slate-600" />
            <p>目前還沒有可購買的卡包。</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {packs.map(pack => {
              const odds = [...(oddsByPack[pack.id] ?? [])].sort(
                (left, right) => RARITY_ORDER.indexOf(left.rarity) - RARITY_ORDER.indexOf(right.rarity)
              )

              return (
                <div key={pack.id} className="rounded-2xl border border-slate-700 bg-slate-800 p-4 shadow-lg">
                  <div className="flex items-center gap-4">
                    <div className="flex h-24 w-20 items-center justify-center rounded-2xl border border-indigo-400/20 bg-indigo-900/40 text-indigo-300">
                      <ShoppingBag size={32} />
                    </div>

                    <div className="flex-1">
                      <h3 className="font-semibold text-white">{pack.name}</h3>
                      <p className="text-sm text-slate-400">{pack.description || '神秘卡包，打開看看今天的手氣。'}</p>
                      <div className="mt-2 flex items-center gap-1 text-sm font-medium text-amber-400">
                        <Star size={14} fill="currentColor" />
                        <span>{pack.cost} 星星</span>
                      </div>
                    </div>

                    <button
                      onClick={() => buyPack(pack)}
                      disabled={buying === pack.id || (user?.stars ?? 0) < pack.cost}
                      className="cursor-pointer rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                    >
                      {buying === pack.id ? '開包中...' : '抽卡'}
                    </button>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/50 p-3">
                    <p className="mb-2 text-sm font-medium text-slate-200">機率公告</p>
                    {odds.length === 0 ? (
                      <p className="text-sm text-slate-500">這個卡包目前還沒有可抽取的卡片設定。</p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {odds.map(row => (
                          <div key={`${pack.id}-${row.rarity}`} className="rounded-xl bg-slate-800 px-3 py-2 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <span style={{ color: RARITY_COLORS[row.rarity] }}>{formatRarityLabel(row.rarity)}</span>
                              <span className="font-semibold text-white">{Number(row.probability_percent).toFixed(2)}%</span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              共 {row.card_count} 張卡，總權重 {row.total_weight}
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

      {drawStage !== 'idle' ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 px-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 bg-slate-900 p-5 shadow-2xl">
            {drawStage === 'revealed' ? (
              <button
                onClick={closeDrawModal}
                className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-slate-200 transition hover:bg-white/20"
                aria-label="關閉抽卡結果"
              >
                <X size={18} />
              </button>
            ) : null}

            {drawStage === 'opening' ? (
              <div className="flex flex-col items-center py-6 text-center">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300 animate-pulse">
                  <Sparkles size={26} />
                </div>

                <div className="relative mb-6">
                  <div className="absolute inset-0 scale-110 rounded-[26px] bg-indigo-500/25 blur-2xl" />
                  <div className="relative flex aspect-[3/4] w-56 items-center justify-center rounded-[26px] border border-indigo-300/30 bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_0_40px_rgba(129,140,248,0.35)]">
                    <div className="rounded-2xl border border-white/15 bg-slate-950/20 px-5 py-6 text-center text-white animate-pulse">
                      <ShoppingBag size={44} className="mx-auto mb-3" />
                      <p className="text-lg font-semibold">卡包開啟中</p>
                      <p className="mt-2 text-sm text-indigo-100/90">正在揭示這次抽到的卡片...</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.25s]" />
                  <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.1s]" />
                  <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-fuchsia-400" />
                </div>
              </div>
            ) : null}

            {drawStage === 'revealed' && drawResult ? (
              <div className="py-3 text-center">
                <p className="text-sm text-amber-300">抽卡完成</p>
                <h2 className="mt-2 text-2xl font-bold text-white">你抽到了新卡片</h2>
                <p className="mt-2 text-sm text-slate-400">來自 {drawResult.packName}</p>

                <div className="relative mx-auto mt-6 w-full max-w-[260px]">
                  <div
                    className="absolute inset-0 rounded-[28px] blur-2xl"
                    style={{ backgroundColor: `${drawResult.card.color || RARITY_COLORS[drawResult.card.rarity]}44` }}
                  />
                  <div
                    className="relative overflow-hidden rounded-[28px] border border-white/10 p-4 text-left shadow-2xl"
                    style={{ background: drawResult.card.color || '#1e293b' }}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-white/70">{drawResult.card.series}</p>
                        <h3 className="mt-1 text-2xl font-bold text-white">{drawResult.card.name}</h3>
                      </div>
                      <span
                        className="rounded-full px-2.5 py-1 text-xs font-semibold"
                        style={{
                          color: RARITY_COLORS[drawResult.card.rarity],
                          backgroundColor: '#0f172acc'
                        }}
                      >
                        {formatRarityLabel(drawResult.card.rarity)}
                      </span>
                    </div>

                    <div className="mb-4 flex aspect-[3/4] items-center justify-center rounded-2xl border border-white/10 bg-slate-950/20 text-center text-white">
                      <div className="px-4">
                        <Sparkles size={40} className="mx-auto mb-3 opacity-90" />
                        <p className="text-lg font-semibold">{drawResult.card.name}</p>
                      </div>
                    </div>

                    <p className="text-sm leading-6 text-white/85">
                      {drawResult.card.description || '這張卡片已加入你的收藏。'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={closeDrawModal}
                  className="mt-6 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
                >
                  收下卡片
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
