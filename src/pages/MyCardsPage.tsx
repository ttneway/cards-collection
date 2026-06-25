import { useEffect, useMemo, useState } from 'react'
import { CreditCard } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatRarityLabel, RARITY_COLORS, RARITY_ORDER } from '../lib/constants'
import { useAuthStore } from '../stores/authStore'
import type { Card, UserCard } from '../types'

type OwnedCardRow = UserCard & { card: Card }

type AlbumOwnedSummary = {
  name: string
  rows: OwnedCardRow[]
  totalCopies: number
}

export default function MyCardsPage() {
  const { user } = useAuthStore()
  const [userCards, setUserCards] = useState<OwnedCardRow[]>([])
  const [albumFilter, setAlbumFilter] = useState<string>('all')
  const [rarityFilter, setRarityFilter] = useState<string>('all')

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

  const albumSummaries = useMemo<AlbumOwnedSummary[]>(() => {
    const groups = new Map<string, OwnedCardRow[]>()

    userCards.forEach(row => {
      const albumName = row.card.series || '未分類'
      const rows = groups.get(albumName) ?? []
      rows.push(row)
      groups.set(albumName, rows)
    })

    return Array.from(groups.entries())
      .map(([name, rows]) => ({
        name,
        rows,
        totalCopies: rows.reduce((sum, row) => sum + Math.max(row.count ?? 0, 0), 0)
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hant'))
  }, [userCards])

  const filteredByAlbum = useMemo(() => {
    if (albumFilter === 'all') return userCards
    return userCards.filter(row => (row.card.series || '未分類') === albumFilter)
  }, [albumFilter, userCards])

  const filteredCards = useMemo(() => {
    if (rarityFilter === 'all') return filteredByAlbum
    return filteredByAlbum.filter(row => row.card.rarity === rarityFilter)
  }, [filteredByAlbum, rarityFilter])

  const activeAlbum = useMemo(() => {
    if (albumFilter === 'all') return null
    return albumSummaries.find(item => item.name === albumFilter) ?? null
  }, [albumFilter, albumSummaries])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">我的牌庫</h1>
        <p className="mt-1 text-sm text-slate-400">
          共 {totalCopies} 張卡片，包含 {userCards.length} 種不同卡牌。
        </p>
      </div>

      {albumSummaries.length > 0 ? (
        <section className="space-y-4 rounded-2xl bg-slate-800 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">收集冊</h2>
              <p className="mt-1 text-sm text-slate-400">切換不同主題冊，查看各冊的收藏狀況與重複數量。</p>
            </div>
            {activeAlbum ? (
              <div className="rounded-xl bg-slate-900/50 px-3 py-2 text-right text-sm">
                <p className="text-white">{activeAlbum.name}</p>
                <p className="text-slate-400">
                  {activeAlbum.rows.length} 種，{activeAlbum.totalCopies} 張
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
                key={summary.name}
                onClick={() => setAlbumFilter(summary.name)}
                className={`rounded-full border-none px-3 py-1.5 text-sm whitespace-nowrap ${
                  albumFilter === summary.name ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {summary.name} {summary.rows.length} 種 / {summary.totalCopies} 張
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {userCards.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {['all', ...RARITY_ORDER].map(rarity => (
            <button
              key={rarity}
              onClick={() => setRarityFilter(rarity)}
              className={`rounded-full border-none px-3 py-1.5 text-sm whitespace-nowrap ${
                rarityFilter === rarity ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {rarity === 'all' ? '全部稀有度' : formatRarityLabel(rarity)}
            </button>
          ))}
        </div>
      ) : null}

      {filteredCards.length === 0 ? (
        <div className="rounded-2xl bg-slate-800 py-12 text-center text-slate-500">
          <CreditCard size={40} className="mx-auto mb-3 text-slate-600" />
          <p>{userCards.length === 0 ? '你還沒有抽到任何卡片。' : '這本收集冊目前沒有符合篩選條件的卡片。'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filteredCards.map(row => (
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
