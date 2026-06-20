import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  Camera,
  CreditCard,
  LayoutDashboard,
  Library,
  LogOut,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Trophy,
  UserCircle,
  Users,
  ListChecks
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { ROLE_LABELS } from '../lib/constants'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '首頁', roles: ['student', 'leader', 'teacher', 'admin'] },
  { to: '/cards', icon: Library, label: '卡牌圖鑑', roles: ['student', 'leader', 'teacher', 'admin'] },
  { to: '/cards/mine', icon: CreditCard, label: '我的牌庫', roles: ['student', 'leader', 'teacher', 'admin'] },
  { to: '/cards/packs', icon: ShoppingBag, label: '商店', roles: ['student', 'leader', 'teacher', 'admin'] },
  { to: '/tasks', icon: ListChecks, label: '任務', roles: ['student', 'leader', 'teacher', 'admin'] },
  { to: '/scan', icon: Camera, label: '發點', roles: ['leader', 'teacher', 'admin'] },
  { to: '/achievements', icon: Trophy, label: '成就', roles: ['student', 'leader', 'teacher', 'admin'] },
  { to: '/trades', icon: ArrowLeftRight, label: '交換', roles: ['student', 'leader', 'teacher', 'admin'] },
  { to: '/leader', icon: ShieldCheck, label: '幹部面板', roles: ['leader', 'teacher', 'admin'] },
  { to: '/teacher/tasks', icon: Sparkles, label: '任務管理', roles: ['leader', 'teacher', 'admin'] },
  { to: '/teacher/students', icon: Users, label: '學生條碼', roles: ['teacher', 'admin'] },
  { to: '/teacher', icon: Sparkles, label: '教師後台', roles: ['teacher', 'admin'] },
  { to: '/admin', icon: Settings, label: '管理者', roles: ['admin'] }
]

export default function Layout() {
  const { user, signOut, hasRole } = useAuthStore()
  const navigate = useNavigate()
  const visibleNavItems = navItems.filter(item => hasRole(...(item.roles as any)))

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth')
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3">
        <NavLink to="/" className="flex items-center gap-2 text-lg font-bold text-indigo-400 no-underline">
          <Sparkles size={24} />
          <span>校園集卡牌</span>
        </NavLink>

        <div className="flex items-center gap-3">
          {user && (
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
          )}
        </div>
      </header>

      <aside className="fixed bottom-0 left-0 top-[57px] z-40 hidden w-56 border-r border-slate-800 bg-slate-900 lg:block">
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
