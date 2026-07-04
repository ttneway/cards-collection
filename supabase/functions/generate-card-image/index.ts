import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEFAULT_IMAGE_STYLE = 'Q版校園奇幻'

const STYLE_PROMPTS: Record<string, string> = {
  [DEFAULT_IMAGE_STYLE]:
    'Create a polished chibi fantasy campus illustration with bright lighting, clear silhouette, soft depth, and a premium collectible mobile game feeling.',
  '日系動漫插畫':
    'Create a clean anime illustration with readable composition, expressive lighting, refined details, and a premium game reward presentation.',
  '紙牌卡框風格':
    'Create a polished collectible trading-card illustration with a visible decorative frame on all four edges and premium printed-card styling.',
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  huggingface: 'Hugging Face',
}

type TargetType = 'card' | 'equipment' | 'profession'

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

type EquipmentRow = {
  id: string
  name: string
  rarity: string
  description: string | null
  slot_type: string
  image_url: string | null
  image_prompt: string | null
  image_style: string | null
}

type ProfessionRow = {
  id: string
  name: string
  code: string
  description: string | null
  theme_color: string | null
  icon_url: string | null
  image_prompt: string | null
  image_style: string | null
  unlock_tier: number
}

type GenerationSuccess = {
  base64Image: string
  mimeType: string
  modelUsed?: string
  debug?: string | null
}

