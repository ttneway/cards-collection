import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, Gift, Sparkles, TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

interface HomeData {
  cardCount: number
  achievementCount: number
  recentCards: Array<{
    id: string
    name: string
    color: string | null
  }>
}

export default function HomePage() {
  const { user } = useAuthStore()
  const [data, setData] = useState<HomeData>({ cardCount: 0, achievementCount: 0, recentCards: [] })

  useEffect(() => {
    if (!user) return

    Promise.all([
      supabase.from('user_cards').select('count', { count: 'exact' }).eq('user_id', user.id),
      supabase.from('user_achievements').select('count', { count: 'exact' }).eq('user_id', user.id),
      supabase
        .from('user_cards')
        .select('card:card_id(id, name, color)')
        .eq('user_id', user.id)
        .order('acquired_at', { ascending: false })
        .limit(4)
    ]).then(([cards, achievements, recent]) => {
      setData({
        cardCount: cards.count ?? 0,
        achievementCount: achievements.count ?? 0,
        recentCards: (recent.data ?? []).map((row: any) => row.card).filter(Boolean)
      })
    })
  }, [user])

  return (
    <div className="space-y-6">
      <div className="py-6 text-center">
        <h1 className="text-2xl font-bold text-white">歡迎回來，{user?.name}</h1>
        <p className="mt-1 text-slate-400">今天也來累積點數、完成任務、收集新卡片。</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-slate-800 p-4 text-center">
          <p className="text-3xl font-bold text-indigo-400">{data.cardCount}</p>
          <p className="mt-1 text-sm text-slate-400">已收集卡片</p>
        </div>
        <div className="rounded-2xl bg-slate-800 p-4 text-center">
          <p className="text-3xl font-bold text-amber-400">{data.achievementCount}</p>
          <p className="mt-1 text-sm text-slate-400">已解鎖成就</p>
        </div>
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <TrendingUp size={18} className="text-indigo-400" /> 常用功能
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <Link
            to={user?.role === 'student' ? '/profile' : '/scan'}
            className="rounded-2xl bg-slate-800 p-4 text-center text-white no-underline transition-colors hover:bg-slate-700"
          >
            <Camera size={28} className="mx-auto mb-2 text-indigo-400" />
            <p className="font-medium">{user?.role === 'student' ? '查看身分條碼' : '掃碼工作站'}</p>
            <p className="mt-1 text-xs text-slate-400">{user?.role === 'student' ? '快速出示個人條碼' : '掃任務碼與學生條碼發點'}</p>
          </Link>

          <Link
            to="/cards/packs"
            className="rounded-2xl bg-slate-800 p-4 text-center text-white no-underline transition-colors hover:bg-slate-700"
          >
            <Gift size={28} className="mx-auto mb-2 text-amber-400" />
            <p className="font-medium">抽卡商店</p>
            <p className="mt-1 text-xs text-slate-400">使用星星抽卡，擴充你的收藏</p>
          </Link>
        </div>
      </div>

      {data.recentCards.length > 0 ? (
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Sparkles size={18} className="text-amber-400" /> 最近獲得
          </h2>

          <div className="flex gap-3 overflow-x-auto pb-2">
            {data.recentCards.map(card => (
              <div
                key={card.id}
                className="flex h-32 w-24 flex-shrink-0 items-center justify-center rounded-2xl p-2 text-center text-xs font-bold text-white"
                style={{ backgroundColor: card.color || '#334155' }}
              >
                {card.name}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
