import { BookOpen, Library } from 'lucide-react'
import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/teacher/card-albums', label: '分集冊設定', icon: BookOpen },
  { to: '/teacher/cards', label: '卡牌管理', icon: Library },
]

export default function TeacherCardManagementTabs() {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium no-underline transition-colors ${
              isActive ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`
          }
        >
          <tab.icon size={16} />
          {tab.label}
        </NavLink>
      ))}
    </div>
  )
}
