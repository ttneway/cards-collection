import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

type StudentRoster = {
  id: string
  auth_user_id: string | null
  name: string
  student_no: string
  email: string | null
  role: 'student' | 'leader'
  title: string | null
  class_id: string | null
  scan_code: string
  points: number
}

function buildManagedEmail(roster: StudentRoster) {
  const base = roster.student_no
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const fallback = base || `student-${roster.id.slice(0, 8)}`
  return `${fallback}-${roster.id.slice(0, 8)}@managed.cards.local`
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const authHeader = request.headers.get('Authorization') ?? ''

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error('Supabase Edge Function 缺少必要環境變數。')
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey)

    const {
      data: { user },
      error: authError
    } = await userClient.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: '請先登入教師或管理者帳號。' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: actorProfile, error: actorError } = await adminClient
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle()

    if (actorError || !actorProfile || !['teacher', 'admin'].includes(actorProfile.role)) {
      return new Response(JSON.stringify({ error: '只有教師或管理者可以建立學生登入帳號。' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { rosterId, password } = await request.json()

    if (!rosterId || typeof rosterId !== 'string') {
      return new Response(JSON.stringify({ error: '缺少學生名冊 ID。' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!password || typeof password !== 'string' || password.trim().length < 6) {
      return new Response(JSON.stringify({ error: '初始密碼至少需要 6 個字元。' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: roster, error: rosterError } = await adminClient
      .from('student_rosters')
      .select('id, auth_user_id, name, student_no, email, role, title, class_id, scan_code, points')
      .eq('id', rosterId)
      .maybeSingle()

    if (rosterError || !roster) {
      return new Response(JSON.stringify({ error: '找不到這位學生名冊資料。' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const managedRoster = roster as StudentRoster
    const normalizedEmail = (managedRoster.email?.trim().toLowerCase() || buildManagedEmail(managedRoster))

    let authUserId = managedRoster.auth_user_id
    let action: 'created' | 'updated' = 'updated'

    if (authUserId) {
      const { data: updated, error: updateError } = await adminClient.auth.admin.updateUserById(authUserId, {
        email: normalizedEmail,
        password: password.trim(),
        email_confirm: true,
        user_metadata: {
          name: managedRoster.name,
          title: managedRoster.title,
          managed_student: true,
          roster_id: managedRoster.id,
          student_no: managedRoster.student_no
        }
      })

      if (updateError || !updated.user) {
        authUserId = null
      }
    }

    if (!authUserId) {
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        password: password.trim(),
        email_confirm: true,
        user_metadata: {
          name: managedRoster.name,
          title: managedRoster.title,
          managed_student: true,
          roster_id: managedRoster.id,
          student_no: managedRoster.student_no
        },
        app_metadata: {
          provider: 'email',
          providers: ['email']
        }
      })

      if (createError || !created.user) {
        return new Response(JSON.stringify({ error: createError?.message ?? '建立登入帳號失敗。' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      authUserId = created.user.id
      action = 'created'
    }

    const profilePayload = {
      id: authUserId,
      email: normalizedEmail,
      name: managedRoster.name,
      student_id: managedRoster.student_no,
      role: managedRoster.role,
      title: managedRoster.title,
      class_id: managedRoster.class_id,
      stars: action === 'created' ? managedRoster.points : undefined,
      avatar_url: null,
      scan_code: managedRoster.scan_code,
      hide_high_rarity_announcements: false
    }

    const { error: profileError } = await adminClient.from('profiles').upsert(profilePayload)
    if (profileError) {
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { error: rosterUpdateError } = await adminClient
      .from('student_rosters')
      .update({
        auth_user_id: authUserId,
        email: normalizedEmail
      })
      .eq('id', managedRoster.id)

    if (rosterUpdateError) {
      return new Response(JSON.stringify({ error: rosterUpdateError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(
      JSON.stringify({
        action,
        user_id: authUserId,
        email: normalizedEmail,
        message:
          action === 'created'
            ? '已建立學生登入帳號。學生現在可用 Email、姓名或身分條碼搭配密碼登入。'
            : '已更新學生登入資料與初始密碼。'
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : '建立學生登入帳號失敗。'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