type GenerationFailure = {
  error: string
  status: number
  modelUsed?: string
  debug?: string | null
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function decodeBase64Image(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

function encodeBase64Image(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

function encodeModelPath(model: string) {
  return model
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')
}

function getImageExtension(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/webp') return 'webp'
  return 'png'
}

function normalizeProvider(value: string | null) {
  const provider = value?.trim().toLowerCase()
  return provider === 'gemini' || provider === 'openai' || provider === 'huggingface' ? provider : 'auto'
}

function normalizeTargetType(value: unknown): TargetType {
  const targetType = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (targetType === 'equipment' || targetType === 'profession') return targetType
  return 'card'
}

function resolveImageProvider(openAiApiKey: string, geminiApiKey: string, huggingFaceApiKey: string, configuredProvider: string) {
  if (configuredProvider === 'openai') return openAiApiKey ? 'openai' : null
  if (configuredProvider === 'gemini') return geminiApiKey ? 'gemini' : null
  if (configuredProvider === 'huggingface') return huggingFaceApiKey ? 'huggingface' : null

  if (geminiApiKey) return 'gemini'
  if (openAiApiKey) return 'openai'
  if (huggingFaceApiKey) return 'huggingface'
  return null
}

function resolveRequestProvider(provider: string, apiKey: string) {
  return apiKey && (provider === 'gemini' || provider === 'openai' || provider === 'huggingface') ? provider : null
}

function getStylePrompt(imageStyle: string) {
  return STYLE_PROMPTS[imageStyle] ?? STYLE_PROMPTS[DEFAULT_IMAGE_STYLE]
}

function buildCardPrompt(card: CardRow, albumName: string | null, imageStyle: string, imagePrompt: string | null) {
  const stylePrompt = getStylePrompt(imageStyle)
  const customPrompt = imagePrompt?.trim()
    ? `Supporting detail to include without replacing the main subject: ${imagePrompt.trim()}`
    : ''
  const description = card.description?.trim() ? `Card description: ${card.description.trim()}` : ''
  const albumLabel = albumName ?? card.series ?? 'Campus Collection'

  return [
    stylePrompt,
    'Design artwork for a school collectible card.',
    `The primary subject of this card must be "${card.name}".`,
    `Album or collection theme: ${albumLabel}.`,
    `Card rarity: ${card.rarity}.`,
    `Main accent color: ${card.color ?? '#334155'}.`,
    description,
    customPrompt,
    'Keep the named subject obvious at first glance.',
    'Avoid text, watermarks, UI, and unrelated random portrait subjects.',
  ]
    .filter(Boolean)
    .join(' ')
}

function buildEquipmentPrompt(equipment: EquipmentRow, imageStyle: string, imagePrompt: string | null) {
  const stylePrompt = getStylePrompt(imageStyle)
  const customPrompt = imagePrompt?.trim()
    ? `Supporting detail to include without replacing the main subject: ${imagePrompt.trim()}`
    : ''
  const description = equipment.description?.trim() ? `Equipment description: ${equipment.description.trim()}` : ''

  return [
    stylePrompt,
    'Design artwork for a school collectible equipment item.',
    `The equipment named "${equipment.name}" must be the main subject.`,
    `Equipment slot: ${equipment.slot_type}.`,
    `Equipment rarity: ${equipment.rarity}.`,
    description,
    customPrompt,
    'The item itself must dominate the composition.',
    'If a character appears, they must remain secondary to the equipment.',
    'Avoid text, watermarks, UI, and unrelated random portraits.',
  ]
    .filter(Boolean)
    .join(' ')
}

function buildProfessionPrompt(profession: ProfessionRow, imageStyle: string, imagePrompt: string | null) {
  const stylePrompt = getStylePrompt(imageStyle)
  const customPrompt = imagePrompt?.trim()
    ? `Supporting detail to include without replacing the main subject: ${imagePrompt.trim()}`
    : ''
  const description = profession.description?.trim() ? `Profession description: ${profession.description.trim()}` : ''

  return [
    stylePrompt,
    'Design artwork for a fantasy school profession or class.',
    `The profession named "${profession.name}" must be represented clearly as the main subject.`,
    `Profession code: ${profession.code}.`,
    `Theme color: ${profession.theme_color ?? '#6366f1'}.`,
    `Unlock tier: ${profession.unlock_tier}.`,
    description,
    customPrompt,
    'The result should work as a polished profession icon or portrait for a mobile game selection screen.',
    'Avoid text, watermarks, UI, and unrelated subjects.',
  ]
    .filter(Boolean)
    .join(' ')
}

async function generateOpenAiImage(prompt: string, openAiApiKey: string, model: string): Promise<GenerationSuccess | GenerationFailure> {
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
    return {
      error: imagePayload?.error?.message ?? 'OpenAI image generation failed.',
      status: imageResponse.status,
      modelUsed: model,
      debug: debugSummary(imagePayload),
    }
  }

  const base64Image = imagePayload?.data?.[0]?.b64_json
  if (!base64Image || typeof base64Image !== 'string') {
    return { error: 'OpenAI did not return image data.', status: 502, modelUsed: model }
  }

  return { base64Image, mimeType: 'image/png', modelUsed: model }
}

async function generateHuggingFaceImage(prompt: string, huggingFaceApiKey: string, model: string): Promise<GenerationSuccess | GenerationFailure> {
  const modelPath = encodeModelPath(model)
  const imageResponse = await fetch(`https://router.huggingface.co/hf-inference/models/${modelPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${huggingFaceApiKey}`,
      'Content-Type': 'application/json',
      Accept: 'image/png',
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
  return {
    base64Image: encodeBase64Image(imageBytes),
    mimeType: contentType.split(';')[0] || 'image/png',
    modelUsed: model,
    debug: debugSummary({ contentType, bytes: imageBytes.byteLength }),
  }
}

async function generateGeminiImage(prompt: string, geminiApiKey: string, model: string): Promise<GenerationSuccess | GenerationFailure> {
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
      body: JSON.stringify({ ...requestBody, model: attemptedModel }),
    })
    imagePayload = await imageResponse.json()
  }

  if (!imageResponse.ok) {
    return {
      error: imagePayload?.error?.message ?? 'Gemini image generation failed.',
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
        }) => [...(step?.content ?? []), ...(step?.summary ?? [])]
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
      throw new Error('Supabase Edge Function is missing required environment variables.')
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
      return jsonResponse({ error: 'Authentication required.' }, 401)
    }

    const { data: actorProfile, error: actorError } = await adminClient
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle()

    if (actorError || !actorProfile || !['teacher', 'admin'].includes(actorProfile.role)) {
      return jsonResponse({ error: 'Teacher or admin permission is required.' }, 403)
    }

    const body = await request.json()
    const action = typeof body.action === 'string' ? body.action : null
    const normalizedTargetType = normalizeTargetType(body.targetType)
    const resolvedTargetId =
      typeof body.targetId === 'string' && body.targetId.trim()
        ? body.targetId.trim()
        : typeof body.cardId === 'string' && body.cardId.trim()
          ? body.cardId.trim()
          : ''
    const requestProvider = normalizeProvider(typeof body.aiProvider === 'string' ? body.aiProvider : null)
    const requestApiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
    const personalProvider = resolveRequestProvider(requestProvider, requestApiKey)
    const systemProvider = resolveImageProvider(
      systemOpenAiApiKey,
      systemGeminiApiKey,
      systemHuggingFaceApiKey,
      configuredProvider
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
        model:
          activeProvider === 'gemini'
            ? geminiModel
            : activeProvider === 'openai'
              ? openAiModel
              : activeProvider === 'huggingface'
                ? huggingFaceModel
                : null,
        missing_secret:
          configuredProvider === 'gemini'
            ? 'GEMINI_API_KEY'
            : configuredProvider === 'openai'
              ? 'OPENAI_API_KEY'
              : 'OPENAI_API_KEY or GEMINI_API_KEY',
        ready: Boolean(activeProvider),
        key_source: keySource,
      })
    }

    if (!activeProvider) {
      return jsonResponse(
        {
          error:
            requestApiKey && !personalProvider
              ? 'The provided API key does not match a supported provider.'
              : 'No AI image provider is configured.',
        },
        400
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
              model:
                probeResult.modelUsed ??
                (activeProvider === 'gemini'
                  ? geminiModel
                  : activeProvider === 'huggingface'
                    ? huggingFaceModel
                    : openAiModel),
              status: probeResult.status,
              debug: probeResult.debug ?? null,
            },
          },
          200
        )
      }

      return jsonResponse({
        ok: true,
        provider: activeProvider,
        model:
          probeResult.modelUsed ??
          (activeProvider === 'gemini'
            ? geminiModel
            : activeProvider === 'huggingface'
              ? huggingFaceModel
              : openAiModel),
        diagnostics: probeResult.debug ?? null,
      })
    }

    if (!resolvedTargetId) {
      return jsonResponse({ error: 'Missing target id.' }, 400)
    }

    let nextStyle = typeof body.imageStyle === 'string' && body.imageStyle.trim() ? body.imageStyle.trim() : DEFAULT_IMAGE_STYLE
    let nextPrompt = typeof body.imagePrompt === 'string' ? body.imagePrompt.trim() : ''
    let finalPrompt = ''
    let fileLabel = resolvedTargetId
    let fileFolder = 'cards'
    let imageField = 'image_url'
    let existingStoragePath: string | null = null
    let record: Record<string, unknown> | null = null

    if (normalizedTargetType === 'card') {
      const { data: card, error: cardError } = await adminClient
        .from('cards')
        .select('id, name, rarity, description, series, album_id, image_url, image_prompt, image_style, image_storage_path, color')
        .eq('id', resolvedTargetId)
        .maybeSingle()

      if (cardError || !card) return jsonResponse({ error: 'Card not found.' }, 404)

      let albumName: string | null = null
      if (card.album_id) {
        const { data: album } = await adminClient.from('card_albums').select('name').eq('id', card.album_id).maybeSingle()
        albumName = album?.name ?? null
      }

      nextStyle = typeof body.imageStyle === 'string' && body.imageStyle.trim() ? body.imageStyle.trim() : card.image_style ?? DEFAULT_IMAGE_STYLE
      nextPrompt = typeof body.imagePrompt === 'string' ? body.imagePrompt.trim() : card.image_prompt ?? ''
      finalPrompt = buildCardPrompt(card as CardRow, albumName, nextStyle, nextPrompt)
      fileLabel = card.name || card.id
      fileFolder = 'cards'
      imageField = 'image_url'
      existingStoragePath = card.image_storage_path ?? null
    } else if (normalizedTargetType === 'equipment') {
      const { data: equipment, error: equipmentError } = await adminClient
        .from('equipment_templates')
        .select('id, name, rarity, description, slot_type, image_url, image_prompt, image_style')
        .eq('id', resolvedTargetId)
        .maybeSingle()

      if (equipmentError || !equipment) return jsonResponse({ error: 'Equipment not found.' }, 404)

      nextStyle = typeof body.imageStyle === 'string' && body.imageStyle.trim() ? body.imageStyle.trim() : equipment.image_style ?? DEFAULT_IMAGE_STYLE
      nextPrompt = typeof body.imagePrompt === 'string' ? body.imagePrompt.trim() : equipment.image_prompt ?? ''
      finalPrompt = buildEquipmentPrompt(equipment as EquipmentRow, nextStyle, nextPrompt)
      fileLabel = equipment.name || equipment.id
      fileFolder = 'equipment'
      imageField = 'image_url'
    } else {
      const { data: profession, error: professionError } = await adminClient
        .from('profession_templates')
        .select('id, name, code, description, theme_color, icon_url, image_prompt, image_style, unlock_tier')
        .eq('id', resolvedTargetId)
        .maybeSingle()

      if (professionError || !profession) return jsonResponse({ error: 'Profession not found.' }, 404)

      nextStyle = typeof body.imageStyle === 'string' && body.imageStyle.trim() ? body.imageStyle.trim() : profession.image_style ?? DEFAULT_IMAGE_STYLE
      nextPrompt = typeof body.imagePrompt === 'string' ? body.imagePrompt.trim() : profession.image_prompt ?? ''
      finalPrompt = buildProfessionPrompt(profession as ProfessionRow, nextStyle, nextPrompt)
      fileLabel = profession.name || profession.id
      fileFolder = 'professions'
      imageField = 'icon_url'
    }

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
            model:
              generationResult.modelUsed ??
              (activeProvider === 'gemini'
                ? geminiModel
                : activeProvider === 'huggingface'
                  ? huggingFaceModel
                  : openAiModel),
            status: generationResult.status,
            debug: generationResult.debug ?? null,
          },
        },
        200
      )
    }

    const mimeType = generationResult.mimeType ?? 'image/png'
    const fileExtension = getImageExtension(mimeType)
    const fileName = `${Date.now()}-${slugify(fileLabel || 'image')}.${fileExtension}`
    const filePath = `${fileFolder}/${resolvedTargetId}/${fileName}`
    const fileBytes = decodeBase64Image(generationResult.base64Image)

    if (existingStoragePath) {
      await adminClient.storage.from('card-images').remove([existingStoragePath])
    }

    const { error: uploadError } = await adminClient.storage.from('card-images').upload(filePath, fileBytes, {
      contentType: mimeType,
      upsert: true,
    })

    if (uploadError) {
      return jsonResponse({ error: uploadError.message }, 500)
    }

    const { data: publicUrlData } = adminClient.storage.from('card-images').getPublicUrl(filePath)

    if (normalizedTargetType === 'card') {
      const { data, error: updateError } = await adminClient
        .from('cards')
        .update({
          image_url: publicUrlData.publicUrl,
          image_prompt: nextPrompt || null,
          image_style: nextStyle,
          image_storage_path: filePath,
          image_generated_at: new Date().toISOString(),
        })
        .eq('id', resolvedTargetId)
        .select('*, album:album_id(*)')
        .single()

      if (updateError) return jsonResponse({ error: updateError.message }, 500)
      record = data as Record<string, unknown>
    } else if (normalizedTargetType === 'equipment') {
      const { data, error: updateError } = await adminClient
        .from('equipment_templates')
        .update({
          image_url: publicUrlData.publicUrl,
          image_prompt: nextPrompt || null,
          image_style: nextStyle,
        })
        .eq('id', resolvedTargetId)
        .select('*, equipment_effects(*)')
        .single()

      if (updateError) return jsonResponse({ error: updateError.message }, 500)
      record = data as Record<string, unknown>
    } else {
      const { data, error: updateError } = await adminClient
        .from('profession_templates')
        .update({
          icon_url: publicUrlData.publicUrl,
          image_prompt: nextPrompt || null,
          image_style: nextStyle,
        })
        .eq('id', resolvedTargetId)
        .select('*, profession_effects(*)')
        .single()

      if (updateError) return jsonResponse({ error: updateError.message }, 500)
      record = data as Record<string, unknown>
    }

    return jsonResponse({
      targetType: normalizedTargetType,
      record,
      [normalizedTargetType]: record,
      image_url: publicUrlData.publicUrl,
      image_field: imageField,
      image_storage_path: normalizedTargetType === 'card' ? filePath : null,
      image_style: nextStyle,
      image_prompt: nextPrompt || null,
      provider: activeProvider,
      provider_label: PROVIDER_LABELS[activeProvider],
      key_source: keySource,
      model:
        activeProvider === 'gemini'
          ? geminiModel
          : activeProvider === 'huggingface'
            ? huggingFaceModel
            : openAiModel,
      final_prompt: finalPrompt,
      message: `Image generated with ${PROVIDER_LABELS[activeProvider]}${keySource === 'teacher' ? ' (teacher key)' : ''}.`,
    })
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'AI image generation failed unexpectedly.',
      },
      500
    )
  }
})
