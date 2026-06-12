import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Sparkles, Library, ListChecks, Trophy, Users, Edit3 } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function TeacherPage() {
  const [stats, setStats] = useState({ cards: 0, tasks: 0, achievements: 0, users: 0 })

  useEffect(() => {
    Promise.all([
      supabase.from('cards').select('count', { count: 'exact' }),
      supabase.from('tasks').select('count', { count: 'exact' }),
      supabase.from('achievements').select('count', { count: 'exact' }),
      supabase.from('profiles').select('count', { count: 'exact' })
    ]).then(([cards, tasks, achievements, users]) => {
      setStats({
        cards: cards.count ?? 0,
        tasks: tasks.count ?? 0,
        achievements: achievements.count ?? 0,
        users: users.count ?? 0
      })
    })
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">教師後台</h1>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800 rounded-xl p-4 text-center">
          <Library size={24} className="mx-auto mb-1 text-indigo-400" />
          <p className="text-2xl font-bold">{stats.cards}</p>
          <p className="text-xs text-slate-400">卡牌</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 text-center">
          <ListChecks size={24} className="mx-auto mb-1 text-green-400" />
          <p className="text-2xl font-bold">{stats.tasks}</p>
          <p className="text-xs text-slate-400">任務</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 text-center">
          <Trophy size={24} className="mx-auto mb-1 text-amber-400" />
          <p className="text-2xl font-bold">{stats.achievements}</p>
          <p className="text-xs text-slate-400">成就</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 text-center">
          <Users size={24} className="mx-auto mb-1 text-blue-400" />
          <p className="text-2xl font-bold">{stats.users}</p>
          <p className="text-xs text-slate-400">學生</p>
        </div>
      </div>

      <div className="grid gap-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Sparkles size={18} className="text-indigo-400" /> 管理功能
        </h2>

        {[
          { icon: Library, label: '管理卡牌', desc: '新增/編輯/刪除卡牌', href: '/teacher/cards' },
          { icon: ListChecks, label: '管理任務', desc: '發布任務、產生任務碼', href: '/teacher/tasks' },
          { icon: Trophy, label: '管理成就', desc: '設定成就條件與獎勵', href: '/teacher/achievements' },
          { icon: Users, label: '管理班級', desc: '班級設定、指派幹部', href: '/teacher/classes' },
        ].map(item => (
          <Link
            key={item.href}
            to={item.href}
            className="bg-slate-800 hover:bg-slate-700 rounded-xl p-4 flex items-center gap-4 no-underline text-white transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-indigo-600/20 flex items-center justify-center">
              <item.icon size={20} className="text-indigo-400" />
            </div>
            <div className="flex-1">
              <p className="font-medium">{item.label}</p>
              <p className="text-xs text-slate-400">{item.desc}</p>
            </div>
            <Edit3 size={18} className="text-slate-500" />
          </Link>
        ))}
      </div>
    </div>
  )
}
