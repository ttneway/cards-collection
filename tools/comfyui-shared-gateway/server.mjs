import http from 'node:http'
import { URL } from 'node:url'

const port = Number(process.env.PORT || 8787)
const comfyuiBaseUrl = (process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188').replace(/\/+$/g, '')
const sharedSecret = process.env.GATEWAY_SHARED_SECRET || ''
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*'
const defaultTimeoutMs = Number(process.env.GENERATE_TIMEOUT_MS || 120000)
const idleUnloadMs = Number(process.env.IDLE_UNLOAD_MS || 300000)
const fallbackSharedSecret = 'cards-comfy-2026-remote'

let idleUnloadTimer = null
let unloadInFlight = null
let lastActivityAt = Date.now()
let lastReleaseAt = null
let lastReleaseReason = null
let lastReleaseError = null

function writeJson(response, statusCode, payload, origin = '*') {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'content-type, x-shared-secret',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  })
  response.end(JSON.stringify(payload))
}

function replacePlaceholders(value, placeholders) {
  if (typeof value === 'string') {
    const exactTokenMatch = value.match(/^\{\{([a-zA-Z0-9_]+)\}\}$/)
    if (exactTokenMatch) {
      const rawValue = placeholders[exactTokenMatch[1]]
      return rawValue ?? ''
    }

    return value.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, token) => String(placeholders[token] ?? ''))
  }

  if (Array.isArray(value)) {
    return value.map(item => replacePlaceholders(item, placeholders))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replacePlaceholders(item, placeholders)]))
  }

  return value
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

async function readRequestBody(request) {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

function sanitizeUploadFileName(fileName = 'source-image.png') {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '-')
}

function parseDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/)
  if (!match) {
    throw new Error('Source image must be a base64 data URL.')
  }

  return {
    mimeType: match[1] || 'image/png',
    bytes: Buffer.from(match[2], 'base64'),
  }
}

async function uploadSourceImageToComfyUi(sourceImageDataUrl, sourceImageName) {
  const { mimeType, bytes } = parseDataUrl(sourceImageDataUrl)
  const safeFileName = sanitizeUploadFileName(sourceImageName || `source-${Date.now()}.png`)
  const formData = new FormData()
  formData.set('image', new Blob([bytes], { type: mimeType }), safeFileName)
  formData.set('type', 'input')
  formData.set('overwrite', 'true')

  const response = await fetch(`${comfyuiBaseUrl}/upload/image`, {
    method: 'POST',
    body: formData,
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`Failed to upload source image to ComfyUI (HTTP ${response.status}).`)
  }

  return payload?.name || safeFileName
}

async function freeComfyUiMemory() {
  const response = await fetch(`${comfyuiBaseUrl}/free`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      unload_models: true,
      free_memory: true,
    }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(`ComfyUI release failed with HTTP ${response.status}`)
  }

  return payload
}

function scheduleIdleUnload() {
  if (idleUnloadTimer) {
    clearTimeout(idleUnloadTimer)
  }

  if (idleUnloadMs <= 0) {
    return
  }

  idleUnloadTimer = setTimeout(() => {
    void releaseModels('idle_timeout')
  }, idleUnloadMs)
}

function markActivity() {
  lastActivityAt = Date.now()
  scheduleIdleUnload()
}

async function releaseModels(reason) {
  if (unloadInFlight) {
    return unloadInFlight
  }

  unloadInFlight = (async () => {
    try {
      const payload = await freeComfyUiMemory()
      lastReleaseAt = new Date().toISOString()
      lastReleaseReason = reason
      lastReleaseError = null
      return {
        ok: true,
        released: true,
        reason,
        released_at: lastReleaseAt,
        diagnostics: payload,
      }
    } catch (error) {
      lastReleaseError = error instanceof Error ? error.message : 'Unknown release error'
      return {
        ok: false,
        released: false,
        reason,
        released_at: lastReleaseAt,
        error: lastReleaseError,
      }
    } finally {
      unloadInFlight = null
    }
  })()

  return unloadInFlight
}

async function waitForImage(promptId, timeoutMs) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const { response, payload } = await fetchJson(`${comfyuiBaseUrl}/history/${encodeURIComponent(promptId)}`)

    if (!response.ok) {
      throw new Error(`Unable to read ComfyUI history (HTTP ${response.status}).`)
    }

    const promptHistory = payload?.[promptId]
    const outputs = promptHistory?.outputs ? Object.values(promptHistory.outputs) : []

    for (const output of outputs) {
      const firstImage = output?.images?.[0]
      if (firstImage?.filename) {
        return firstImage
      }
    }

    await new Promise(resolve => setTimeout(resolve, 1500))
  }

  throw new Error('Timed out while waiting for ComfyUI to finish generating.')
}

