import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Camera, Gift, Sparkles, TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { Announcement } from '../types'

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
  const [announcements, setAnnouncements] = useState<Announcement[]>([])

  useEffect(() => {
    if (!user) return

    const loadHomeData = async () => {
      const [cards, achievements, recent] = await Promise.all([
        supabase.from('user_cards').select('count', { count: 'exact' }).eq('user_id', user.id),
        supabase.from('user_achievements').select('count', { count: 'exact' }).eq('user_id', user.id),
        supabase
          .from('user_cards')
          .select('card:card_id(id, name, color)')
          .eq('user_id', user.id)
          .order('acquired_at', { ascending: false })
          .limit(4)
      ])

      setData({
        cardCount: cards.count ?? 0,
        achievementCount: achievements.count ?? 0,
        recentCards: (recent.data ?? []).map((row: any) => row.card).filter(Boolean)
      })
    }

    const loadAnnouncements = async () => {
      const { data, error } = await supabase.rpc('get_home_announcements')
      if (!error && data) {
        setAnnouncements(data as Announcement[])
      }
    }

    void Promise.all([loadHomeData(), loadAnnouncements()])

    const channel = supabase
      .channel(`home-announcements-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
        void loadAnnouncements()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id])

  return (
    <div className="space-y-6">
      <div className="py-6 text-center">
        <h1 className="text-2xl font-bold text-white">歡迎回來，{user?.name}</h1>
        <p className="mt-1 text-slate-400">今天也來累積點數、完成任務、收集新卡片。</p>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-800 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
          <Bell size={18} className="text-amber-400" /> 最新公告
        </h2>

        {announcements.length === 0 ? (
          <p className="rounded-xl bg-slate-900/40 px-4 py-6 text-center text-sm text-slate-500">
            目前還沒有公告。
          </p>
        ) : (
          <div className="space-y-3">
            {announcements.map(item => (
              <div key={item.id} className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          item.category === 'task'
                            ? 'bg-indigo-500/10 text-indigo-300'
                            : 'bg-amber-500/10 text-amber-300'
                        }`}
                      >
                        {item.category === 'task' ? '任務公告' : '系統公告'}
                      </span>
                      {item.is_pinned ? (
                        <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-300">
                          置頂
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-2 font-semibold text-white">{item.title}</h3>
                  </div>
                  <span className="text-xs text-slate-500">
                    {new Date(item.created_at).toLocaleDateString('zh-TW')}
                  </span>
                </div>

                <p className="mt-2 text-sm leading-6 text-slate-300">{item.body}</p>
              </div>
            ))}
          </div>
        )}
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
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
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
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
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
