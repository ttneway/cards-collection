import { NavLink, useNavigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { ROLE_LABELS } from '../lib/constants'
import {
  LayoutDashboard, CreditCard, Library, ShoppingBag,
  ListChecks, Camera, Trophy, ArrowLeftRight,
  UserCircle, ShieldCheck, LogOut, Sparkles, Star
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '首頁', roles: ['student', 'leader', 'teacher'] },
  { to: '/cards', icon: Library, label: '卡牌圖鑑', roles: ['student', 'leader', 'teacher'] },
  { to: '/cards/mine', icon: CreditCard, label: '我的牌庫', roles: ['student', 'leader', 'teacher'] },
  { to: '/cards/packs', icon: ShoppingBag, label: '商店', roles: ['student', 'leader', 'teacher'] },
  { to: '/tasks', icon: ListChecks, label: '任務', roles: ['student', 'leader', 'teacher'] },
  { to: '/scan', icon: Camera, label: '掃碼', roles: ['student', 'leader', 'teacher'] },
  { to: '/achievements', icon: Trophy, label: '成就', roles: ['student', 'leader', 'teacher'] },
  { to: '/trades', icon: ArrowLeftRight, label: '交換', roles: ['student', 'leader', 'teacher'] },
  { to: '/leader', icon: ShieldCheck, label: '幹部面板', roles: ['leader', 'teacher'] },
  { to: '/teacher', icon: Sparkles, label: '教師後台', roles: ['teacher'] },
]

export default function Layout() {
  const { user, signOut, hasRole } = useAuthStore()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth')
  }

  return (
    <div className="flex flex-col min-h-dvh">
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <NavLink to="/" className="flex items-center gap-2 text-indigo-400 font-bold text-lg no-underline">
          <Sparkles size={24} />
          <span>集卡牌</span>
        </NavLink>
        <div className="flex items-center gap-3">
          {user && (
            <>
              <span className="flex items-center gap-1 text-amber-400 text-sm font-medium">
                <Star size={16} fill="currentColor" /> {user.stars}
              </span>
              <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded-full">
                {ROLE_LABELS[user.role]}
              </span>
              <NavLink to="/profile" className="text-slate-400 hover:text-white">
                <UserCircle size={22} />
              </NavLink>
              <button onClick={handleSignOut} className="text-slate-400 hover:text-red-400 cursor-pointer">
                <LogOut size={18} />
              </button>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-24 max-w-3xl w-full mx-auto">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 z-50">
        <div className="flex overflow-x-auto px-2 py-1 max-w-3xl mx-auto">
          {navItems
            .filter(item => hasRole(...item.roles as any))
            .map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 px-2.5 py-2 text-xs no-underline min-w-[56px] transition-colors ${
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


