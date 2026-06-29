import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STYLE_PROMPTS: Record<string, string> = {
  'Q版校園奇幻':
    'Create a polished chibi fantasy campus illustration with bright lighting, clear silhouette, collectible-card friendly composition, soft depth, clean outlines, and a premium mobile game reward feeling.',
  '校徽 / 徽章式收藏卡風':
    'Create a clean badge-style collectible illustration inspired by school crests and medal emblems, centered composition, elegant decorative framing, readable shapes, and premium collectible card presentation.',
}

type CardRow = {
  id: string
  name: string
  rarity: string
  description: string | null
  series: string | null
  album_id: string | null
  image_url: string | null
  image_prompt: string | null
  image_style: string | null
  image_storage_path: string | null
  color: string | null
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildPrompt(card: CardRow, albumName: string | null, imageStyle: string, imagePrompt: string | null) {
  const stylePrompt = STYLE_PROMPTS[imageStyle] ?? STYLE_PROMPTS['Q版校園奇幻']
  const albumLabel = albumName ?? card.series ?? '校園收藏卡'
  const customPrompt = imagePrompt?.trim() ? `Additional teacher direction: ${imagePrompt.trim()}` : ''
  const description = card.description?.trim() ? `Card description: ${card.description.trim()}` : ''

  return [
    stylePrompt,
    `Design artwork for a school collectible card.`,
    `Card name: ${card.name}.`,
    `Album or collection theme: ${albumLabel}.`,
    `Card rarity: ${card.rarity}.`,
    `Main accent color: ${card.color ?? '#334155'}.`,
    description,
    customPrompt,
    'Avoid text, watermarks, UI, speech bubbles, and borders inside the illustration.',
    'Focus on one clear subject that matches the album theme and feels suitable for a campus card game.',
  ]
    .filter(Boolean)
    .join(' ')
}

function decodeBase64Image(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const openAiApiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
    const authHeader = request.headers.get('Authorization') ?? ''

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error('Supabase Edge Function 缺少必要環境變數。')
    }

    if (!openAiApiKey) {
      return new Response(
        JSON.stringify({
          error: '尚未設定 OPENAI_API_KEY，請先在 Supabase Edge Function Secrets 中加入後再生成卡圖。',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey)

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: '請先登入教師或管理者帳號。' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: actorProfile, error: actorError } = await adminClient
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle()

    if (actorError || !actorProfile || !['teacher', 'admin'].includes(actorProfile.role)) {
      return new Response(JSON.stringify({ error: '只有教師或管理者可以生成卡圖。' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { cardId, imagePrompt, imageStyle } = await request.json()

    if (!cardId || typeof cardId !== 'string') {
      return new Response(JSON.stringify({ error: '缺少卡片 ID。' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: card, error: cardError } = await adminClient
      .from('cards')
      .select('id, name, rarity, description, series, album_id, image_url, image_prompt, image_style, image_storage_path, color')
      .eq('id', cardId)
      .maybeSingle()

    if (cardError || !card) {
      return new Response(JSON.stringify({ error: '找不到要生成圖片的卡片。' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let albumName: string | null = null
    if (card.album_id) {
      const { data: album } = await adminClient.from('card_albums').select('name').eq('id', card.album_id).maybeSingle()
      albumName = album?.name ?? null
    }

    const nextStyle = typeof imageStyle === 'string' && imageStyle.trim() ? imageStyle.trim() : card.image_style ?? 'Q版校園奇幻'
    const nextPrompt = typeof imagePrompt === 'string' ? imagePrompt.trim() : card.image_prompt ?? ''
    const finalPrompt = buildPrompt(card as CardRow, albumName, nextStyle, nextPrompt)

    const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: finalPrompt,
        size: '1024x1024',
      }),
    })

    const imagePayload = await imageResponse.json()
    if (!imageResponse.ok) {
      const message = imagePayload?.error?.message ?? 'OpenAI 生成卡圖失敗。'
      return new Response(JSON.stringify({ error: message }), {
        status: imageResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const imageData = imagePayload?.data?.[0]
    const base64Image = imageData?.b64_json
    if (!base64Image || typeof base64Image !== 'string') {
      return new Response(JSON.stringify({ error: 'OpenAI 沒有回傳可用的圖片資料。' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const fileName = `${Date.now()}-${slugify(card.name || 'card')}.png`
    const filePath = `${card.id}/${fileName}`
    const fileBytes = decodeBase64Image(base64Image)

    if (card.image_storage_path) {
      await adminClient.storage.from('card-images').remove([card.image_storage_path])
    }

    const { error: uploadError } = await adminClient.storage.from('card-images').upload(filePath, fileBytes, {
      contentType: 'image/png',
      upsert: true,
    })

    if (uploadError) {
      return new Response(JSON.stringify({ error: uploadError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: publicUrlData } = adminClient.storage.from('card-images').getPublicUrl(filePath)

    const updatePayload = {
      image_url: publicUrlData.publicUrl,
      image_prompt: nextPrompt || null,
      image_style: nextStyle,
      image_storage_path: filePath,
      image_generated_at: new Date().toISOString(),
    }

    const { data: updatedCard, error: updateError } = await adminClient
      .from('cards')
      .update(updatePayload)
      .eq('id', card.id)
      .select('*, album:album_id(*)')
      .single()

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        card: updatedCard,
        image_url: updatePayload.image_url,
        image_storage_path: updatePayload.image_storage_path,
        image_style: nextStyle,
        image_prompt: nextPrompt || null,
        final_prompt: finalPrompt,
        message: `已為卡片「${card.name}」生成新圖片。`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : '生成卡圖時發生未預期錯誤。',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
