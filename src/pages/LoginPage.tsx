import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { Sparkles } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { signIn, signUp, user } = useAuthStore()
  const navigate = useNavigate()

  if (user) {
    navigate('/')
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const err = isSignUp
      ? await signUp(email, password, name)
      : await signIn(email, password)

    if (err) setError(err)
    else navigate('/')
    setLoading(false)
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Sparkles size={48} className="text-indigo-400 mx-auto mb-2" />
          <h1 className="text-2xl font-bold text-white">校園集卡牌</h1>
          <p className="text-slate-400 text-sm mt-1">收集卡片 · 完成任務 · 解鎖成就</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-800 rounded-xl p-6 space-y-4">
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
            <label className="block text-sm text-slate-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600 focus:border-indigo-500 outline-none"
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
            />
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
