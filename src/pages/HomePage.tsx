import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { Camera, Gift, TrendingUp, Sparkles } from 'lucide-react'

interface HomeData {
  cardCount: number
  achievementCount: number
  recentCards: any[]
}

export default function HomePage() {
  const { user } = useAuthStore()
  const [data, setData] = useState<HomeData>({ cardCount: 0, achievementCount: 0, recentCards: [] })

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('user_cards').select('count', { count: 'exact' }).eq('user_id', user.id),
      supabase.from('user_achievements').select('count', { count: 'exact' }).eq('user_id', user.id),
      supabase.from('user_cards').select('card:card_id(*)').eq('user_id', user.id).order('acquired_at', { ascending: false }).limit(4)
    ]).then(([cards, achievements, recent]) => {
      setData({
        cardCount: cards.count ?? 0,
        achievementCount: achievements.count ?? 0,
        recentCards: (recent.data ?? []).map((r: any) => r.card).filter(Boolean)
      })
    })
  }, [user])

  return (
    <div className="space-y-6">
      <div className="text-center py-6">
        <h1 className="text-2xl font-bold">
          歡迎回來，{user?.name}
        </h1>
        <p className="text-slate-400 mt-1">今天也要繼續收集卡牌！</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-indigo-400">{data.cardCount}</p>
          <p className="text-slate-400 text-sm">已收集卡牌</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-amber-400">{data.achievementCount}</p>
          <p className="text-slate-400 text-sm">已解鎖成就</p>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <TrendingUp size={18} className="text-indigo-400" /> 快速功能
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Link to="/scan" className="bg-slate-800 hover:bg-slate-700 rounded-xl p-4 text-center no-underline text-white transition-colors">
            <Camera size={28} className="mx-auto mb-2 text-indigo-400" />
            <p className="font-medium">掃碼領取</p>
            <p className="text-xs text-slate-400">掃描 QR Code</p>
          </Link>
          <Link to="/cards/packs" className="bg-slate-800 hover:bg-slate-700 rounded-xl p-4 text-center no-underline text-white transition-colors">
            <Gift size={28} className="mx-auto mb-2 text-amber-400" />
            <p className="font-medium">抽卡包</p>
            <p className="text-xs text-slate-400">花費星星抽卡</p>
          </Link>
        </div>
      </div>

      {data.recentCards.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Sparkles size={18} className="text-amber-400" /> 最近獲得
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {data.recentCards.map((card: any) => (
              <div
                key={card.id}
                className="flex-shrink-0 w-24 h-32 rounded-xl flex items-center justify-center text-white text-xs font-bold text-center p-2"
                style={{ backgroundColor: card.color || '#334155' }}
              >
                {card.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
