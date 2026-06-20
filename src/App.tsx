import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { useAuthStore } from './stores/authStore'
import AchievementsPage from './pages/AchievementsPage'
import AdminPage from './pages/AdminPage'
import CardLibraryPage from './pages/CardLibraryPage'
import HomePage from './pages/HomePage'
import LeaderPage from './pages/LeaderPage'
import LoginPage from './pages/LoginPage'
import MyCardsPage from './pages/MyCardsPage'
import ProfilePage from './pages/ProfilePage'
import ScanPage from './pages/ScanPage'
import ScanStationPage from './pages/ScanStationPage'
import ShopPage from './pages/ShopPage'
import TasksPage from './pages/TasksPage'
import TeacherPage from './pages/TeacherPage'
import TeacherCardsPage from './pages/TeacherCardsPage'
import TeacherStudentsPage from './pages/TeacherStudentsPage'
import TeacherAchievementsPage from './pages/TeacherAchievementsPage'
import TeacherTasksPage from './pages/TeacherTasksPage'
import TradesPage from './pages/TradesPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><p>載入中...</p></div>
  }

  if (!user) return <Navigate to="/auth" replace />
  return <>{children}</>
}

function RoleRoute({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const { user, loading, hasRole } = useAuthStore()

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><p>載入中...</p></div>
  }

  if (!user) return <Navigate to="/auth" replace />
  if (!roles.some(role => hasRole(role as any))) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const { initialize, initialized, configError } = useAuthStore()

  useEffect(() => {
    void initialize()
  }, [initialize])

  if (!initialized) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-900">
        <p className="text-slate-400">載入中...</p>
      </div>
    )
  }

  if (configError) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-900 px-4">
        <div className="max-w-sm text-center">
          <p className="mb-4 text-4xl">!</p>
          <h1 className="mb-2 text-xl font-bold text-white">系統設定尚未完成</h1>
          <p className="mb-4 text-sm text-slate-400">
            Supabase 環境變數缺失。<br />
            請在 GitHub Secrets 設定 <code className="text-indigo-400">VITE_SUPABASE_URL</code> 與{' '}
            <code className="text-indigo-400">VITE_SUPABASE_ANON_KEY</code>。
          </p>
          <a
            href="https://github.com/ttneway/cards-collection/settings/secrets/actions"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white no-underline hover:bg-indigo-500"
          >
            前往設定 Secrets
          </a>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/auth" element={<LoginPage />} />
      <Route path="/claim" element={<ScanPage />} />
      <Route path="/scan/camera" element={<ScanPage />} />

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

        <Route
          path="scan"
          element={
            <RoleRoute roles={['leader', 'teacher', 'admin']}>
              <ScanStationPage />
            </RoleRoute>
          }
        />

        <Route path="achievements" element={<AchievementsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="trades" element={<TradesPage />} />

        <Route
          path="leader"
          element={
            <RoleRoute roles={['leader', 'teacher', 'admin']}>
              <LeaderPage />
            </RoleRoute>
          }
        />

        <Route
          path="teacher"
          element={
            <RoleRoute roles={['teacher', 'admin']}>
              <TeacherPage />
            </RoleRoute>
          }
        />

        <Route
          path="teacher/cards"
          element={
            <RoleRoute roles={['teacher', 'admin']}>
              <TeacherCardsPage />
            </RoleRoute>
          }
        />

        <Route
          path="teacher/tasks"
          element={
            <RoleRoute roles={['leader', 'teacher', 'admin']}>
              <TeacherTasksPage />
            </RoleRoute>
          }
        />

        <Route
          path="teacher/achievements"
          element={
            <RoleRoute roles={['teacher', 'admin']}>
              <TeacherAchievementsPage />
            </RoleRoute>
          }
        />

        <Route
          path="teacher/students"
          element={
            <RoleRoute roles={['teacher', 'admin']}>
              <TeacherStudentsPage />
            </RoleRoute>
          }
        />

        <Route
          path="admin"
          element={
            <RoleRoute roles={['admin']}>
              <AdminPage />
            </RoleRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
