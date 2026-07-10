import { supabase } from './supabase'
import { invokeAiImageFunction } from './aiImage'
import type { RemoteAiSettings, RemoteAiWorkflow } from '../types'

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
  target_id: string
  target_type: 'card' | 'equipment' | 'profession'
  card_id?: string
  provider: string
  provider_label: string
  preview_image_base64: string
  mime_type: string
  final_prompt: string
}

export type RemoteAiReleaseResult = {
  ok: boolean
  released: boolean
  reason?: string
  released_at?: string | null
}

export async function loadRemoteAiWorkflows() {
  const { data, error } = await supabase.rpc('get_remote_ai_workflows')

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as RemoteAiWorkflow[]).sort((left, right) => {
    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order
    }

    return left.name.localeCompare(right.name, 'zh-Hant')
  })
}

export async function saveRemoteAiWorkflow(input: {
  id?: string | null
  name: string
  targetType: 'all' | 'card' | 'equipment' | 'profession'
  workflowApiJson: string
  isActive: boolean
  sortOrder: number
}) {
  const { data, error } = await supabase.rpc('upsert_remote_ai_workflow', {
    p_id: input.id ?? null,
    p_name: input.name,
    p_target_type: input.targetType,
    p_workflow_api_json: input.workflowApiJson,
    p_is_active: input.isActive,
    p_sort_order: input.sortOrder,
  })

  if (error) {
    throw new Error(error.message)
  }

  const workflow = Array.isArray(data) ? (data[0] as RemoteAiWorkflow | undefined) : (data as RemoteAiWorkflow | null)
  return workflow ?? null
}

export async function deleteRemoteAiWorkflow(id: string) {
  const { data, error } = await supabase.rpc('delete_remote_ai_workflow', {
    p_id: id,
  })

  if (error) {
    throw new Error(error.message)
  }

  return Boolean(data)
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
  seedMode: 'random' | 'fixed'
  fixedSeed: number | null
  isEnabled: boolean
}) {
  const { data, error } = await supabase.rpc('upsert_remote_ai_settings', {
    p_provider: 'comfyui_gateway',
    p_base_url: input.baseUrl,
    p_shared_secret: input.sharedSecret?.trim() || null,
    p_workflow_api_json: input.workflowApiJson,
    p_negative_prompt: input.negativePrompt,
    p_seed_mode: input.seedMode,
    p_fixed_seed: input.fixedSeed,
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

export async function generateRemoteImagePreview(input: {
  targetType: 'card' | 'equipment' | 'profession'
  targetId: string
  imagePrompt: string
  imageStyle: string
  workflowId?: string | null
  targetImageField?: string | null
  finalPromptOverride?: string
  negativePromptOverride?: string
  seedOverride?: number | null
}) {
  const result = await invokeAiImageFunction({
    action: 'remote_preview',
    targetType: input.targetType,
    targetId: input.targetId,
    imagePrompt: input.imagePrompt,
    imageStyle: input.imageStyle,
    workflowId: input.workflowId,
    targetImageField: input.targetImageField,
    finalPromptOverride: input.finalPromptOverride,
    negativePromptOverride: input.negativePromptOverride,
    seedOverride: input.seedOverride,
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

export async function generateRemoteCardPreview(input: {
  cardId: string
  imagePrompt: string
  imageStyle: string
  workflowId?: string | null
  finalPromptOverride?: string
  negativePromptOverride?: string
  seedOverride?: number | null
}) {
  return generateRemoteImagePreview({
    targetType: 'card',
    targetId: input.cardId,
    imagePrompt: input.imagePrompt,
    imageStyle: input.imageStyle,
    workflowId: input.workflowId,
    finalPromptOverride: input.finalPromptOverride,
    negativePromptOverride: input.negativePromptOverride,
    seedOverride: input.seedOverride,
  })
}

export async function releaseRemoteAiModels() {
  const result = await invokeAiImageFunction({ action: 'remote_release' })
  const data = result.data as Record<string, unknown> | null

  if (!result.ok || !data) {
    throw new Error((data?.error as string | undefined) ?? `Edge Function returned HTTP ${result.status}`)
  }

  if (data.error) {
    throw new Error(data.error as string)
  }

  return data as unknown as RemoteAiReleaseResult
}
