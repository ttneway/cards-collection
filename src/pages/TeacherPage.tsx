import { useEffect, useMemo, useState } from 'react'
import { Edit3, Library, ListChecks, Settings, Sparkles, Trophy, Users } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

export default function TeacherPage() {
  const { user, refreshProfile } = useAuthStore()
  const navigate = useNavigate()
  const [stats, setStats] = useState({ cards: 0, tasks: 0, achievements: 0, users: 0 })
  const [adminCount, setAdminCount] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bootstrapping, setBootstrapping] = useState(false)

  useEffect(() => {
    void Promise.all([
      supabase.from('cards').select('count', { count: 'exact' }),
      supabase.from('tasks').select('count', { count: 'exact' }),
      supabase.from('achievements').select('count', { count: 'exact' }),
      supabase.from('profiles').select('count', { count: 'exact' }),
      supabase.from('profiles').select('count', { count: 'exact' }).eq('role', 'admin')
    ]).then(([cards, tasks, achievements, users, admins]) => {
      setStats({
        cards: cards.count ?? 0,
        tasks: tasks.count ?? 0,
        achievements: achievements.count ?? 0,
        users: users.count ?? 0
      })
      setAdminCount(admins.count ?? 0)
    })
  }, [])

  const quickLinks = useMemo(() => {
    const links = [
      { icon: Library, label: '管理卡牌', desc: '新增、編輯、刪除卡牌', href: '/teacher/cards' },
      { icon: ListChecks, label: '管理任務', desc: '發布任務、產生任務碼', href: '/teacher/tasks' },
      { icon: Trophy, label: '管理成就', desc: '設定成就條件與獎勵', href: '/teacher/achievements' },
      { icon: Users, label: '學生與條碼', desc: '角色、職稱、身分碼與列印', href: '/teacher/students' }
    ]

    if (user?.role === 'admin') {
      links.push({ icon: Settings, label: '管理者後台', desc: '管理教師、管理者與高權限設定', href: '/admin' })
    }

    return links
  }, [user?.role])

  const bootstrapAdmin = async () => {
    setBootstrapping(true)
    setMessage(null)
    setError(null)

    const { data, error } = await supabase.rpc('bootstrap_admin_role')

    if (error) {
      setError(error.message)
    } else {
      setMessage(data?.[0]?.message ?? '管理者權限已啟用')
      await refreshProfile()
      navigate('/admin')
    }

    setBootstrapping(false)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">教師後台</h1>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-800 p-4 text-center">
          <Library size={24} className="mx-auto mb-1 text-indigo-400" />
          <p className="text-2xl font-bold">{stats.cards}</p>
          <p className="text-xs text-slate-400">卡牌</p>
        </div>
        <div className="rounded-xl bg-slate-800 p-4 text-center">
          <ListChecks size={24} className="mx-auto mb-1 text-green-400" />
          <p className="text-2xl font-bold">{stats.tasks}</p>
          <p className="text-xs text-slate-400">任務</p>
        </div>
        <div className="rounded-xl bg-slate-800 p-4 text-center">
          <Trophy size={24} className="mx-auto mb-1 text-amber-400" />
          <p className="text-2xl font-bold">{stats.achievements}</p>
          <p className="text-xs text-slate-400">成就</p>
        </div>
        <div className="rounded-xl bg-slate-800 p-4 text-center">
          <Users size={24} className="mx-auto mb-1 text-blue-400" />
          <p className="text-2xl font-bold">{stats.users}</p>
          <p className="text-xs text-slate-400">帳號</p>
        </div>
      </div>

      <div className="grid gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles size={18} className="text-indigo-400" /> 管理入口
        </h2>

        {user?.role === 'teacher' && adminCount === 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="font-medium text-amber-200">系統目前還沒有管理者</p>
            <p className="mt-1 text-sm text-amber-100/80">
              你可以先把自己升級成第一位管理者，之後再由管理者負責高權限帳號管理。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={bootstrapAdmin}
                disabled={bootstrapping}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400 disabled:opacity-50"
              >
                {bootstrapping ? '啟用中...' : '成為第一位管理者'}
              </button>
              {message && <span className="self-center text-sm text-green-300">{message}</span>}
              {error && <span className="self-center text-sm text-red-300">{error}</span>}
            </div>
          </div>
        )}

        {quickLinks.map(item => (
          <Link
            key={item.href}
            to={item.href}
            className="flex items-center gap-4 rounded-xl bg-slate-800 p-4 text-white no-underline transition-colors hover:bg-slate-700"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600/20">
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
