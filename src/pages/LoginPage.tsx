import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { Mail, ScanLine, Sparkles, UserRound } from 'lucide-react'

type LoginMode = 'email' | 'name' | 'scan_code'

const loginModes: Array<{ id: LoginMode; label: string; icon: typeof Mail }> = [
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'name', label: '姓名', icon: UserRound },
  { id: 'scan_code', label: '身分條碼', icon: ScanLine }
]

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loginMode, setLoginMode] = useState<LoginMode>('email')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { signIn, signUp, user } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) navigate('/')
  }, [navigate, user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (isSignUp && password.length < 6) {
      setError('密碼至少需要 6 個字元')
      return
    }

    setLoading(true)

    const err = isSignUp
      ? await signUp(identifier, password, name)
      : await signIn(identifier, password, loginMode)

    if (err) {
      setError(err)
    } else {
      navigate('/')
    }
    setLoading(false)
  }

  if (user) return null

  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Sparkles size={48} className="text-indigo-400 mx-auto mb-2" />
          <h1 className="text-2xl font-bold text-white">校園集卡牌</h1>
          <p className="text-slate-400 text-sm mt-1">收集卡片 · 完成任務 · 解鎖成就</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-800 rounded-xl p-6 space-y-4">
          {!isSignUp && (
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-900/70 p-1">
              {loginModes.map(mode => {
                const Icon = mode.icon
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => { setLoginMode(mode.id); setError(null) }}
                    className={`flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-sm transition-colors ${
                      loginMode === mode.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    <Icon size={15} />
                    {mode.label}
                  </button>
                )
              })}
            </div>
          )}
          {isSignUp && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">姓名</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 focus:border-indigo-500 outline-none"
                required
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              {isSignUp ? 'Email' : loginMode === 'email' ? 'Email' : loginMode === 'name' ? '姓名' : '身分條碼'}
            </label>
            <input
              type={isSignUp || loginMode === 'email' ? 'email' : 'text'}
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 focus:border-indigo-500 outline-none"
              placeholder={
                isSignUp
                  ? 'you@example.com'
                  : loginMode === 'email'
                    ? 'you@example.com'
                    : loginMode === 'name'
                      ? '請輸入姓名'
                      : '請掃描或輸入身分條碼'
              }
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">密碼</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 focus:border-indigo-500 outline-none"
              required
              minLength={6}
            />
            {isSignUp && <p className="text-xs text-slate-500 mt-1">至少 6 個字元</p>}
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2 font-medium disabled:opacity-50 cursor-pointer"
          >
            {loading ? '處理中...' : isSignUp ? '註冊' : '登入'}
          </button>

          <p className="text-center text-sm text-slate-400">
            {isSignUp ? '已有帳號？' : '沒有帳號？'}{' '}
            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setError(null) }}
              className="text-indigo-400 hover:underline cursor-pointer bg-transparent border-none"
            >
              {isSignUp ? '登入' : '註冊'}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
