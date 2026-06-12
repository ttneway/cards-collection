import { create } from 'zustand'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import type { Profile, Role } from '../types'

interface AuthState {
  user: Profile | null
  loading: boolean
  initialized: boolean
  configError: boolean
  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, name: string) => Promise<string | null>
  signOut: () => Promise<void>
  hasRole: (...roles: Role[]) => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  initialized: false,
  configError: !isSupabaseConfigured,

  initialize: async () => {
    if (!isSupabaseConfigured) {
      set({ loading: false, initialized: true, configError: true })
      return
    }

    const getProfile = async (userId: string) => {
      let { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (!profile) {
        const { data: user } = await supabase.auth.getUser()
        if (user?.user) {
          const newProfile = {
            id: userId,
            email: user.user.email ?? '',
            name: user.user.user_metadata?.name ?? user.user.email?.split('@')[0] ?? '使用者',
            role: 'student' as const,
            stars: 0
          }
          await supabase.from('profiles').insert(newProfile)
          profile = newProfile
        }
      }

      return profile
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const profile = await getProfile(session.user.id)
      set({ user: profile, loading: false, initialized: true })
    } else {
      set({ loading: false, initialized: true })
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const profile = await getProfile(session.user.id)
        set({ user: profile })
      } else {
        set({ user: null })
      }
    })
  },

  signIn: async (email, password) => {
    if (!isSupabaseConfigured) return 'Supabase 未設定'
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error?.message ?? null
  },

  signUp: async (email, password, name) => {
    if (!isSupabaseConfigured) return 'Supabase 未設定'
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } }
    })
    if (error) return error.message
    return null
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null })
  },

  hasRole: (...roles: Role[]) => {
    const { user } = get()
    if (!user) return false
    return roles.includes(user.role)
  }
}))
