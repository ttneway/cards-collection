import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import CardLibraryPage from './pages/CardLibraryPage'
import MyCardsPage from './pages/MyCardsPage'
import ShopPage from './pages/ShopPage'
import TasksPage from './pages/TasksPage'
import ScanPage from './pages/ScanPage'
import AchievementsPage from './pages/AchievementsPage'
import ProfilePage from './pages/ProfilePage'
import TradesPage from './pages/TradesPage'
import LeaderPage from './pages/LeaderPage'
import TeacherPage from './pages/TeacherPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()
  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><p>載入中...</p></div>
  if (!user) return <Navigate to="/auth" replace />
  return <>{children}</>
}

function RoleRoute({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const { user, loading, hasRole } = useAuthStore()
  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><p>載入中...</p></div>
  if (!user) return <Navigate to="/auth" replace />
  if (!roles.some(r => hasRole(r as any))) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const { initialize, initialized } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  if (!initialized) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-slate-900">
        <p className="text-slate-400">載入中...</p>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/auth" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="cards" element={<CardLibraryPage />} />
        <Route path="cards/mine" element={<MyCardsPage />} />
        <Route path="cards/packs" element={<ShopPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="scan" element={<ScanPage />} />
        <Route path="achievements" element={<AchievementsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="trades" element={<TradesPage />} />
        <Route
          path="leader"
          element={
            <RoleRoute roles={['leader', 'teacher']}>
              <LeaderPage />
            </RoleRoute>
          }
        />
        <Route
          path="teacher"
          element={
            <RoleRoute roles={['teacher']}>
              <TeacherPage />
            </RoleRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
