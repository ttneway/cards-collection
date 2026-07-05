import { supabase } from './supabase'
import { invokeAiImageFunction } from './aiImage'
import type { RemoteAiSettings } from '../types'

export type RemoteAiGatewayHealth = {
  configured: boolean
  ready: boolean
  gateway_reachable: boolean
  comfyui_reachable: boolean
  provider: string
  message: string | null
  diagnostics?: string | null
}

export type RemoteAiPreviewResult = {
  ok: boolean
  card_id: string
  provider: string
  provider_label: string
  preview_image_base64: string
  mime_type: string
  final_prompt: string
}

export async function loadRemoteAiSettings() {
  const { data, error } = await supabase.rpc('get_remote_ai_settings')

  if (error) {
    throw new Error(error.message)
  }

  const settings = Array.isArray(data) ? (data[0] as RemoteAiSettings | undefined) : (data as RemoteAiSettings | null)
  return settings ?? null
}

export async function saveRemoteAiSettings(input: {
  baseUrl: string
  sharedSecret?: string
  workflowApiJson: string
  negativePrompt: string
  isEnabled: boolean
}) {
  const { data, error } = await supabase.rpc('upsert_remote_ai_settings', {
    p_provider: 'comfyui_gateway',
    p_base_url: input.baseUrl,
    p_shared_secret: input.sharedSecret?.trim() || null,
    p_workflow_api_json: input.workflowApiJson,
    p_negative_prompt: input.negativePrompt,
    p_is_enabled: input.isEnabled,
  })

  if (error) {
    throw new Error(error.message)
  }

  const settings = Array.isArray(data) ? (data[0] as RemoteAiSettings | undefined) : (data as RemoteAiSettings | null)
  return settings ?? null
}

export async function checkRemoteAiGateway() {
  const result = await invokeAiImageFunction({ action: 'remote_health' })
  const data = result.data as Record<string, unknown> | null

  if (!result.ok || !data) {
    throw new Error((data?.error as string | undefined) ?? `Edge Function returned HTTP ${result.status}`)
  }

  if (data.error) {
    throw new Error(data.error as string)
  }

  return data as unknown as RemoteAiGatewayHealth
}

export async function generateRemoteCardPreview(input: {
  cardId: string
  imagePrompt: string
  imageStyle: string
}) {
  const result = await invokeAiImageFunction({
    action: 'remote_preview',
    targetType: 'card',
    targetId: input.cardId,
    imagePrompt: input.imagePrompt,
    imageStyle: input.imageStyle,
  })

  const data = result.data as Record<string, unknown> | null

  if (!result.ok || !data) {
    throw new Error((data?.error as string | undefined) ?? `Edge Function returned HTTP ${result.status}`)
  }

  if (data.error) {
    throw new Error(data.error as string)
  }

  return data as unknown as RemoteAiPreviewResult
}
