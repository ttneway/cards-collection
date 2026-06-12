import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { User, Star, Trophy, CreditCard, LogOut } from 'lucide-react'
import { ROLE_LABELS } from '../lib/constants'
import { useNavigate } from 'react-router-dom'

export default function ProfilePage() {
  const { user, signOut } = useAuthStore()
  const navigate = useNavigate()
  const [stats, setStats] = useState({ cards: 0, achievements: 0, tasks: 0 })

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('user_cards').select('count', { count: 'exact' }).eq('user_id', user.id),
      supabase.from('user_achievements').select('count', { count: 'exact' }).eq('user_id', user.id),
      supabase.from('task_completions').select('count', { count: 'exact' }).eq('user_id', user.id)
    ]).then(([cards, achievements, tasks]) => {
      setStats({
        cards: cards.count ?? 0,
        achievements: achievements.count ?? 0,
        tasks: tasks.count ?? 0
      })
    })
  }, [user])

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth')
  }

  if (!user) return null

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 rounded-xl p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-indigo-600/30 flex items-center justify-center mx-auto mb-3">
          <User size={32} className="text-indigo-400" />
        </div>
        <h1 className="text-xl font-bold">{user.name}</h1>
        <p className="text-slate-400 text-sm">{user.email}</p>
        <span className="inline-block mt-2 text-xs bg-slate-700 text-slate-300 px-3 py-1 rounded-full">
          {ROLE_LABELS[user.role]}
        </span>
      </div>

      <div className="bg-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-2">
          <Star size={20} className="text-amber-400" fill="currentColor" />
          <span className="text-lg font-bold">{user.stars}</span>
          <span className="text-sm text-slate-400">星星</span>
        </div>
        {user.student_id && (
          <p className="text-sm text-slate-400">學號: {user.student_id}</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800 rounded-xl p-4 text-center">
          <CreditCard size={20} className="mx-auto mb-1 text-indigo-400" />
          <p className="text-xl font-bold">{stats.cards}</p>
          <p className="text-xs text-slate-400">卡片</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 text-center">
          <Trophy size={20} className="mx-auto mb-1 text-amber-400" />
          <p className="text-xl font-bold">{stats.achievements}</p>
          <p className="text-xs text-slate-400">成就</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 text-center">
          <Star size={20} className="mx-auto mb-1 text-green-400" />
          <p className="text-xl font-bold">{stats.tasks}</p>
          <p className="text-xs text-slate-400">任務</p>
        </div>
      </div>

      <button
        onClick={handleSignOut}
        className="w-full bg-slate-800 hover:bg-red-900/30 text-red-400 rounded-xl p-4 font-medium flex items-center justify-center gap-2 cursor-pointer border-none"
      >
        <LogOut size={18} /> 登出
      </button>
    </div>
  )
}
