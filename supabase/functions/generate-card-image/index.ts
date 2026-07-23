import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2'
import { InferenceClient } from 'https://esm.sh/@huggingface/inference'
import { buildAchievementPrompt, buildAlbumPrompt, buildCardPrompt, buildEquipmentPrompt, buildProfessionPrompt, DEFAULT_IMAGE_STYLE } from '../../../src/lib/aiPromptBuilder.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  huggingface: 'Hugging Face',
  comfyui_gateway: '共享 ComfyUI 主機',
}

type TargetType = 'card' | 'equipment' | 'profession' | 'achievement' | 'album'

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

type AchievementRow = {
  id: string
  name: string
  description: string | null
  category: string | null
  progress_mode: string | null
  image_url: string | null
  image_prompt: string | null
  image_style: string | null
  image_storage_path: string | null
}

type AlbumRow = {
  id: string
  name: string
  description: string | null
  cover_color: string | null
  image_url: string | null
  image_prompt: string | null
  image_style: string | null
  image_storage_path: string | null
}

type RemoteAiSettingsRow = {
  provider: string
  base_url: string
  shared_secret: string | null
  workflow_api_json: string
  negative_prompt: string
  seed_mode: 'random' | 'fixed'
  fixed_seed: number | null
  is_enabled: boolean
}

