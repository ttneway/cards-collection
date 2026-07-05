import http from 'node:http'
import { URL } from 'node:url'

const port = Number(process.env.PORT || 8787)
const comfyuiBaseUrl = (process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188').replace(/\/+$/g, '')
const sharedSecret = process.env.GATEWAY_SHARED_SECRET || ''
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*'
const defaultTimeoutMs = Number(process.env.GENERATE_TIMEOUT_MS || 120000)

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

async function waitForImage(promptId, timeoutMs) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const { response, payload } = await fetchJson(`${comfyuiBaseUrl}/history/${encodeURIComponent(promptId)}`)

    if (!response.ok) {
      throw new Error(`讀取 ComfyUI 歷史紀錄失敗，HTTP ${response.status}`)
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

  throw new Error('共享生圖主機等待 ComfyUI 圖片輸出逾時。')
}

async function readRequestBody(request) {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

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
      writeJson(response, 500, { error: 'Gateway 尚未設定 GATEWAY_SHARED_SECRET。' }, origin)
      return
    }

    if (incomingSecret !== sharedSecret) {
      writeJson(response, 401, { error: '共享金鑰驗證失敗。' }, origin)
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
          message: comfyuiReachable ? '共享生圖主機已就緒。' : 'Gateway 可連線，但 ComfyUI 尚未就緒。',
          diagnostics: payload,
        },
        origin
      )
      return
    }

    if (url.pathname === '/generate' && request.method === 'POST') {
      const body = await readRequestBody(request)
      const workflowSource = body.workflow
      const placeholders = body.placeholders ?? {}
      const timeoutMs = Number(body.timeoutMs || defaultTimeoutMs)

      if (!workflowSource) {
        writeJson(response, 400, { error: '缺少 workflow。' }, origin)
        return
      }

      const workflowObject = typeof workflowSource === 'string' ? JSON.parse(workflowSource) : workflowSource
      const workflow = replacePlaceholders(workflowObject, placeholders)

      const { response: promptResponse, payload: promptPayload } = await fetchJson(`${comfyuiBaseUrl}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow }),
      })

      if (!promptResponse.ok || !promptPayload?.prompt_id) {
        writeJson(response, 502, { error: '送出 ComfyUI workflow 失敗。', diagnostics: promptPayload }, origin)
        return
      }

      const imageInfo = await waitForImage(promptPayload.prompt_id, timeoutMs)
      const imageUrl = new URL(`${comfyuiBaseUrl}/view`)
      imageUrl.searchParams.set('filename', imageInfo.filename)
      imageUrl.searchParams.set('type', imageInfo.type || 'output')
      imageUrl.searchParams.set('subfolder', imageInfo.subfolder || '')

      const imageResponse = await fetch(imageUrl)
      if (!imageResponse.ok) {
        writeJson(response, 502, { error: '讀取 ComfyUI 生成圖片失敗。', diagnostics: { status: imageResponse.status } }, origin)
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
        error: error instanceof Error ? error.message : 'Gateway 發生未預期錯誤。',
      },
      allowedOrigin === '*' ? '*' : allowedOrigin
    )
  }
})

server.listen(port, () => {
  console.log(`ComfyUI shared gateway listening on http://0.0.0.0:${port}`)
})
