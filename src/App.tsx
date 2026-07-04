import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { useAuthStore } from './stores/authStore'
import AchievementsPage from './pages/AchievementsPage'
import AdminPage from './pages/AdminPage'
import CardLibraryPage from './pages/CardLibraryPage'
import CharacterPage from './pages/CharacterPage'
import GuidePage from './pages/GuidePage'
import HomePage from './pages/HomePage'
import LeaderPage from './pages/LeaderPage'
import LoginPage from './pages/LoginPage'
import MyCardsPage from './pages/MyCardsPage'
import ProfilePage from './pages/ProfilePage'
import ScanPage from './pages/ScanPage'
import ScanStationPage from './pages/ScanStationPage'
import ShopPage from './pages/ShopPage'
import TasksPage from './pages/TasksPage'
import TeacherAchievementsPage from './pages/TeacherAchievementsPage'
import TeacherCardAlbumsPage from './pages/TeacherCardAlbumsPage'
import TeacherCardsPage from './pages/TeacherCardsPage'
import TeacherEquipmentPage from './pages/TeacherEquipmentPage'
import TeacherPage from './pages/TeacherPage'
import TeacherProfessionsPage from './pages/TeacherProfessionsPage'
import TeacherAnalyticsPage from './pages/TeacherAnalyticsPage'
import TeacherPacksPage from './pages/TeacherPacksPage'
import TeacherStudentsPage from './pages/TeacherStudentsPage'
import TeacherTasksPage from './pages/TeacherTasksPage'
import TradesPage from './pages/TradesPage'

function LoadingScreen() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <p className="text-slate-400">載入中...</p>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()

  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/auth" replace />
  return <>{children}</>
}

function RoleRoute({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const { user, loading, hasRole } = useAuthStore()

  if (loading) return <LoadingScreen />
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
        <p className="text-slate-400">初始化中...</p>
      </div>
    )
  }

  if (configError) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-900 px-4">
        <div className="max-w-sm text-center">
          <p className="mb-4 text-4xl">!</p>
          <h1 className="mb-2 text-xl font-bold text-white">Supabase 設定尚未完成</h1>
          <p className="mb-4 text-sm text-slate-400">
            請確認 GitHub Secrets 或本機環境變數已設定
            <code className="mx-1 text-indigo-400">VITE_SUPABASE_URL</code>
            和
            <code className="mx-1 text-indigo-400">VITE_SUPABASE_ANON_KEY</code>。
          </p>
          <a
            href="https://github.com/ttneway/cards-collection/settings/secrets/actions"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white no-underline hover:bg-indigo-500"
          >
            前往 GitHub Secrets
          </a>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/auth" element={<LoginPage />} />
      <Route path="/claim" element={<ScanPage />} />
      <Route path="/kiosk" element={<ScanPage />} />
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
        <Route path="achievements" element={<AchievementsPage />} />
        <Route path="character" element={<CharacterPage />} />
        <Route path="guide" element={<GuidePage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="trades" element={<TradesPage />} />

        <Route
          path="scan"
          element={
            <RoleRoute roles={['leader', 'teacher', 'admin']}>
              <ScanStationPage />
            </RoleRoute>
          }
        />

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
          path="teacher/card-albums"
          element={
            <RoleRoute roles={['teacher', 'admin']}>
              <TeacherCardAlbumsPage />
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
          path="teacher/packs"
          element={
            <RoleRoute roles={['teacher', 'admin']}>
              <TeacherPacksPage />
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
          path="teacher/analytics"
          element={
            <RoleRoute roles={['teacher', 'admin']}>
              <TeacherAnalyticsPage />
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
          path="teacher/professions"
          element={
            <RoleRoute roles={['teacher', 'admin']}>
              <TeacherProfessionsPage />
            </RoleRoute>
          }
        />

        <Route
          path="teacher/equipment"
          element={
            <RoleRoute roles={['teacher', 'admin']}>
              <TeacherEquipmentPage />
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