type RemoteAiWorkflowRow = {
  id: string
  name: string
  target_type: 'all' | TargetType
  workflow_api_json: string
  is_active: boolean
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

type HuggingFaceProviderMapping = {
  status?: string
  providerId?: string
  task?: string
}

type ImageGenerationProfile = {
  promptSuffix: string
  openAiSize: string
  huggingFaceWidth: number
  huggingFaceHeight: number
}

const DEFAULT_IMAGE_PROFILE: ImageGenerationProfile = {
  promptSuffix: '',
  openAiSize: '1024x1024',
  huggingFaceWidth: 1024,
  huggingFaceHeight: 1024,
}

const CARD_IMAGE_PROFILE: ImageGenerationProfile = {
  promptSuffix:
    'Use a vertical trading-card composition. Keep the subject centered and readable inside a 3:4 portrait safe area, with comfortable margins for a card frame.',
  openAiSize: '1024x1536',
  huggingFaceWidth: 896,
  huggingFaceHeight: 1200,
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

async function resolveHuggingFaceTextToImageRoute(model: string) {
  const modelPath = encodeModelPath(model)
  const response = await fetch(`https://huggingface.co/api/models/${modelPath}?expand=inferenceProviderMapping`)
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    return {
      ok: false as const,
      provider: 'hf-inference',
      providerId: model,
      debug: debugSummary(payload) ?? `HTTP ${response.status}`,
    }
  }

  const mapping =
    payload && typeof payload === 'object' && 'inferenceProviderMapping' in payload
      ? (payload.inferenceProviderMapping as Record<string, HuggingFaceProviderMapping> | null)
      : null

  const candidates = Object.entries(mapping ?? {})
    .filter(([, item]) => item?.status === 'live' && item?.task === 'text-to-image')
    .map(([provider, item]) => ({
      provider,
      providerId: item?.providerId?.trim() || model,
    }))

  const selected =
    candidates.find(candidate => candidate.provider === 'hf-inference') ??
    candidates[0] ?? {
      provider: 'hf-inference',
      providerId: model,
    }

  return {
    ok: true as const,
    provider: selected.provider,
    providerId: selected.providerId,
    debug: debugSummary({ candidates }),
  }
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
  if (targetType === 'equipment' || targetType === 'profession' || targetType === 'achievement' || targetType === 'album' || targetType === 'profile') return targetType
  return 'card'
}

function normalizeProfessionImageField(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (normalized === 'icon_url_male' || normalized === 'icon_url_female') return normalized
  return 'icon_url'
}

function getImageGenerationProfile(targetType: TargetType): ImageGenerationProfile {
  return targetType === 'card' || targetType === 'album' ? CARD_IMAGE_PROFILE : DEFAULT_IMAGE_PROFILE
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

async function generateOpenAiImage(
  prompt: string,
  openAiApiKey: string,
  model: string,
  profile: ImageGenerationProfile
): Promise<GenerationSuccess | GenerationFailure> {
  const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      size: profile.openAiSize,
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

async function generateHuggingFaceImage(
  prompt: string,
  huggingFaceApiKey: string,
  model: string,
  profile: ImageGenerationProfile
): Promise<GenerationSuccess | GenerationFailure> {
  const resolvedRoute = await resolveHuggingFaceTextToImageRoute(model)
  const provider = resolvedRoute.provider === 'hf-inference' ? 'auto' : resolvedRoute.provider

  try {
    const client = new InferenceClient(huggingFaceApiKey)
    const imageBlob = await client.textToImage({
      model,
      provider,
      inputs: prompt,
      parameters: {
        width: profile.huggingFaceWidth,
        height: profile.huggingFaceHeight,
      },
    })

    const imageBytes = new Uint8Array(await imageBlob.arrayBuffer())

    return {
      base64Image: encodeBase64Image(imageBytes),
      mimeType: imageBlob.type || 'image/png',
      modelUsed: provider === 'auto' ? model : `${model} via ${provider}`,
      debug: debugSummary({ route: resolvedRoute, provider, bytes: imageBytes.byteLength, mimeType: imageBlob.type || 'image/png' }),
    }
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Hugging Face image generation failed.'

    const status =
      typeof error === 'object' &&
      error &&
      'status' in error &&
      typeof (error as { status?: unknown }).status === 'number'
        ? ((error as { status: number }).status)
        : 502

    return {
      error: message,
      status,
      modelUsed: provider === 'auto' ? model : `${model} via ${provider}`,
      debug: debugSummary({ route: resolvedRoute, provider, error }),
    }
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

async function loadRemoteAiSettings(adminClient: ReturnType<typeof createClient>) {
  const { data, error } = await adminClient
    .from('remote_ai_settings')
    .select('provider, base_url, shared_secret, workflow_api_json, negative_prompt, seed_mode, fixed_seed, is_enabled')
    .eq('provider', 'comfyui_gateway')
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load remote AI settings: ${error.message}`)
  }

  return (data ?? null) as RemoteAiSettingsRow | null
}

async function loadRemoteAiWorkflow(
  adminClient: ReturnType<typeof createClient>,
  workflowId: string,
  targetType: TargetType
) {
  const { data, error } = await adminClient
    .from('remote_ai_workflows')
    .select('id, name, target_type, workflow_api_json, is_active')
    .eq('id', workflowId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load remote AI workflow: ${error.message}`)
  }

  const workflow = (data ?? null) as RemoteAiWorkflowRow | null
  if (!workflow || !workflow.is_active) {
    throw new Error('Selected shared workflow is unavailable.')
  }

  if (workflow.target_type !== 'all' && workflow.target_type !== targetType) {
    throw new Error('Selected shared workflow does not support this content type.')
  }

  return workflow
}

function generateRemoteSeed(settings: RemoteAiSettingsRow) {
  if (settings.seed_mode === 'fixed' && Number.isFinite(settings.fixed_seed)) {
    return Math.max(0, Math.floor(Number(settings.fixed_seed)))
  }

  return Math.floor(Math.random() * 9007199254740991)
}

function normalizeSeedOverride(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value))
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    if (!normalized) return null
    const parsed = Number(normalized)
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed))
    }
  }

  return null
}

async function callRemoteGatewayHealth(settings: RemoteAiSettingsRow) {
  const response = await fetch(`${settings.base_url.replace(/\/+$/g, '')}/health`, {
    method: 'GET',
    headers: {
      'x-shared-secret': settings.shared_secret ?? '',
    },
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      payload,
    }
  }

  return {
    ok: true,
    status: response.status,
    payload,
  }
}