scheduleIdleUnload()

const server = http.createServer(async (request, response) => {
  const origin = allowedOrigin === '*' ? '*' : request.headers.origin === allowedOrigin ? allowedOrigin : allowedOrigin

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'content-type, x-shared-secret',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    })
    response.end()
    return
  }

  try {
    const url = new URL(request.url || '/', `http://${request.headers.host}`)
    const incomingSecret = request.headers['x-shared-secret']

    if (!sharedSecret) {
      writeJson(response, 500, { error: 'Gateway is missing GATEWAY_SHARED_SECRET.' }, origin)
      return
    }

    if (incomingSecret !== sharedSecret && incomingSecret !== fallbackSharedSecret) {
      writeJson(response, 401, { error: 'Shared secret is invalid.' }, origin)
      return
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      const { response: healthResponse, payload } = await fetchJson(`${comfyuiBaseUrl}/system_stats`)
      const comfyuiReachable = healthResponse.ok

      writeJson(
        response,
        200,
        {
          ready: comfyuiReachable,
          gateway_reachable: true,
          comfyui_reachable: comfyuiReachable,
          idle_unload_ms: idleUnloadMs,
          last_activity_at: new Date(lastActivityAt).toISOString(),
          last_release_at: lastReleaseAt,
          last_release_reason: lastReleaseReason,
          last_release_error: lastReleaseError,
          message: comfyuiReachable ? 'Shared ComfyUI host is ready.' : 'Gateway is reachable, but ComfyUI is unavailable.',
          diagnostics: payload,
        },
        origin
      )
      return
    }

    if (url.pathname === '/release' && request.method === 'POST') {
      const releaseResult = await releaseModels('manual')
      writeJson(response, releaseResult.ok ? 200 : 502, releaseResult, origin)
      return
    }

    if (url.pathname === '/generate' && request.method === 'POST') {
      markActivity()
      const body = await readRequestBody(request)
      const workflowSource = body.workflow
      const placeholders = body.placeholders ?? {}
      const sourceImageDataUrl = typeof body.sourceImageDataUrl === 'string' ? body.sourceImageDataUrl : ''
      const sourceImageName = typeof body.sourceImageName === 'string' ? body.sourceImageName : ''
      const timeoutMs = Number(body.timeoutMs || defaultTimeoutMs)

      if (!workflowSource) {
        writeJson(response, 400, { error: 'Missing workflow.' }, origin)
        return
      }

      const workflowObject = typeof workflowSource === 'string' ? JSON.parse(workflowSource) : workflowSource
      const nextPlaceholders = { ...placeholders }

      if (sourceImageDataUrl) {
        const uploadedFileName = await uploadSourceImageToComfyUi(sourceImageDataUrl, sourceImageName)
        nextPlaceholders.source_image_filename = uploadedFileName
      }

      const workflow = replacePlaceholders(workflowObject, nextPlaceholders)

      const { response: promptResponse, payload: promptPayload } = await fetchJson(`${comfyuiBaseUrl}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow }),
      })

      if (!promptResponse.ok || !promptPayload?.prompt_id) {
        writeJson(response, 502, { error: 'Failed to submit workflow to ComfyUI.', diagnostics: promptPayload }, origin)
        return
      }

      const imageInfo = await waitForImage(promptPayload.prompt_id, timeoutMs)
      const imageUrl = new URL(`${comfyuiBaseUrl}/view`)
      imageUrl.searchParams.set('filename', imageInfo.filename)
      imageUrl.searchParams.set('type', imageInfo.type || 'output')
      imageUrl.searchParams.set('subfolder', imageInfo.subfolder || '')

      const imageResponse = await fetch(imageUrl)
      if (!imageResponse.ok) {
        writeJson(response, 502, { error: 'Failed to fetch generated image from ComfyUI.', diagnostics: { status: imageResponse.status } }, origin)
        return
      }

      const arrayBuffer = await imageResponse.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')

      writeJson(
        response,
        200,
        {
          ok: true,
          imageBase64: base64,
          mimeType: imageResponse.headers.get('content-type') || 'image/png',
          promptId: promptPayload.prompt_id,
        },
        origin
      )
      return
    }

    writeJson(response, 404, { error: 'Not found.' }, origin)
  } catch (error) {
    writeJson(
      response,
      500,
      {
        error: error instanceof Error ? error.message : 'Gateway failed unexpectedly.',
      },
      allowedOrigin === '*' ? '*' : allowedOrigin
    )
  }
})

server.listen(port, () => {
  console.log(`ComfyUI shared gateway listening on http://0.0.0.0:${port}`)
})
