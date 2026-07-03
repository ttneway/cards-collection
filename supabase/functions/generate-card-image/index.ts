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

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  huggingface: 'Hugging Face',
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

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function debugSummary(value: unknown, maxLength = 700) {
  try {
    const text = JSON.stringify(value)
    if (!text) return null
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
  } catch {
    return null
  }
}

function normalizeProvider(value: string | null) {
  const provider = value?.trim().toLowerCase()
  return provider === 'gemini' || provider === 'openai' || provider === 'huggingface' ? provider : 'auto'
}

function resolveImageProvider(openAiApiKey: string, geminiApiKey: string, huggingFaceApiKey: string, configuredProvider: string) {
  if (configuredProvider === 'openai') {
    return openAiApiKey ? 'openai' : null
  }

  if (configuredProvider === 'gemini') {
    return geminiApiKey ? 'gemini' : null
  }

  if (configuredProvider === 'huggingface') {
    return huggingFaceApiKey ? 'huggingface' : null
  }

  if (geminiApiKey) return 'gemini'
  if (openAiApiKey) return 'openai'
  if (huggingFaceApiKey) return 'huggingface'
  return null
}

function resolveRequestProvider(provider: string, apiKey: string) {
  return apiKey && (provider === 'gemini' || provider === 'openai' || provider === 'huggingface') ? provider : null
}

async function generateOpenAiImage(prompt: string, openAiApiKey: string, model: string) {
  const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      size: '1024x1024',
    }),
  })

  const imagePayload = await imageResponse.json()
  if (!imageResponse.ok) {
    const message = imagePayload?.error?.message ?? 'OpenAI 生成卡圖失敗。'
    return { error: message, status: imageResponse.status, modelUsed: model, debug: debugSummary(imagePayload) }
  }

  const base64Image = imagePayload?.data?.[0]?.b64_json
  if (!base64Image || typeof base64Image !== 'string') {
    return { error: 'OpenAI 沒有回傳可用的圖片資料。', status: 502 }
  }

  return { base64Image, mimeType: 'image/png' }
}

async function generateHuggingFaceImage(prompt: string, huggingFaceApiKey: string, model: string) {
  const imageResponse = await fetch(`https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${huggingFaceApiKey}`,
      'Content-Type': 'application/json',
      Accept: 'image/*',
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        width: 1024,
        height: 1024,
        num_inference_steps: 4,
      },
    }),
  })

  const contentType = imageResponse.headers.get('content-type') ?? ''
  if (!imageResponse.ok) {
    const errorPayload = contentType.includes('application/json') ? await imageResponse.json() : await imageResponse.text()
    const message =
      (typeof errorPayload === 'object' &&
      errorPayload &&
      'error' in errorPayload &&
      typeof errorPayload.error === 'string'
        ? errorPayload.error
        : null) ?? 'Hugging Face image generation failed.'

    return {
      error: message,
      status: imageResponse.status,
      modelUsed: model,
      debug: debugSummary(errorPayload),
    }
  }

  const imageBytes = new Uint8Array(await imageResponse.arrayBuffer())
  const base64Image = btoa(String.fromCharCode(...imageBytes))
  const mimeType = contentType.split(';')[0] || 'image/png'

  return {
    base64Image,
    mimeType,
    modelUsed: model,
    debug: debugSummary({ contentType, bytes: imageBytes.byteLength }),
  }
}

function getImageExtension(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/webp') return 'webp'
  return 'png'
}

