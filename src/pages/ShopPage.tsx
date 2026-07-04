import { useEffect, useMemo, useRef, useState } from 'react'
import { ShoppingBag, Sparkles, Star, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatRarityLabel, RARITY_COLORS, RARITY_ORDER } from '../lib/constants'
import { useAuthStore } from '../stores/authStore'
import type { Card, CardPack, PackRarityOdds } from '../types'

type DrawStage = 'idle' | 'opening' | 'revealed'

type DrawMode = 1 | 10 | 20

interface DrawResult {
  cards: Card[]
  packName: string
  openCount: number
}

const DRAW_OPTIONS: Array<{ count: DrawMode; label: string }> = [
  { count: 1, label: '1 抽' },
  { count: 10, label: '10 連' },
  { count: 20, label: '20 連' },
]

export default function ShopPage() {
  const { user, refreshProfile } = useAuthStore()
  const [packs, setPacks] = useState<CardPack[]>([])
  const [oddsRows, setOddsRows] = useState<PackRarityOdds[]>([])
  const [buying, setBuying] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [drawStage, setDrawStage] = useState<DrawStage>('idle')
  const [drawResult, setDrawResult] = useState<DrawResult | null>(null)
  const [continuousPackId, setContinuousPackId] = useState<string | null>(null)
  const stopContinuousRef = useRef(false)

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
    const { data } = await supabase.from('card_packs').select('*').eq('is_active', true).order('created_at', { ascending: false })
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

  const fetchDrawnCards = async (cardIds: string[]) => {
    const { data, error } = await supabase.from('cards').select('*').in('id', cardIds)
    if (error || !data) {
      throw new Error(error?.message || '抽卡完成，但讀取卡片資料失敗。')
    }

    const cardMap = new Map(data.map(card => [card.id, card as Card]))
    const orderedCards = cardIds.map(id => cardMap.get(id)).filter(Boolean) as Card[]
    if (orderedCards.length !== cardIds.length) {
      throw new Error('抽卡完成，但有部分卡片資料讀取失敗。')
    }

    return orderedCards
  }

  const openPack = async (pack: CardPack, openCount: number) => {
    if (!user) throw new Error('請先登入。')

    const { data, error } = await supabase.rpc('purchase_pack_multi', {
      p_user_id: user.id,
      p_pack_id: pack.id,
      p_purchase_count: openCount,
    })

    if (error) throw error

    const drawnCardIds = (data ?? []) as string[]
    if (drawnCardIds.length === 0) {
      throw new Error('抽卡完成，但沒有收到卡片結果。')
    }

    const cards = await fetchDrawnCards(drawnCardIds)
    await refreshProfile()

    return cards
  }

  const buyPack = async (pack: CardPack, mode: DrawMode) => {
    if (!user || buying || continuousPackId) return

    setMessage(null)
    setBuying(`${pack.id}:${mode}`)
    setDrawStage('opening')
    setDrawResult(null)

    try {
      const cards = await openPack(pack, mode)

      window.setTimeout(() => {
        setDrawResult({
          cards,
          packName: pack.name,
          openCount: mode,
        })
        setDrawStage('revealed')
      }, 1200)
    } catch (error: any) {
      setDrawStage('idle')
      setDrawResult(null)
      setMessage(error?.message || '抽卡失敗，請稍後再試。')
    } finally {
      setBuying(null)
    }
  }

  const startContinuousDraw = async (pack: CardPack) => {
    if (!user || buying || continuousPackId) return

    stopContinuousRef.current = false
    setContinuousPackId(pack.id)
    setMessage(null)
    setDrawStage('opening')
    setDrawResult(null)

    const allCards: Card[] = []
    let openCount = 0

    try {
      while (!stopContinuousRef.current) {
        if ((user?.stars ?? 0) < pack.cost && openCount === 0) {
          throw new Error('星星不足。')
        }

        const cards = await openPack(pack, 1)
        allCards.push(...cards)
        openCount += 1

        setDrawResult({
          cards: [...allCards],
          packName: pack.name,
          openCount,
        })

        await loadPacks()
      }

      setDrawStage('revealed')
    } catch (error: any) {
      setMessage(error?.message || '連續抽卡已停止。')
      if (allCards.length > 0) {
        setDrawStage('revealed')
        setDrawResult({
          cards: [...allCards],
          packName: pack.name,
          openCount,
        })
      } else {
        setDrawStage('idle')
        setDrawResult(null)
      }
    } finally {
      stopContinuousRef.current = false
      setContinuousPackId(null)
    }
  }

  const stopContinuousDraw = () => {
    stopContinuousRef.current = true
  }

  return (
    <>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold">抽卡商店</h1>
          <p className="mt-1 text-sm text-slate-400">可單抽、10 連、20 連，或持續開包直到你手動停止。</p>
        </div>

        {message ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{message}</div>
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
                (left, right) => RARITY_ORDER.indexOf(left.rarity) - RARITY_ORDER.indexOf(right.rarity),
              )
              const cardsPerOpen = pack.cards_per_open ?? 1
              const isContinuousRunning = continuousPackId === pack.id

              return (
                <div key={pack.id} className="rounded-2xl border border-slate-700 bg-slate-800 p-4 shadow-lg">
                  <div className="flex items-start gap-4">
                    <div className="flex h-24 w-20 items-center justify-center rounded-2xl border border-indigo-400/20 bg-indigo-900/40 text-indigo-300">
                      <ShoppingBag size={32} />
                    </div>

                    <div className="flex-1">
                      <h3 className="font-semibold text-white">{pack.name}</h3>
                      <p className="text-sm text-slate-400">{pack.description || '神秘卡包，打開看看今天的手氣。'}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                        <div className="flex items-center gap-1 font-medium text-amber-400">
                          <Star size={14} fill="currentColor" />
                          <span>{pack.cost} 星星 / 次</span>
                        </div>
                        <span className="text-sky-300">每次開包 {cardsPerOpen} 張</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {DRAW_OPTIONS.map(option => {
                      const totalCost = pack.cost * option.count
                      const activeKey = `${pack.id}:${option.count}`
                      return (
                        <button
                          key={option.count}
                          onClick={() => void buyPack(pack, option.count)}
                          disabled={Boolean(buying) || Boolean(continuousPackId) || (user?.stars ?? 0) < totalCost}
                          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                        >
                          {buying === activeKey ? '開包中...' : `${option.label} (${totalCost} 星星)`}
                        </button>
                      )
                    })}

                    <button
                      onClick={() => (isContinuousRunning ? stopContinuousDraw() : void startContinuousDraw(pack))}
                      disabled={Boolean(buying) || (Boolean(continuousPackId) && !isContinuousRunning)}
                      className={`rounded-xl px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500 ${
                        isContinuousRunning ? 'bg-rose-600 hover:bg-rose-500' : 'bg-violet-600 hover:bg-violet-500'
                      }`}
                    >
                      {isContinuousRunning ? '停止連續抽' : '連續抽'}
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
                            <p className="mt-1 text-xs text-slate-500">共 {row.card_count} 張卡，總權重 {row.total_weight}</p>
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
          <div className="relative w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/10 bg-slate-900 p-5 shadow-2xl">
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
              <div className="flex flex-col items-center py-10 text-center">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300 animate-pulse">
                  <Sparkles size={26} />
                </div>
                <div className="relative mb-6">
                  <div className="absolute inset-0 scale-110 rounded-[26px] bg-indigo-500/25 blur-2xl" />
                  <div className="relative flex aspect-[3/4] w-56 items-center justify-center rounded-[26px] border border-indigo-300/30 bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_0_40px_rgba(129,140,248,0.35)]">
                    <div className="rounded-2xl border border-white/15 bg-slate-950/20 px-5 py-6 text-center text-white animate-pulse">
                      <ShoppingBag size={44} className="mx-auto mb-3" />
                      <p className="text-lg font-semibold">{continuousPackId ? '連續抽卡中' : '卡包開啟中'}</p>
                      <p className="mt-2 text-sm text-indigo-100/90">{continuousPackId ? '持續開包中，按停止即可結算。' : '正在揭示這次抽到的卡片...'}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {drawStage === 'revealed' && drawResult ? (
              <div className="py-3">
                <div className="text-center">
                  <p className="text-sm text-amber-300">抽卡完成</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">你開了 {drawResult.openCount} 次卡包</h2>
                  <p className="mt-2 text-sm text-slate-400">
                    來自 {drawResult.packName} · 共取得 {drawResult.cards.length} 張卡
                  </p>
                </div>

                <div className="mt-6 grid max-h-[65vh] gap-4 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-4">
                  {drawResult.cards.map((card, index) => (
                    <div
                      key={`${card.id}-${index}`}
                      className="overflow-hidden rounded-[24px] border border-white/10 p-4 shadow-xl"
                      style={{ background: card.color || '#1e293b' }}
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-white/70">{card.series}</p>
                          <h3 className="mt-1 text-lg font-bold text-white">{card.name}</h3>
                        </div>
                        <span
                          className="rounded-full px-2.5 py-1 text-xs font-semibold"
                          style={{
                            color: RARITY_COLORS[card.rarity],
                            backgroundColor: '#0f172acc',
                          }}
                        >
                          {formatRarityLabel(card.rarity)}
                        </span>
                      </div>

                      <div className="mb-4 flex aspect-[3/4] items-center justify-center rounded-2xl border border-white/10 bg-slate-950/20 text-center text-white">
                        {card.image_url ? (
                          <img src={card.image_url} alt={card.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="px-4">
                            <Sparkles size={36} className="mx-auto mb-3 opacity-90" />
                            <p className="text-base font-semibold">{card.name}</p>
                          </div>
                        )}
                      </div>

                      <p className="text-sm leading-6 text-white/85">{card.description || '這張卡片已加入你的收藏。'}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 text-center">
                  <button
                    onClick={closeDrawModal}
                    className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
                  >
                    收下卡片
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
