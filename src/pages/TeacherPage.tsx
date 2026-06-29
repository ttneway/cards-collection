import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Edit3, Library, ListChecks, Settings, Sparkles, Trophy, Users, Wand2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

export default function TeacherPage() {
  const { user, refreshProfile } = useAuthStore()
  const navigate = useNavigate()
  const [stats, setStats] = useState({ cards: 0, tasks: 0, achievements: 0, users: 0, professions: 0, equipments: 0 })
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
      supabase.from('profiles').select('count', { count: 'exact' }).eq('role', 'admin'),
      supabase.from('profession_templates').select('count', { count: 'exact' }),
      supabase.from('equipment_templates').select('count', { count: 'exact' }),
    ]).then(([cards, tasks, achievements, users, admins, professions, equipments]) => {
      setStats({
        cards: cards.count ?? 0,
        tasks: tasks.count ?? 0,
        achievements: achievements.count ?? 0,
        users: users.count ?? 0,
        professions: professions.count ?? 0,
        equipments: equipments.count ?? 0,
      })
      setAdminCount(admins.count ?? 0)
    })
  }, [])

  const quickLinks = useMemo(() => {
    const links = [
      { icon: Library, label: '卡牌管理', desc: '建立卡牌、收集冊與展示內容', href: '/teacher/cards' },
      { icon: ListChecks, label: '任務管理', desc: '設定任務、條碼與發點規則', href: '/teacher/tasks' },
      { icon: Trophy, label: '成就管理', desc: '設定成就條件與獎勵', href: '/teacher/achievements' },
      { icon: BarChart3, label: '統計分析', desc: '查看班級、任務與學生個人報表', href: '/teacher/analytics' },
      { icon: Users, label: '學生與條碼', desc: '管理班級、學生帳號與列印條碼', href: '/teacher/students' },
      { icon: Wand2, label: '職業管理', desc: '建立遊戲職業與被動能力參數', href: '/teacher/professions' },
      { icon: Sparkles, label: '裝備管理', desc: '建立裝備模板、商店售價與發放', href: '/teacher/equipment' },
    ]

    if (user?.role === 'admin') {
      links.push({ icon: Settings, label: '管理者', desc: '管理教師與高權限帳號', href: '/admin' })
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
      setMessage(data?.[0]?.message ?? '已成功成為第一位管理者')
      await refreshProfile()
      navigate('/admin')
    }

    setBootstrapping(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">教師後台</h1>
        <p className="mt-1 text-sm text-slate-400">在這裡集中管理任務、學生、卡牌、職業與裝備。</p>
      </div>

      {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
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
        <div className="rounded-xl bg-slate-800 p-4 text-center">
          <Wand2 size={24} className="mx-auto mb-1 text-violet-400" />
          <p className="text-2xl font-bold">{stats.professions}</p>
          <p className="text-xs text-slate-400">職業模板</p>
        </div>
        <div className="rounded-xl bg-slate-800 p-4 text-center">
          <Sparkles size={24} className="mx-auto mb-1 text-pink-400" />
          <p className="text-2xl font-bold">{stats.equipments}</p>
          <p className="text-xs text-slate-400">裝備模板</p>
        </div>
      </div>

      {user?.role === 'teacher' && adminCount === 0 ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="font-medium text-amber-200">系統目前還沒有管理者</p>
          <p className="mt-1 text-sm text-amber-100/80">
            你可以先把自己升級成第一位管理者，之後再由管理者負責高權限帳號管理。
          </p>
          <button
            type="button"
            onClick={bootstrapAdmin}
            disabled={bootstrapping}
            className="mt-3 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {bootstrapping ? '處理中...' : '成為第一位管理者'}
          </button>
        </div>
      ) : null}

      <div className="grid gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-white">
          <Sparkles size={18} className="text-indigo-400" /> 快速入口
        </h2>

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