async function generateGeminiImage(prompt: string, geminiApiKey: string, model: string) {
  const requestBody = {
    model,
    input: [{ type: 'text', text: prompt }],
  }

  let attemptedModel = model
  let imageResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'x-goog-api-key': geminiApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  let imagePayload = await imageResponse.json()
  if (!imageResponse.ok && model === 'gemini-3.1-flash-lite-image') {
    attemptedModel = 'gemini-3.1-flash-image'
    imageResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'x-goog-api-key': geminiApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...requestBody,
        model: attemptedModel,
      }),
    })
    imagePayload = await imageResponse.json()
  }

  if (!imageResponse.ok) {
    const message = imagePayload?.error?.message ?? 'Gemini 生成卡圖失敗。'
    return {
      error: message,
      status: imageResponse.status,
      modelUsed: attemptedModel,
      debug: debugSummary(imagePayload),
    }
  }

  const outputImage = imagePayload?.output_image
  const fallbackImage =
    imagePayload?.output?.find?.((item: { type?: string; data?: string; mime_type?: string }) => item?.type === 'image') ??
    imagePayload?.steps
      ?.flatMap?.(
        (step: {
          content?: Array<{ type?: string; data?: string; mime_type?: string }>
          summary?: Array<{ type?: string; data?: string; mime_type?: string }>
        }) => [...(step?.content ?? []), ...(step?.summary ?? [])],
      )
      ?.find?.((item: { type?: string; data?: string; mime_type?: string }) => item?.type === 'image')
  const base64Image = outputImage?.data ?? fallbackImage?.data
  const mimeType = outputImage?.mime_type ?? fallbackImage?.mime_type ?? 'image/jpeg'
  const outputText =
    imagePayload?.output_text ??
    imagePayload?.output?.find?.((item: { type?: string; text?: string }) => item?.type === 'text')?.text

  if (!base64Image || typeof base64Image !== 'string') {
    return {
      error: outputText ? `Gemini did not return image data. Text output: ${outputText}` : 'Gemini did not return image data.',
      status: 502,
      modelUsed: attemptedModel,
      debug: debugSummary(imagePayload),
    }
  }

  return {
    base64Image,
    mimeType,
    modelUsed: attemptedModel,
    debug: debugSummary({ output_image: outputImage, has_fallback: Boolean(fallbackImage) }),
  }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const systemOpenAiApiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
    const systemGeminiApiKey = Deno.env.get('GEMINI_API_KEY') ?? ''
    const systemHuggingFaceApiKey = Deno.env.get('HUGGINGFACE_API_KEY') ?? ''
    const configuredProvider = normalizeProvider(Deno.env.get('AI_IMAGE_PROVIDER'))
    const openAiModel = Deno.env.get('OPENAI_IMAGE_MODEL') ?? 'gpt-image-1-mini'
    const geminiModel = Deno.env.get('GEMINI_IMAGE_MODEL') ?? 'gemini-3.1-flash-image'
    const huggingFaceModel = Deno.env.get('HUGGINGFACE_IMAGE_MODEL') ?? 'black-forest-labs/FLUX.1-schnell'
    const authHeader = request.headers.get('Authorization') ?? ''

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error('Supabase Edge Function 缺少必要環境變數。')
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
      return jsonResponse({ error: '只有教師或管理者可以生成卡圖。' }, 403)
    }

    const { cardId, imagePrompt, imageStyle, action, aiProvider, apiKey } = await request.json()
    const requestProvider = normalizeProvider(typeof aiProvider === 'string' ? aiProvider : null)
    const requestApiKey = typeof apiKey === 'string' ? apiKey.trim() : ''
    const personalProvider = resolveRequestProvider(requestProvider, requestApiKey)
    const systemProvider = resolveImageProvider(
      systemOpenAiApiKey,
      systemGeminiApiKey,
      systemHuggingFaceApiKey,
      configuredProvider,
    )
    const activeProvider = personalProvider ?? systemProvider
    const openAiApiKey = personalProvider === 'openai' ? requestApiKey : systemOpenAiApiKey
    const geminiApiKey = personalProvider === 'gemini' ? requestApiKey : systemGeminiApiKey
    const huggingFaceApiKey = personalProvider === 'huggingface' ? requestApiKey : systemHuggingFaceApiKey
    const keySource = personalProvider ? 'teacher' : activeProvider ? 'system' : null

    if (action === 'status') {
      return jsonResponse({
        configured_provider: configuredProvider,
        active_provider: activeProvider,
        provider_label: activeProvider ? PROVIDER_LABELS[activeProvider] : null,
        model: activeProvider === 'gemini' ? geminiModel : activeProvider === 'openai' ? openAiModel : activeProvider === 'huggingface' ? huggingFaceModel : null,
        has_openai_key: Boolean(systemOpenAiApiKey),
        has_gemini_key: Boolean(systemGeminiApiKey),
        has_huggingface_key: Boolean(systemHuggingFaceApiKey),
        key_source: keySource,
        missing_secret:
          configuredProvider === 'gemini'
            ? 'GEMINI_API_KEY'
            : configuredProvider === 'openai'
              ? 'OPENAI_API_KEY'
            : 'OPENAI_API_KEY 或 GEMINI_API_KEY',
        ready: Boolean(activeProvider),
      })
    }

    if (!activeProvider) {
      return jsonResponse(
        {
          error:
            requestApiKey && !personalProvider
              ? '使用教師自備 API key 時，請先選擇 OpenAI 或 Gemini。'
              : configuredProvider === 'gemini'
                ? '尚未設定 GEMINI_API_KEY；可由教師在頁面輸入自己的 Gemini key，或先在 Supabase Edge Function Secrets 中加入。'
                : configuredProvider === 'openai'
                  ? '尚未設定 OPENAI_API_KEY；可由教師在頁面輸入自己的 OpenAI key，或先在 Supabase Edge Function Secrets 中加入。'
                  : '尚未設定圖片 API 金鑰；可由教師在頁面輸入自己的 key，或在 Supabase Edge Function Secrets 加入 GEMINI_API_KEY / OPENAI_API_KEY。',
        },
        400,
      )
    }

    if (action === 'probe') {
      const probePrompt = 'Create a simple school badge illustration with a star on a plain background.'
      const probeResult =
        activeProvider === 'gemini'
          ? await generateGeminiImage(probePrompt, geminiApiKey, geminiModel)
          : activeProvider === 'huggingface'
            ? await generateHuggingFaceImage(probePrompt, huggingFaceApiKey, huggingFaceModel)
            : await generateOpenAiImage(probePrompt, openAiApiKey, openAiModel)

      if ('error' in probeResult) {
        return jsonResponse(
          {
            error: probeResult.error,
            diagnostics: {
              provider: activeProvider,
              model: probeResult.modelUsed ?? (activeProvider === 'gemini' ? geminiModel : activeProvider === 'huggingface' ? huggingFaceModel : openAiModel),
              status: probeResult.status,
              debug: probeResult.debug ?? null,
            },
          },
          200,
        )
      }

      return jsonResponse({
        ok: true,
        provider: activeProvider,
        model: probeResult.modelUsed ?? (activeProvider === 'gemini' ? geminiModel : activeProvider === 'huggingface' ? huggingFaceModel : openAiModel),
        diagnostics: probeResult.debug ?? null,
      })
    }

    if (!cardId || typeof cardId !== 'string') {
      return jsonResponse({ error: '缺少卡片 ID。' }, 400)
    }

    const { data: card, error: cardError } = await adminClient
      .from('cards')
      .select('id, name, rarity, description, series, album_id, image_url, image_prompt, image_style, image_storage_path, color')
      .eq('id', cardId)
      .maybeSingle()

    if (cardError || !card) {
      return jsonResponse({ error: '找不到要生成圖片的卡片。' }, 404)
    }

    let albumName: string | null = null
    if (card.album_id) {
      const { data: album } = await adminClient.from('card_albums').select('name').eq('id', card.album_id).maybeSingle()
      albumName = album?.name ?? null
    }

    const nextStyle = typeof imageStyle === 'string' && imageStyle.trim() ? imageStyle.trim() : card.image_style ?? 'Q版校園奇幻'
    const nextPrompt = typeof imagePrompt === 'string' ? imagePrompt.trim() : card.image_prompt ?? ''
    const finalPrompt = buildPrompt(card as CardRow, albumName, nextStyle, nextPrompt)

    const generationResult =
      activeProvider === 'gemini'
        ? await generateGeminiImage(finalPrompt, geminiApiKey, geminiModel)
        : activeProvider === 'huggingface'
          ? await generateHuggingFaceImage(finalPrompt, huggingFaceApiKey, huggingFaceModel)
          : await generateOpenAiImage(finalPrompt, openAiApiKey, openAiModel)

    if ('error' in generationResult) {
      return jsonResponse(
        {
          error: generationResult.error,
          diagnostics: {
            provider: activeProvider,
            model: generationResult.modelUsed ?? (activeProvider === 'gemini' ? geminiModel : activeProvider === 'huggingface' ? huggingFaceModel : openAiModel),
            status: generationResult.status,
            debug: generationResult.debug ?? null,
          },
        },
        200,
      )
    }

    const mimeType = generationResult.mimeType ?? 'image/png'
    const fileExtension = getImageExtension(mimeType)
    const fileName = `${Date.now()}-${slugify(card.name || 'card')}.${fileExtension}`
    const filePath = `${card.id}/${fileName}`
    const fileBytes = decodeBase64Image(generationResult.base64Image)

    if (card.image_storage_path) {
      await adminClient.storage.from('card-images').remove([card.image_storage_path])
    }

    const { error: uploadError } = await adminClient.storage.from('card-images').upload(filePath, fileBytes, {
      contentType: mimeType,
      upsert: true,
    })

    if (uploadError) {
      return jsonResponse({ error: uploadError.message }, 500)
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
      return jsonResponse({ error: updateError.message }, 500)
    }

    return jsonResponse({
        card: updatedCard,
        image_url: updatePayload.image_url,
        image_storage_path: updatePayload.image_storage_path,
        image_style: nextStyle,
        image_prompt: nextPrompt || null,
        provider: activeProvider,
        provider_label: PROVIDER_LABELS[activeProvider],
        key_source: keySource,
        model: activeProvider === 'gemini' ? geminiModel : activeProvider === 'huggingface' ? huggingFaceModel : openAiModel,
        final_prompt: finalPrompt,
        message: `已透過 ${PROVIDER_LABELS[activeProvider]}${keySource === 'teacher' ? '（教師自備 key）' : ''} 為卡片「${card.name}」生成新圖片。`,
      })
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : '生成卡圖時發生未預期錯誤。',
      },
      500,
    )
  }
})