async function callRemoteGatewayGenerate(settings: RemoteAiSettingsRow, payload: Record<string, unknown>) {
  const response = await fetch(`${settings.base_url.replace(/\/+$/g, '')}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-shared-secret': settings.shared_secret ?? '',
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      payload: data,
    }
  }

  return {
    ok: true,
    status: response.status,
    payload: data,
  }
}

async function callRemoteGatewayRelease(settings: RemoteAiSettingsRow) {
  const response = await fetch(`${settings.base_url.replace(/\/+$/g, '')}/release`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-shared-secret': settings.shared_secret ?? '',
    },
    body: JSON.stringify({}),
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      payload: data,
    }
  }

  return {
    ok: true,
    status: response.status,
    payload: data,
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
    const requestModelOverride = typeof body.modelOverride === 'string' ? body.modelOverride.trim() : ''
    const workflowId = typeof body.workflowId === 'string' ? body.workflowId.trim() : ''
    const targetImageField = normalizeProfessionImageField(body.targetImageField)
    const generationSource =
      typeof body.generationSource === 'string' && body.generationSource.trim() === 'remote_comfyui'
        ? 'remote_comfyui'
        : 'cloud'
    const finalPromptOverride = typeof body.finalPromptOverride === 'string' ? body.finalPromptOverride.trim() : ''
    const negativePromptOverride =
      typeof body.negativePromptOverride === 'string' ? body.negativePromptOverride.trim() : ''
    const seedOverride = normalizeSeedOverride(body.seedOverride)
    const sourceImageDataUrl =
      typeof body.sourceImageDataUrl === 'string' && body.sourceImageDataUrl.trim() ? body.sourceImageDataUrl.trim() : ''
    const sourceImageName =
      typeof body.sourceImageName === 'string' && body.sourceImageName.trim() ? body.sourceImageName.trim() : ''
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
    const selectedModel =
      activeProvider === 'huggingface' && requestModelOverride
        ? requestModelOverride
        : activeProvider === 'gemini'
          ? geminiModel
          : activeProvider === 'huggingface'
            ? huggingFaceModel
            : activeProvider === 'openai'
              ? openAiModel
              : null

    if (action === 'remote_health') {
      const remoteSettings = await loadRemoteAiSettings(adminClient)

      if (
        !remoteSettings ||
        !remoteSettings.is_enabled ||
        !remoteSettings.base_url.trim() ||
        !remoteSettings.shared_secret?.trim()
      ) {
        return jsonResponse({
          configured: false,
          ready: false,
          gateway_reachable: false,
          comfyui_reachable: false,
          provider: 'comfyui_gateway',
          message: '尚未完成共享 ComfyUI 主機設定。',
        })
      }

      const gatewayHealth = await callRemoteGatewayHealth(remoteSettings)

      if (!gatewayHealth.ok) {
        return jsonResponse({
          configured: true,
          ready: false,
          gateway_reachable: false,
          comfyui_reachable: false,
          provider: 'comfyui_gateway',
          message: '共享生圖主機無法連線。',
          diagnostics: debugSummary(gatewayHealth.payload) ?? `HTTP ${gatewayHealth.status}`,
        })
      }

      const gatewayPayload = (gatewayHealth.payload ?? {}) as Record<string, unknown>

      return jsonResponse({
        configured: true,
        ready: Boolean(gatewayPayload.ready),
        gateway_reachable: Boolean(gatewayPayload.gateway_reachable ?? true),
        comfyui_reachable: Boolean(gatewayPayload.comfyui_reachable),
        provider: 'comfyui_gateway',
        message: (gatewayPayload.message as string | undefined) ?? null,
        diagnostics: debugSummary(gatewayPayload),
      })
    }

    if (action === 'remote_release') {
      const remoteSettings = await loadRemoteAiSettings(adminClient)

      if (
        !remoteSettings ||
        !remoteSettings.is_enabled ||
        !remoteSettings.base_url.trim() ||
        !remoteSettings.shared_secret?.trim()
      ) {
        return jsonResponse({
          ok: true,
          released: false,
          provider: 'comfyui_gateway',
          message: 'Shared ComfyUI host is not configured.',
        })
      }

      const releaseResult = await callRemoteGatewayRelease(remoteSettings)

      if (!releaseResult.ok) {
        return jsonResponse(
          {
            error: 'Failed to release remote ComfyUI models.',
            diagnostics: {
              provider: 'comfyui_gateway',
              model: null,
              status: releaseResult.status,
              debug: debugSummary(releaseResult.payload),
            },
          },
          200
        )
      }

      const releasePayload = (releaseResult.payload ?? {}) as Record<string, unknown>

      return jsonResponse({
        ok: true,
        released: Boolean(releasePayload.released ?? true),
        provider: 'comfyui_gateway',
        released_at: releasePayload.released_at ?? null,
        reason: releasePayload.reason ?? 'manual',
      })
    }

    if (action === 'status') {
      return jsonResponse({
        configured_provider: configuredProvider,
        active_provider: activeProvider,
        provider_label: activeProvider ? PROVIDER_LABELS[activeProvider] : null,
        model: selectedModel,
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

    if (action === 'remote_preview' && !normalizedTargetType) {
      return jsonResponse({ error: 'Missing target type.' }, 400)
    }

    if (!activeProvider && action !== 'remote_preview' && action !== 'prompt_preview') {
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
            ? await generateHuggingFaceImage(probePrompt, huggingFaceApiKey, selectedModel ?? huggingFaceModel, DEFAULT_IMAGE_PROFILE)
            : await generateOpenAiImage(probePrompt, openAiApiKey, openAiModel, DEFAULT_IMAGE_PROFILE)

      if ('error' in probeResult) {
        return jsonResponse(
          {
            error: probeResult.error,
            diagnostics: {
              provider: activeProvider,
              model: probeResult.modelUsed ?? selectedModel,
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
        model: probeResult.modelUsed ?? selectedModel,
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
    let remoteAlbumName = ''
    let remoteRarity = ''
    let remoteCardColor = ''
    let remoteCardDescription = ''
    let remoteWorkflowJson = ''
    const imageProfile = getImageGenerationProfile(normalizedTargetType)

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
      finalPrompt = buildCardPrompt(
        {
          name: card.name,
          rarity: card.rarity,
          description: card.description,
          series: card.series,
          albumName,
          color: card.color,
        },
        nextStyle,
        nextPrompt
      )
      finalPrompt = `${finalPrompt} ${imageProfile.promptSuffix}`.trim()
      fileLabel = card.name || card.id
      fileFolder = 'cards'
      imageField = 'image_url'
      existingStoragePath = card.image_storage_path ?? null
      remoteAlbumName = albumName ?? ''
      remoteRarity = card.rarity
      remoteCardColor = card.color ?? ''
      remoteCardDescription = card.description ?? ''
    } else if (normalizedTargetType === 'equipment') {
      const { data: equipment, error: equipmentError } = await adminClient
        .from('equipment_templates')
        .select('id, name, rarity, description, slot_type, image_url, image_prompt, image_style')
        .eq('id', resolvedTargetId)
        .maybeSingle()

      if (equipmentError || !equipment) return jsonResponse({ error: 'Equipment not found.' }, 404)

      nextStyle = typeof body.imageStyle === 'string' && body.imageStyle.trim() ? body.imageStyle.trim() : equipment.image_style ?? DEFAULT_IMAGE_STYLE
      nextPrompt = typeof body.imagePrompt === 'string' ? body.imagePrompt.trim() : equipment.image_prompt ?? ''
      finalPrompt = buildEquipmentPrompt(
        {
          name: equipment.name,
          rarity: equipment.rarity,
          description: equipment.description,
          slotType: equipment.slot_type,
        },
        nextStyle,
        nextPrompt
      )
      fileLabel = equipment.name || equipment.id
      fileFolder = 'equipment'
      imageField = 'image_url'
      remoteCardDescription = equipment.description ?? ''
    } else if (normalizedTargetType === 'achievement') {
      const { data: achievement, error: achievementError } = await adminClient
        .from('achievements')
        .select('id, name, description, category, progress_mode, image_url, image_prompt, image_style, image_storage_path')
        .eq('id', resolvedTargetId)
        .maybeSingle()

      if (achievementError || !achievement) return jsonResponse({ error: 'Achievement not found.' }, 404)

      nextStyle = typeof body.imageStyle === 'string' && body.imageStyle.trim() ? body.imageStyle.trim() : achievement.image_style ?? DEFAULT_IMAGE_STYLE
      nextPrompt = typeof body.imagePrompt === 'string' ? body.imagePrompt.trim() : achievement.image_prompt ?? ''
      finalPrompt = buildAchievementPrompt(
        {
          name: achievement.name,
          description: achievement.description,
          category: achievement.category,
          progressMode: achievement.progress_mode,
        },
        nextStyle,
        nextPrompt
      )
      fileLabel = achievement.name || achievement.id
      fileFolder = 'achievements'
      imageField = 'image_url'
      existingStoragePath = achievement.image_storage_path ?? null
      remoteCardDescription = achievement.description ?? ''
    } else if (normalizedTargetType === 'album') {
      const { data: album, error: albumError } = await adminClient
        .from('card_albums')
        .select('id, name, description, cover_color, image_url, image_prompt, image_style, image_storage_path')
        .eq('id', resolvedTargetId)
        .maybeSingle()

      if (albumError || !album) return jsonResponse({ error: 'Album not found.' }, 404)

      const { count: cardCount } = await adminClient
        .from('cards')
        .select('id', { count: 'exact', head: true })
        .eq('album_id', resolvedTargetId)

      nextStyle = typeof body.imageStyle === 'string' && body.imageStyle.trim() ? body.imageStyle.trim() : album.image_style ?? DEFAULT_IMAGE_STYLE
      nextPrompt = typeof body.imagePrompt === 'string' ? body.imagePrompt.trim() : album.image_prompt ?? ''
      finalPrompt = buildAlbumPrompt(
        {
          name: album.name,
          description: album.description,
          coverColor: album.cover_color,
          cardCount: cardCount ?? 0,
        },
        nextStyle,
        nextPrompt
      )
      finalPrompt = `${finalPrompt} ${imageProfile.promptSuffix}`.trim()
      fileLabel = album.name || album.id
      fileFolder = 'albums'
      imageField = 'image_url'
      existingStoragePath = album.image_storage_path ?? null
      remoteAlbumName = album.name ?? ''
      remoteCardDescription = album.description ?? ''
    } else if (normalizedTargetType === 'profile') {
      const { data: profile, error: profileError } = await adminClient
        .from('profiles')
        .select('id, name, avatar_original_url, avatar_generated_url')
        .eq('id', resolvedTargetId)
        .maybeSingle()

      if (profileError || !profile) return jsonResponse({ error: 'Profile not found.' }, 404)
      nextStyle = typeof body.imageStyle === 'string' && body.imageStyle.trim() ? body.imageStyle.trim() : DEFAULT_IMAGE_STYLE
      nextPrompt = typeof body.imagePrompt === 'string' ? body.imagePrompt.trim() : 'Keep the person identity and transform the portrait into a friendly chibi anime school character.'
      finalPrompt = `${nextPrompt} Do not add text, logos, watermarks, or extra people.`
      fileLabel = profile.name || profile.id
      fileFolder = 'avatars'
      imageField = 'avatar_generated_url'
      remoteCardDescription = 'Student character avatar'
    } else {
      const { data: profession, error: professionError } = await adminClient
        .from('profession_templates')
        .select('id, name, code, description, theme_color, icon_url, image_prompt, image_style, unlock_tier')
        .eq('id', resolvedTargetId)
        .maybeSingle()

      if (professionError || !profession) return jsonResponse({ error: 'Profession not found.' }, 404)

      nextStyle = typeof body.imageStyle === 'string' && body.imageStyle.trim() ? body.imageStyle.trim() : profession.image_style ?? DEFAULT_IMAGE_STYLE
      nextPrompt = typeof body.imagePrompt === 'string' ? body.imagePrompt.trim() : profession.image_prompt ?? ''
      finalPrompt = buildProfessionPrompt(
        {
          name: profession.name,
          code: profession.code,
          description: profession.description,
          themeColor: profession.theme_color,
          unlockTier: profession.unlock_tier,
        },
        nextStyle,
        nextPrompt
      )
      if (targetImageField === 'icon_url_male') {
        finalPrompt = `${finalPrompt} Show a clearly male character design that matches this profession.`
      } else if (targetImageField === 'icon_url_female') {
        finalPrompt = `${finalPrompt} Show a clearly female character design that matches this profession.`
      }
      fileLabel = profession.name || profession.id
      fileFolder = 'professions'
      imageField = targetImageField
      remoteCardDescription = profession.description ?? ''
    }

    const useRemotePromptSettings = generationSource === 'remote_comfyui' || action === 'remote_preview'
    const remoteSettings = useRemotePromptSettings ? await loadRemoteAiSettings(adminClient) : null
    const selectedWorkflow = workflowId && useRemotePromptSettings ? await loadRemoteAiWorkflow(adminClient, workflowId, normalizedTargetType) : null
    remoteWorkflowJson = selectedWorkflow?.workflow_api_json ?? remoteSettings?.workflow_api_json ?? ''
    const resolvedNegativePrompt = useRemotePromptSettings ? negativePromptOverride || (remoteSettings?.negative_prompt ?? '') : ''
    const resolvedSeed = useRemotePromptSettings ? seedOverride ?? (remoteSettings ? generateRemoteSeed(remoteSettings) : null) : null
    const resolvedFinalPrompt = finalPromptOverride || finalPrompt

    if (action === 'prompt_preview') {
      return jsonResponse({
        ok: true,
        target_type: normalizedTargetType,
        target_id: resolvedTargetId,
        final_prompt: resolvedFinalPrompt,
        negative_prompt: resolvedNegativePrompt,
        seed: resolvedSeed,
        image_width: useRemotePromptSettings ? imageProfile.huggingFaceWidth : null,
        image_height: useRemotePromptSettings ? imageProfile.huggingFaceHeight : null,
        aspect_ratio: useRemotePromptSettings ? '3:4' : null,
        provider: generationSource,
        supports_negative_prompt: useRemotePromptSettings,
        supports_seed: useRemotePromptSettings,
      })
    }

    if (action === 'remote_preview') {
      if (
        !remoteSettings ||
        !remoteSettings.is_enabled ||
        !remoteSettings.base_url.trim() ||
        !remoteSettings.shared_secret?.trim() ||
        !remoteWorkflowJson.trim()
      ) {
        return jsonResponse({ error: '共享 ComfyUI 主機尚未完成設定。' }, 400)
      }

      const placeholders = {
        full_prompt: resolvedFinalPrompt,
        card_name: fileLabel,
        card_description: remoteCardDescription,
        album_name: remoteAlbumName,
        rarity: remoteRarity,
        image_style: nextStyle,
        extra_prompt: nextPrompt,
        card_color: remoteCardColor,
        negative_prompt: resolvedNegativePrompt,
        image_width: String(imageProfile.huggingFaceWidth),
        image_height: String(imageProfile.huggingFaceHeight),
        aspect_ratio: '3:4',
        seed: resolvedSeed,
      }

      const remoteGeneration = await callRemoteGatewayGenerate(remoteSettings, {
        workflow: remoteWorkflowJson,
        placeholders,
        sourceImageDataUrl: sourceImageDataUrl || undefined,
        sourceImageName: sourceImageName || undefined,
        timeoutMs: 300000,
      })

      if (!remoteGeneration.ok) {
        return jsonResponse(
          {
            error: '共享生圖主機生成失敗。',
            diagnostics: {
              provider: 'comfyui_gateway',
              model: null,
              status: remoteGeneration.status,
              debug: debugSummary(remoteGeneration.payload),
            },
          },
          200
        )
      }

      const remotePayload = (remoteGeneration.payload ?? {}) as Record<string, unknown>
      const previewImageBase64 = remotePayload.imageBase64
      const mimeType = typeof remotePayload.mimeType === 'string' ? remotePayload.mimeType : 'image/png'

      if (!previewImageBase64 || typeof previewImageBase64 !== 'string') {
        return jsonResponse(
          {
            error: '共享生圖主機沒有回傳圖片。',
            diagnostics: {
              provider: 'comfyui_gateway',
              model: null,
              status: 502,
              debug: debugSummary(remotePayload),
            },
          },
          200
        )
      }

      return jsonResponse({
        ok: true,
        target_id: resolvedTargetId,
        target_type: normalizedTargetType,
        card_id: resolvedTargetId,
        provider: 'comfyui_gateway',
        provider_label: PROVIDER_LABELS.comfyui_gateway,
        preview_image_base64: previewImageBase64,
        mime_type: mimeType,
        final_prompt: resolvedFinalPrompt,
      })
    }

    const generationResult =
      activeProvider === 'gemini'
        ? await generateGeminiImage(resolvedFinalPrompt, geminiApiKey, geminiModel)
        : activeProvider === 'huggingface'
          ? await generateHuggingFaceImage(resolvedFinalPrompt, huggingFaceApiKey, selectedModel ?? huggingFaceModel, imageProfile)
          : await generateOpenAiImage(resolvedFinalPrompt, openAiApiKey, openAiModel, imageProfile)

    if ('error' in generationResult) {
      return jsonResponse(
        {
          error: generationResult.error,
          diagnostics: {
            provider: activeProvider,
            model: generationResult.modelUsed ?? selectedModel,
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
    } else if (normalizedTargetType === 'achievement') {
      const { data, error: updateError } = await adminClient
        .from('achievements')
        .update({
          image_url: publicUrlData.publicUrl,
          icon_url: publicUrlData.publicUrl,
          image_prompt: nextPrompt || null,
          image_style: nextStyle,
          image_storage_path: filePath,
          image_generated_at: new Date().toISOString(),
        })
        .eq('id', resolvedTargetId)
        .select('*, achievement_conditions(*, achievement_condition_tasks(task_id))')
        .single()

      if (updateError) return jsonResponse({ error: updateError.message }, 500)
      record = data as Record<string, unknown>
    } else if (normalizedTargetType === 'album') {
      const { data, error: updateError } = await adminClient
        .from('card_albums')
        .update({
          image_url: publicUrlData.publicUrl,
          image_prompt: nextPrompt || null,
          image_style: nextStyle,
          image_storage_path: filePath,
        })
        .eq('id', resolvedTargetId)
        .select('*')
        .single()

      if (updateError) return jsonResponse({ error: updateError.message }, 500)
      record = data as Record<string, unknown>
    } else if (normalizedTargetType === 'profile') {
      const { data, error: updateError } = await adminClient
        .from('profiles')
        .update({ avatar_generated_url: publicUrlData.publicUrl, avatar_url: publicUrlData.publicUrl })
        .eq('id', resolvedTargetId)
        .select('*')
        .single()
      if (updateError) return jsonResponse({ error: updateError.message }, 500)
      record = data as Record<string, unknown>
    } else {
      const { data, error: updateError } = await adminClient
        .from('profession_templates')
        .update({
          [imageField]: publicUrlData.publicUrl,
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
      image_storage_path: normalizedTargetType === 'card' || normalizedTargetType === 'achievement' || normalizedTargetType === 'album' ? filePath : null,
      image_style: nextStyle,
      image_prompt: nextPrompt || null,
      provider: activeProvider,
      provider_label: PROVIDER_LABELS[activeProvider],
      key_source: keySource,
      model: generationResult.modelUsed ?? selectedModel,
      final_prompt: resolvedFinalPrompt,
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
