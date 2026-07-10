import { useEffect, useMemo, useState } from 'react'
import { BarChart3, BookOpen, Edit3, Library, ListChecks, Package, Server, Settings, Sparkles, Trophy, Users, Wand2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

export default function TeacherPage() {
  const { user, refreshProfile } = useAuthStore()
  const navigate = useNavigate()
  const [stats, setStats] = useState({
    cards: 0,
    tasks: 0,
    achievements: 0,
    users: 0,
    professions: 0,
    equipments: 0,
    packs: 0,
  })
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
      supabase.from('card_packs').select('count', { count: 'exact' }),
    ]).then(([cards, tasks, achievements, users, admins, professions, equipments, packs]) => {
      setStats({
        cards: cards.count ?? 0,
        tasks: tasks.count ?? 0,
        achievements: achievements.count ?? 0,
        users: users.count ?? 0,
        professions: professions.count ?? 0,
        equipments: equipments.count ?? 0,
        packs: packs.count ?? 0,
      })
      setAdminCount(admins.count ?? 0)
    })
  }, [])

  const quickLinks = useMemo(() => {
    const links = [
      { icon: Library, label: '卡牌管理', desc: '建立卡牌、上傳圖片、AI 生圖與整理卡片資料。', href: '/teacher/cards' },
      { icon: Package, label: '卡包管理', desc: '設定卡包內容、抽卡張數與卡包圖片。', href: '/teacher/packs' },
      { icon: ListChecks, label: '任務管理', desc: '建立任務、設定完成方式與每週期限制。', href: '/teacher/tasks' },
      { icon: Trophy, label: '成就管理', desc: '設定成就條件、獎勵與顯示方式。', href: '/teacher/achievements' },
      { icon: BarChart3, label: '分析資料', desc: '查看學生、任務與卡牌的整體統計。', href: '/teacher/analytics' },
      { icon: Users, label: '學生管理', desc: '管理學生資料、登入資訊與掃碼資訊。', href: '/teacher/students' },
      { icon: Wand2, label: '職業管理', desc: '設定職業效果、職業圖片與男女版本職業圖。', href: '/teacher/professions' },
      { icon: Sparkles, label: '裝備管理', desc: '建立裝備、設定效果與裝備圖片。', href: '/teacher/equipment' },
      { icon: BookOpen, label: '教師後台說明', desc: '查看各頁功能說明、AI 生圖教學與 Hugging Face 操作指南。', href: '/teacher/help' },
    ]

    if (user?.role === 'admin') {
      links.push({ icon: Server, label: '共享生圖設定', desc: '維護共享 ComfyUI Gateway、workflow 與遠端生圖設定。', href: '/teacher/ai-remote' })
      links.push({ icon: Settings, label: '系統管理', desc: '管理系統角色、教師與全站設定。', href: '/admin' })
    }

    return links
  }, [user?.role])

  const bootstrapAdmin = async () => {
    setBootstrapping(true)
    setMessage(null)
    setError(null)

    const { data, error: bootstrapError } = await supabase.rpc('bootstrap_admin_role')

    if (bootstrapError) {
      setError(bootstrapError.message)
    } else {
      setMessage(data?.[0]?.message ?? '已完成初始化，正在前往管理者頁面。')
      await refreshProfile()
      navigate('/admin')
    }

    setBootstrapping(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">教師後台</h1>
        <p className="mt-1 text-sm text-slate-400">從這裡進入卡牌、任務、職業、裝備、學生與 AI 生圖相關設定。</p>
      </div>

      {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-indigo-200">剛開始使用教師後台？</p>
            <p className="mt-1 text-sm text-indigo-100/80">建議先看一次教師後台說明頁，裡面有 Hugging Face key 申請、作者 / 模型填法、以及各頁用途整理。</p>
          </div>
          <Link to="/teacher/help" className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white no-underline hover:bg-indigo-500">
            前往教師後台說明
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-xl bg-slate-800 p-4 text-center">
          <Library size={24} className="mx-auto mb-1 text-indigo-400" />
          <p className="text-2xl font-bold text-white">{stats.cards}</p>
          <p className="text-xs text-slate-400">卡牌</p>
        </div>
        <div className="rounded-xl bg-slate-800 p-4 text-center">
          <Package size={24} className="mx-auto mb-1 text-violet-400" />
          <p className="text-2xl font-bold text-white">{stats.packs}</p>
          <p className="text-xs text-slate-400">卡包</p>
        </div>
        <div className="rounded-xl bg-slate-800 p-4 text-center">
          <ListChecks size={24} className="mx-auto mb-1 text-green-400" />
          <p className="text-2xl font-bold text-white">{stats.tasks}</p>
          <p className="text-xs text-slate-400">任務</p>
        </div>
        <div className="rounded-xl bg-slate-800 p-4 text-center">
          <Trophy size={24} className="mx-auto mb-1 text-amber-400" />
          <p className="text-2xl font-bold text-white">{stats.achievements}</p>
          <p className="text-xs text-slate-400">成就</p>
        </div>
        <div className="rounded-xl bg-slate-800 p-4 text-center">
          <Users size={24} className="mx-auto mb-1 text-blue-400" />
          <p className="text-2xl font-bold text-white">{stats.users}</p>
          <p className="text-xs text-slate-400">使用者</p>
        </div>
        <div className="rounded-xl bg-slate-800 p-4 text-center">
          <Wand2 size={24} className="mx-auto mb-1 text-fuchsia-400" />
          <p className="text-2xl font-bold text-white">{stats.professions}</p>
          <p className="text-xs text-slate-400">職業</p>
        </div>
        <div className="rounded-xl bg-slate-800 p-4 text-center">
          <Sparkles size={24} className="mx-auto mb-1 text-pink-400" />
          <p className="text-2xl font-bold text-white">{stats.equipments}</p>
          <p className="text-xs text-slate-400">裝備</p>
        </div>
      </div>

      {user?.role === 'teacher' && adminCount === 0 ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="font-medium text-amber-200">目前還沒有管理者</p>
          <p className="mt-1 text-sm text-amber-100/80">
            你可以先初始化第一位管理者，之後就能進入系統管理頁面處理權限與共用設定。
          </p>
          <button
            type="button"
            onClick={bootstrapAdmin}
            disabled={bootstrapping}
            className="mt-3 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {bootstrapping ? '初始化中...' : '成為第一位管理者'}
          </button>
        </div>
      ) : null}

      <div className="grid gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-white">
          <Sparkles size={18} className="text-indigo-400" />
          常用入口
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
