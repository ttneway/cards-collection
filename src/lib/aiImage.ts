import { supabase } from './supabase'

export const DEFAULT_HUGGING_FACE_AUTHOR = 'black-forest-labs'
export const DEFAULT_HUGGING_FACE_MODEL_NAME = 'FLUX.1-schnell'

export const HUGGING_FACE_MODEL_OPTIONS = [
  { value: 'black-forest-labs/FLUX.1-schnell', label: 'FLUX.1 schnell' },
  { value: 'stabilityai/stable-diffusion-xl-base-1.0', label: 'Stable Diffusion XL' },
  { value: 'stabilityai/stable-diffusion-3.5-large', label: 'Stable Diffusion 3.5 Large' },
  { value: 'XLabs-AI/flux-RealismLora', label: 'FLUX Realism LoRA' },
] as const

export function splitHuggingFaceModelPath(modelPath: string | null | undefined) {
  const normalized = (modelPath ?? '').trim()
  if (!normalized) {
    return {
      author: DEFAULT_HUGGING_FACE_AUTHOR,
      modelName: DEFAULT_HUGGING_FACE_MODEL_NAME,
    }
  }

  const slashIndex = normalized.indexOf('/')
  if (slashIndex < 0) {
    return {
      author: DEFAULT_HUGGING_FACE_AUTHOR,
      modelName: normalized,
    }
  }

  const author = normalized.slice(0, slashIndex).trim() || DEFAULT_HUGGING_FACE_AUTHOR
  const modelName = normalized.slice(slashIndex + 1).trim() || DEFAULT_HUGGING_FACE_MODEL_NAME

  return { author, modelName }
}

export function buildHuggingFaceModelPath(author: string, modelName: string) {
  const normalizedAuthor = author.trim().replace(/^\/+|\/+$/g, '')
  const normalizedModelName = modelName.trim().replace(/^\/+|\/+$/g, '')

  if (!normalizedAuthor && !normalizedModelName) {
    return `${DEFAULT_HUGGING_FACE_AUTHOR}/${DEFAULT_HUGGING_FACE_MODEL_NAME}`
  }

  if (!normalizedAuthor) return normalizedModelName || DEFAULT_HUGGING_FACE_MODEL_NAME
  if (!normalizedModelName) return `${normalizedAuthor}/${DEFAULT_HUGGING_FACE_MODEL_NAME}`

  return `${normalizedAuthor}/${normalizedModelName}`
}

export type AiImageStatus = {
  ready: boolean
  configured_provider: string
  active_provider: string | null
  provider_label: string | null
  model: string | null
  missing_secret: string
  key_source: 'teacher' | 'system' | null
}

export type AiDiagnostics = {
  provider?: string | null
  model?: string | null
  status?: number | null
  debug?: string | null
}

export async function invokeAiImageFunction(body: Record<string, unknown>) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-card-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify(body),
  })

  const responseText = await response.text()
  let payload: Record<string, unknown> | null = null

  try {
    payload = responseText ? (JSON.parse(responseText) as Record<string, unknown>) : null
  } catch {
    payload = { error: responseText || `Edge Function returned HTTP ${response.status}` }
  }

  return {
    ok: response.ok,
    status: response.status,
    data: payload,
  }
}

export function formatDiagnosticsText(diagnostics: AiDiagnostics | string | null | undefined) {
  if (!diagnostics) return null
  if (typeof diagnostics === 'string') return diagnostics

  const lines = [
    diagnostics.provider ? `provider: ${diagnostics.provider}` : null,
    diagnostics.model ? `model: ${diagnostics.model}` : null,
    typeof diagnostics.status === 'number' ? `status: ${diagnostics.status}` : null,
    diagnostics.debug ? `debug: ${diagnostics.debug}` : null,
  ].filter(Boolean)

  return lines.length > 0 ? lines.join('\n') : null
}
