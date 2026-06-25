import { useEffect, useMemo, useState } from 'react'
import { LibraryBig } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatRarityLabel, RARITY_COLORS, RARITY_ORDER } from '../lib/constants'
import { useAuthStore } from '../stores/authStore'
import type { Card, CardAlbum } from '../types'

type CardWithAlbum = Card & { album?: CardAlbum | null }

type AlbumSummary = {
  id: string
  name: string
  cover_color: string
  cards: CardWithAlbum[]
  ownedTypes: number
  totalTypes: number
  ownedCopies: number
}

function getAlbumName(card: CardWithAlbum) {
  return card.album?.name ?? card.series ?? '未分類'
}

export default function CardLibraryPage() {
  const { user } = useAuthStore()
  const [cards, setCards] = useState<CardWithAlbum[]>([])
  const [ownedCounts, setOwnedCounts] = useState<Record<string, number>>({})
  const [rarityFilter, setRarityFilter] = useState<string>('all')
  const [albumFilter, setAlbumFilter] = useState<string>('all')

  useEffect(() => {
    supabase
      .from('cards')
      .select('*, album:album_id(*)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setCards(data as CardWithAlbum[])
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

  const albumSummaries = useMemo<AlbumSummary[]>(() => {
    const groups = new Map<string, AlbumSummary>()

    cards.forEach(card => {
      const albumKey = card.album_id ?? `series:${getAlbumName(card)}`
      const existing = groups.get(albumKey)

      if (existing) {
        existing.cards.push(card)
        existing.totalTypes += 1
        if ((ownedCounts[card.id] ?? 0) > 0) existing.ownedTypes += 1
        existing.ownedCopies += Math.max(ownedCounts[card.id] ?? 0, 0)
        return
      }

      groups.set(albumKey, {
        id: albumKey,
        name: getAlbumName(card),
        cover_color: card.album?.cover_color ?? card.color ?? '#334155',
        cards: [card],
        ownedTypes: (ownedCounts[card.id] ?? 0) > 0 ? 1 : 0,
        totalTypes: 1,
        ownedCopies: Math.max(ownedCounts[card.id] ?? 0, 0)
      })
    })

    return Array.from(groups.values()).sort((left, right) => left.name.localeCompare(right.name, 'zh-Hant'))
  }, [cards, ownedCounts])

  const filteredByAlbum = useMemo(() => {
    if (albumFilter === 'all') return cards
    return cards.filter(card => (card.album_id ?? `series:${getAlbumName(card)}`) === albumFilter)
  }, [albumFilter, cards])

  const filteredCards = useMemo(() => {
    if (rarityFilter === 'all') return filteredByAlbum
    return filteredByAlbum.filter(card => card.rarity === rarityFilter)
  }, [filteredByAlbum, rarityFilter])

  const totalOwnedCopies = useMemo(
    () => Object.values(ownedCounts).reduce((sum, count) => sum + Math.max(count, 0), 0),
    [ownedCounts]
  )

  const totalOwnedTypes = useMemo(
    () => Object.values(ownedCounts).filter(count => count > 0).length,
    [ownedCounts]
  )

  const activeAlbumSummary = useMemo(() => {
    if (albumFilter === 'all') return null
    return albumSummaries.find(summary => summary.id === albumFilter) ?? null
  }, [albumFilter, albumSummaries])

  const grouped = useMemo(() => {
    return RARITY_ORDER.map(rarity => ({
      rarity,
      label: formatRarityLabel(rarity),
      color: RARITY_COLORS[rarity],
      cards: filteredCards.filter(card => card.rarity === rarity)
    })).filter(group => group.cards.length > 0)
  }, [filteredCards])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">卡牌圖鑑</h1>
        <p className="mt-1 text-sm text-slate-400">
          已收集 {totalOwnedTypes} / {cards.length} 種卡牌，總持有 {totalOwnedCopies} 張。
        </p>
      </div>

      <section className="space-y-4 rounded-2xl bg-slate-800 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">收集冊</h2>
            <p className="mt-1 text-sm text-slate-400">每本收集冊代表一個主題，學生可以逐冊查看完成進度。</p>
          </div>
          {activeAlbumSummary ? (
            <div className="rounded-xl bg-slate-900/50 px-3 py-2 text-right text-sm">
              <p className="text-white">{activeAlbumSummary.name}</p>
              <p className="text-slate-400">
                {activeAlbumSummary.ownedTypes} / {activeAlbumSummary.totalTypes} 種，{activeAlbumSummary.ownedCopies} 張
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setAlbumFilter('all')}
            className={`rounded-full border-none px-3 py-1.5 text-sm whitespace-nowrap ${
              albumFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            全部收集冊
          </button>
          {albumSummaries.map(summary => (
            <button
              key={summary.id}
              onClick={() => setAlbumFilter(summary.id)}
              className={`rounded-full border-none px-3 py-1.5 text-sm whitespace-nowrap ${
                albumFilter === summary.id ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {summary.name} {summary.ownedTypes}/{summary.totalTypes}
            </button>
          ))}
        </div>

        {albumFilter === 'all' ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {albumSummaries.map(summary => {
              const completionPercent =
                summary.totalTypes === 0 ? 0 : Math.round((summary.ownedTypes / summary.totalTypes) * 100)

              return (
                <button
                  key={summary.id}
                  onClick={() => setAlbumFilter(summary.id)}
                  className="rounded-2xl p-4 text-left transition hover:brightness-110"
                  style={{ backgroundColor: `${summary.cover_color}22` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{summary.name}</p>
                      <p className="mt-1 text-sm text-slate-300">
                        {summary.ownedTypes} / {summary.totalTypes} 種，{summary.ownedCopies} 張
                      </p>
                    </div>
                    <span className="rounded-full bg-indigo-500/10 px-2.5 py-1 text-xs text-indigo-300">
                      {completionPercent}%
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-700">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${completionPercent}%` }} />
                  </div>
                </button>
              )
            })}
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-2">
        {['all', ...RARITY_ORDER].map(rarity => (
          <button
            key={rarity}
            onClick={() => setRarityFilter(rarity)}
            className={`cursor-pointer rounded-full border-none px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
              rarityFilter === rarity ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {rarity === 'all' ? '全部稀有度' : formatRarityLabel(rarity)}
          </button>
        ))}
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-2xl bg-slate-800 py-12 text-center text-slate-500">
          <LibraryBig size={40} className="mx-auto mb-3 text-slate-600" />
          <p>這本收集冊目前沒有符合條件的卡牌。</p>
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
                    <p className="mt-1 text-[11px] text-white/70">{getAlbumName(card)}</p>
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
