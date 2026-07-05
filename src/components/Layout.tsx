import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  BookOpen,
  Camera,
  CreditCard,
  LayoutDashboard,
  Library,
  ListChecks,
  LogOut,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Server,
  Sword,
  Trophy,
  UserCircle,
  Users,
  Wand2,
} from 'lucide-react'
import { ROLE_LABELS, formatRarityLabel } from '../lib/constants'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { DrawAnnouncement } from '../types'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '首頁', roles: ['student', 'leader', 'teacher', 'admin'] },
  { to: '/cards', icon: Library, label: '卡牌圖鑑', roles: ['student', 'leader', 'teacher', 'admin'] },
  { to: '/cards/mine', icon: CreditCard, label: '我的牌庫', roles: ['student', 'leader', 'teacher', 'admin'] },
  { to: '/cards/packs', icon: ShoppingBag, label: '商店', roles: ['student', 'leader', 'teacher', 'admin'] },
  { to: '/tasks', icon: ListChecks, label: '任務', roles: ['student', 'leader', 'teacher', 'admin'] },
  { to: '/character', icon: Sword, label: '角色', roles: ['student', 'leader', 'teacher', 'admin'] },
  { to: '/guide', icon: BookOpen, label: '遊戲說明', roles: ['student', 'leader', 'teacher', 'admin'] },
  { to: '/scan', icon: Camera, label: '掃碼工作站', roles: ['leader', 'teacher', 'admin'] },
  { to: '/achievements', icon: Trophy, label: '成就', roles: ['student', 'leader', 'teacher', 'admin'] },
  { to: '/trades', icon: ArrowLeftRight, label: '交換', roles: ['student', 'leader', 'teacher', 'admin'] },
  { to: '/leader', icon: ShieldCheck, label: '幹部面板', roles: ['leader', 'teacher', 'admin'] },
  { to: '/teacher/tasks', icon: Sparkles, label: '任務管理', roles: ['leader', 'teacher', 'admin'] },
  { to: '/teacher/students', icon: Users, label: '學生條碼', roles: ['teacher', 'admin'] },
  { to: '/teacher/professions', icon: Wand2, label: '職業後台', roles: ['teacher', 'admin'] },
  { to: '/teacher/equipment', icon: ShoppingBag, label: '裝備後台', roles: ['teacher', 'admin'] },
  { to: '/teacher/ai-remote', icon: Server, label: '共享生圖', roles: ['teacher', 'admin'] },
  { to: '/teacher', icon: Sparkles, label: '教師後台', roles: ['teacher', 'admin'] },
  { to: '/admin', icon: Settings, label: '管理者', roles: ['admin'] },
]

export default function Layout() {
  const { user, signOut, hasRole } = useAuthStore()
  const navigate = useNavigate()
  const [announcements, setAnnouncements] = useState<DrawAnnouncement[]>([])
  const visibleNavItems = navItems.filter(item => hasRole(...(item.roles as any)))

  const marqueeItems = useMemo(() => {
    if (announcements.length === 0) return []
    return [...announcements, ...announcements]
  }, [announcements])

  useEffect(() => {
    if (!user) return

    const loadAnnouncements = async () => {
      const { data, error } = await supabase.rpc('get_active_draw_announcements')
      if (!error && data) {
        setAnnouncements(data as DrawAnnouncement[])
      }
    }

    void loadAnnouncements()

    const channel = supabase
      .channel('draw-announcements-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draw_announcements' }, () => {
        void loadAnnouncements()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id])

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth')
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2 text-lg font-bold text-indigo-400 no-underline">
            <Sparkles size={24} />
            <span>校園集卡牌</span>
          </NavLink>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="flex items-center gap-1 text-sm font-medium text-amber-400">
                  <Star size={16} fill="currentColor" /> {user.stars}
                </span>
                <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-400">
                  {ROLE_LABELS[user.role]}
                </span>
                <NavLink to="/profile" className="text-slate-400 hover:text-white">
                  <UserCircle size={22} />
                </NavLink>
                <button type="button" onClick={handleSignOut} className="cursor-pointer text-slate-400 hover:text-red-400">
                  <LogOut size={18} />
                </button>
              </>
            ) : null}
          </div>
        </div>

        {announcements.length > 0 ? (
          <div className="overflow-hidden border-t border-amber-500/20 bg-amber-500/10">
            <div className="flex min-w-max items-center gap-4 py-2 text-sm" style={{ animation: 'marquee-scroll 28s linear infinite' }}>
              {marqueeItems.map((announcement, index) => (
                <div
                  key={`${announcement.id}-${index}`}
                  className="flex items-center gap-2 rounded-full border border-white/5 bg-slate-900/60 px-3 py-1.5 text-slate-100"
                >
                  <Sparkles size={14} className="text-amber-300" />
                  <span className="whitespace-nowrap">
                    {announcement.display_name} 抽中
                    <span className="mx-1 font-semibold" style={{ color: announcement.card_color }}>
                      {announcement.card_name}
                    </span>
                    {formatRarityLabel(announcement.rarity)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </header>

      <aside className="fixed bottom-0 left-0 top-[98px] z-40 hidden w-56 border-r border-slate-800 bg-slate-900 lg:block">
        <nav className="space-y-1 p-3">
          {visibleNavItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm no-underline transition-colors ${
                  isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 pb-24 lg:ml-56 lg:max-w-5xl">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-800 bg-slate-900 lg:hidden">
        <div className="mx-auto flex max-w-3xl overflow-x-auto px-2 py-1">
          {visibleNavItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex min-w-[56px] flex-col items-center gap-0.5 px-2.5 py-2 text-xs no-underline transition-colors ${
                  isActive ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'
                }`
              }
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
