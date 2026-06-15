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
  refreshProfile: () => Promise<void>
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

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const profile = await getOrCreateProfile(session.user.id)
        set({ user: profile, loading: false, initialized: true })
      } else {
        set({ loading: false, initialized: true })
      }
    } catch (e) {
      console.error('初始化失敗:', e)
      set({ loading: false, initialized: true })
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const profile = await getOrCreateProfile(session.user.id)
        set({ user: profile })
      } else {
        set({ user: null })
      }
    })
  },

  signIn: async (email, password) => {
    if (!isSupabaseConfigured) return 'Supabase 未設定'
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return error.message
      if (data?.user) {
        const profile = await getOrCreateProfile(data.user.id)
        set({ user: profile })
      }
      return null
    } catch (e: any) {
      return e?.message || '登入失敗'
    }
  },

  signUp: async (email, password, name) => {
    if (!isSupabaseConfigured) return 'Supabase 未設定'
    const { error } = await supabase.auth.signUp({
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
  },

  refreshProfile: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const profile = await getOrCreateProfile(session.user.id)
      set({ user: profile })
    }
  }
}))

async function getOrCreateProfile(userId: string): Promise<Profile | null> {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('查詢 profile 失敗:', error.message)
    }

    if (profile) return profile as Profile

    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) return null

    const newProfile: Profile = {
      id: userId,
      email: userData.user.email ?? '',
      name: userData.user.user_metadata?.name ?? userData.user.email?.split('@')[0] ?? '使用者',
      role: 'student',
      stars: 0,
      class_id: null,
      student_id: null,
      avatar_url: null,
      created_at: new Date().toISOString()
    }

    const { error: insertError } = await supabase.from('profiles').insert(newProfile)
    if (insertError) {
      console.error('建立 profile 失敗:', insertError.message)
      return null
    }
    return newProfile
  } catch (e) {
    console.error('getOrCreateProfile 錯誤:', e)
    return null
  }
}
