import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreditCard, LogOut, Star, Trophy, User } from 'lucide-react'
import BarcodeLabel from '../components/BarcodeLabel'
import { ROLE_LABELS } from '../lib/constants'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

interface TransactionRow {
  id: string
  amount: number
  description: string
  created_at: string
}

export default function ProfilePage() {
  const { user, signOut, refreshProfile } = useAuthStore()
  const navigate = useNavigate()
  const [stats, setStats] = useState({ cards: 0, achievements: 0, tasks: 0 })
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [privacyMessage, setPrivacyMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return

    Promise.all([
      supabase.from('user_cards').select('count', { count: 'exact' }).eq('user_id', user.id),
      supabase.from('user_achievements').select('count', { count: 'exact' }).eq('user_id', user.id),
      supabase.from('task_completions').select('count', { count: 'exact' }).eq('user_id', user.id),
      supabase
        .from('transactions')
        .select('id, amount, description, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)
    ]).then(([cards, achievements, tasks, tx]) => {
      setStats({
        cards: cards.count ?? 0,
        achievements: achievements.count ?? 0,
        tasks: tasks.count ?? 0
      })
      setTransactions((tx.data ?? []) as TransactionRow[])
    })
  }, [user])

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth')
  }

  const handleAnnouncementPrivacyChange = async (checked: boolean) => {
    if (!user || savingPrivacy) return

    setSavingPrivacy(true)
    setPrivacyMessage(null)

    const { error } = await supabase
      .from('profiles')
      .update({ hide_high_rarity_announcements: checked })
      .eq('id', user.id)

    if (error) {
      setPrivacyMessage(error.message)
      setSavingPrivacy(false)
      return
    }

    await refreshProfile()
    setPrivacyMessage(checked ? '之後抽到 SSR 以上卡片時，公告會隱藏你的姓名。' : '之後抽到 SSR 以上卡片時，公告會顯示你的姓名。')
    setSavingPrivacy(false)
  }

  if (!user) return null

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-slate-800 p-6 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600/30">
          <User size={32} className="text-indigo-400" />
        </div>
        <h1 className="text-xl font-bold text-white">{user.name}</h1>
        <p className="mt-1 text-sm text-slate-400">{user.email}</p>
        <span className="mt-2 inline-block rounded-full bg-slate-700 px-3 py-1 text-xs text-slate-300">
          {ROLE_LABELS[user.role]}
        </span>
      </div>

      <div className="rounded-2xl bg-slate-800 p-4">
        <div className="mb-2 flex items-center gap-3">
          <Star size={20} className="text-amber-400" fill="currentColor" />
          <span className="text-lg font-bold">{user.stars}</span>
          <span className="text-sm text-slate-400">星星</span>
        </div>
        {user.student_id ? (
          <p className="text-sm text-slate-400">學號：{user.student_id}</p>
        ) : null}
      </div>

      <BarcodeLabel value={user.scan_code} label="我的身分條碼" />

      <div className="rounded-2xl bg-slate-800 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">抽卡公告設定</h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              抽到 SSR 或 UR 卡片時，系統會在畫面上方公告一天。你可以選擇是否隱藏姓名。
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-full bg-slate-700 px-3 py-2 text-sm text-white">
            <input
              type="checkbox"
              checked={user.hide_high_rarity_announcements}
              disabled={savingPrivacy}
              onChange={event => void handleAnnouncementPrivacyChange(event.target.checked)}
              className="h-4 w-4 accent-indigo-500"
            />
            <span>隱藏姓名</span>
          </label>
        </div>

        {privacyMessage ? <p className="mt-3 text-sm text-indigo-300">{privacyMessage}</p> : null}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-slate-800 p-4 text-center">
          <CreditCard size={20} className="mx-auto mb-1 text-indigo-400" />
          <p className="text-xl font-bold">{stats.cards}</p>
          <p className="text-xs text-slate-400">卡片</p>
        </div>
        <div className="rounded-2xl bg-slate-800 p-4 text-center">
          <Trophy size={20} className="mx-auto mb-1 text-amber-400" />
          <p className="text-xl font-bold">{stats.achievements}</p>
          <p className="text-xs text-slate-400">成就</p>
        </div>
        <div className="rounded-2xl bg-slate-800 p-4 text-center">
          <Star size={20} className="mx-auto mb-1 text-green-400" />
          <p className="text-xl font-bold">{stats.tasks}</p>
          <p className="text-xs text-slate-400">任務</p>
        </div>
      </div>

      <button
        onClick={handleSignOut}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-none bg-slate-800 p-4 font-medium text-red-400 hover:bg-red-900/30"
      >
        <LogOut size={18} /> 登出
      </button>

      <div className="rounded-2xl bg-slate-800 p-4">
        <h2 className="mb-3 font-semibold text-white">最近點數紀錄</h2>
        {transactions.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">目前還沒有點數異動。</p>
        ) : (
          <div className="space-y-2">
            {transactions.map(tx => (
              <div key={tx.id} className="flex justify-between gap-3 rounded-xl bg-slate-700/50 px-3 py-2">
                <div>
                  <p className="text-sm text-white">{tx.description}</p>
                  <p className="text-xs text-slate-400">{new Date(tx.created_at).toLocaleString()}</p>
                </div>
                <span className={tx.amount >= 0 ? 'font-semibold text-amber-400' : 'font-semibold text-red-400'}>
                  {tx.amount >= 0 ? '+' : ''}
                  {tx.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
