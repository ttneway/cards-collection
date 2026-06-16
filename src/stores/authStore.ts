import { create } from 'zustand'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import type { Profile, Role } from '../types'

let profileChannel: ReturnType<typeof supabase.channel> | null = null
type LoginMode = 'email' | 'name' | 'scan_code'

interface AuthState {
  user: Profile | null
  loading: boolean
  initialized: boolean
  configError: boolean
  initialize: () => Promise<void>
  signIn: (identifier: string, password: string, mode?: LoginMode) => Promise<string | null>
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
        subscribeToProfileChanges(profile.id, set)
      } else {
        set({ loading: false, initialized: true })
        unsubscribeFromProfileChanges()
      }
    } catch (e) {
      console.error('初始化失敗:', e)
      set({ loading: false, initialized: true })
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        try {
          const profile = await getOrCreateProfile(session.user.id)
          set({ user: profile })
          subscribeToProfileChanges(profile.id, set)
        } catch (e) {
          console.error('更新登入狀態失敗:', e)
          set({ user: null })
          unsubscribeFromProfileChanges()
        }
      } else {
        set({ user: null })
        unsubscribeFromProfileChanges()
      }
    })
  },

  signIn: async (identifier, password, mode = 'email') => {
    if (!isSupabaseConfigured) return 'Supabase 未設定'
    try {
      const email = mode === 'email'
        ? identifier.trim()
        : await resolveLoginIdentifier(identifier, mode)
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return error.message
      if (data?.user) {
        const profile = await getOrCreateProfile(data.user.id)
        set({ user: profile })
        subscribeToProfileChanges(profile.id, set)
        return null
      }
      return '登入失敗，請確認帳號或密碼是否正確'
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
    unsubscribeFromProfileChanges()
  },

  hasRole: (...roles: Role[]) => {
    const { user } = get()
    if (!user) return false
    return roles.includes(user.role)
  },

  refreshProfile: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      try {
        const profile = await getOrCreateProfile(session.user.id)
        set({ user: profile })
        subscribeToProfileChanges(profile.id, set)
      } catch (e) {
        console.error('更新 profile 失敗:', e)
        set({ user: null })
        unsubscribeFromProfileChanges()
      }
    }
  }
}))

function subscribeToProfileChanges(userId: string, set: (state: Partial<AuthState>) => void) {
  unsubscribeFromProfileChanges()
  profileChannel = supabase
    .channel(`profile-stars-${userId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
      payload => {
        set({ user: payload.new as Profile })
      }
    )
    .subscribe()
}

function unsubscribeFromProfileChanges() {
  if (profileChannel) {
    supabase.removeChannel(profileChannel)
    profileChannel = null
  }
}

async function getOrCreateProfile(userId: string): Promise<Profile> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`查詢使用者資料失敗：${error.message}`)
  }

  if (profile) return profile as Profile

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) {
    throw new Error(`取得登入使用者失敗：${userError.message}`)
  }
  if (!userData?.user) {
    throw new Error('登入成功，但無法取得登入使用者資料。')
  }

  const newProfile = {
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

  const { data: insertedProfile, error: insertError } = await supabase
    .from('profiles')
    .insert(newProfile)
    .select('*')
    .single()
  if (insertError) {
    throw new Error(`建立使用者資料失敗：${insertError.message}`)
  }
  return insertedProfile as Profile
}

async function resolveLoginIdentifier(identifier: string, mode: LoginMode): Promise<string> {
  const value = identifier.trim()
  if (!value) {
    throw new Error('請先輸入登入資訊')
  }

  const { data, error } = await supabase.rpc('resolve_login_identifier', {
    p_identifier: value,
    p_mode: mode
  })

  if (error) {
    throw new Error(error.message)
  }

  const resolvedEmail = data?.[0]?.email as string | undefined
  if (!resolvedEmail) {
    throw new Error('找不到可登入的帳號')
  }

  return resolvedEmail
}
