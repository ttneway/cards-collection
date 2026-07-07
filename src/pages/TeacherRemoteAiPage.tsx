import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, RefreshCw, Save, Server, Shield, Sparkles, Wifi } from 'lucide-react'
import { checkRemoteAiGateway, loadRemoteAiSettings, saveRemoteAiSettings, type RemoteAiGatewayHealth } from '../lib/remoteAi'
import { useAuthStore } from '../stores/authStore'
import type { RemoteAiSettings } from '../types'

const WORKFLOW_PLACEHOLDERS = [
  '{{full_prompt}}',
  '{{card_name}}',
  '{{card_description}}',
  '{{album_name}}',
  '{{rarity}}',
  '{{image_style}}',
  '{{extra_prompt}}',
  '{{card_color}}',
  '{{negative_prompt}}',
  '{{image_width}}',
  '{{image_height}}',
  '{{aspect_ratio}}',
  '{{seed}}',
] as const

const DEFAULT_WORKFLOW_TEMPLATE = `{
  "prompt": {
    "6": {
      "inputs": {
        "text": "{{full_prompt}}",
        "clip": ["11", 0]
      },
      "class_type": "CLIPTextEncode"
    },
    "7": {
      "inputs": {
        "text": "{{negative_prompt}}",
        "clip": ["11", 0]
      },
      "class_type": "CLIPTextEncode"
    }
  }
}`

type FormState = {
  baseUrl: string
  sharedSecret: string
  workflowApiJson: string
  negativePrompt: string
  seedMode: 'random' | 'fixed'
  fixedSeed: string
  isEnabled: boolean
}

function mapSettingsToForm(settings: RemoteAiSettings | null): FormState {
  return {
    baseUrl: settings?.base_url ?? '',
    sharedSecret: '',
    workflowApiJson: settings?.workflow_api_json || DEFAULT_WORKFLOW_TEMPLATE,
    negativePrompt: settings?.negative_prompt ?? '',
    seedMode: settings?.seed_mode ?? 'random',
    fixedSeed: settings?.fixed_seed !== null && settings?.fixed_seed !== undefined ? String(settings.fixed_seed) : '',
    isEnabled: settings?.is_enabled ?? false,
  }
}

export default function TeacherRemoteAiPage() {
  const { user } = useAuthStore()
  const [settings, setSettings] = useState<RemoteAiSettings | null>(null)
  const [form, setForm] = useState<FormState>(() => mapSettingsToForm(null))
  const [health, setHealth] = useState<RemoteAiGatewayHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement | null>(null)

  const canEdit = user?.role === 'admin'
  const configuredSummary = useMemo(() => {
    if (!settings) return '尚未設定共享生圖主機。'
    if (!settings.base_url) return '尚未填寫 Gateway 公開網址。'
    if (!settings.shared_secret_configured) return '尚未設定共享金鑰。'
    if (!settings.workflow_api_json.trim()) return '尚未填寫 ComfyUI API workflow JSON。'
    return settings.is_enabled ? '共享生圖主機已啟用。' : '設定已儲存，但目前尚未啟用。'
  }, [settings])

  useEffect(() => {
    void refreshSettings()
  }, [])

  async function refreshSettings() {
    setLoading(true)
    setError(null)

    try {
      const nextSettings = await loadRemoteAiSettings()
      setSettings(nextSettings)
      setForm(mapSettingsToForm(nextSettings))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '無法載入共享生圖設定。')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canEdit) return

    setSaving(true)
    setMessage(null)
    setError(null)

    try {
      const formData = new FormData(formRef.current ?? event.currentTarget)
      const requestedBaseUrl = String(formData.get('baseUrl') ?? '').trim()
      const requestedSharedSecret = String(formData.get('sharedSecret') ?? '')
      const requestedWorkflowJson = String(formData.get('workflowApiJson') ?? '')
      const requestedNegativePrompt = String(formData.get('negativePrompt') ?? '')
      const requestedSeedMode = String(formData.get('seedMode') ?? 'random') === 'fixed' ? 'fixed' : 'random'
      const requestedFixedSeedRaw = String(formData.get('fixedSeed') ?? '').trim()
      const requestedIsEnabled = formData.get('isEnabled') === 'on'
      const requestedFixedSeed =
        requestedSeedMode === 'fixed'
          ? requestedFixedSeedRaw === ''
            ? null
            : Number(requestedFixedSeedRaw)
          : null

      JSON.parse(requestedWorkflowJson)
      if (requestedSeedMode === 'fixed' && (!Number.isInteger(requestedFixedSeed) || requestedFixedSeed === null || requestedFixedSeed < 0)) {
        throw new Error('固定 seed 必須是 0 以上的整數。')
      }

      const nextSettings = await saveRemoteAiSettings({
        baseUrl: requestedBaseUrl,
        sharedSecret: requestedSharedSecret,
        workflowApiJson: requestedWorkflowJson,
        negativePrompt: requestedNegativePrompt,
        seedMode: requestedSeedMode,
        fixedSeed: requestedFixedSeed,
        isEnabled: requestedIsEnabled,
      })

      setSettings(nextSettings)
      setForm(mapSettingsToForm(nextSettings))

      if ((nextSettings?.workflow_api_json ?? '') !== requestedWorkflowJson) {
        await refreshSettings()
        setError('???????????? ComfyUI workflow ??????????????????')
        return
      }

      setForm(previous => ({
        ...previous,
        baseUrl: requestedBaseUrl,
        workflowApiJson: requestedWorkflowJson,
        negativePrompt: requestedNegativePrompt,
        seedMode: requestedSeedMode,
        fixedSeed: requestedSeedMode === 'fixed' ? requestedFixedSeedRaw : '',
        isEnabled: requestedIsEnabled,
        sharedSecret: '',
      }))
      setMessage('已更新共享 ComfyUI 主機設定。')
    } catch (saveError) {
      if (saveError instanceof SyntaxError) {
        setError('ComfyUI API workflow JSON 格式不正確，請先確認內容是完整的 JSON。')
      } else {
        setError(saveError instanceof Error ? saveError.message : '儲存設定失敗。')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleHealthCheck() {
    setTesting(true)
    setMessage(null)
    setError(null)

    try {
      const result = await checkRemoteAiGateway()
      setHealth(result)
      setMessage(result.ready ? '共享生圖主機連線成功。' : result.message ?? '共享生圖主機尚未就緒。')
    } catch (healthError) {
      setHealth(null)
      setError(healthError instanceof Error ? healthError.message : '無法測試共享生圖主機。')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">共享生圖主機</h1>
        <p className="mt-1 text-sm text-slate-400">在這裡設定全校共用的 ComfyUI Gateway，讓教師後台可以透過固定網址呼叫這台共享生圖主機。</p>
      </div>

      {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-white">
              <Server size={18} className="text-indigo-300" />
              目前狀態
            </h2>
            <p className="mt-2 text-sm text-slate-300">{loading ? '載入中...' : configuredSummary}</p>
            {settings?.updated_at ? <p className="mt-2 text-xs text-slate-500">最後更新：{new Date(settings.updated_at).toLocaleString('zh-TW')}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => void handleHealthCheck()}
            disabled={testing || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {testing ? <RefreshCw size={16} className="animate-spin" /> : <Wifi size={16} />}
            {testing ? '測試中...' : '測試連線'}
          </button>
        </div>

        {health ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className={`rounded-xl border px-4 py-3 text-sm ${health.configured ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-100' : 'border-slate-700 bg-slate-900/70 text-slate-300'}`}>
              <p className="font-medium">設定完成</p>
              <p className="mt-1 text-xs">{health.configured ? '是' : '否'}</p>
            </div>
            <div className={`rounded-xl border px-4 py-3 text-sm ${health.gateway_reachable ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-rose-500/30 bg-rose-500/10 text-rose-100'}`}>
              <p className="font-medium">Gateway</p>
              <p className="mt-1 text-xs">{health.gateway_reachable ? '可連線' : '無法連線'}</p>
            </div>
            <div className={`rounded-xl border px-4 py-3 text-sm ${health.comfyui_reachable ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-amber-500/30 bg-amber-500/10 text-amber-100'}`}>
              <p className="font-medium">ComfyUI</p>
              <p className="mt-1 text-xs">{health.comfyui_reachable ? '運作中' : '尚未就緒'}</p>
            </div>
          </div>
        ) : null}
      </section>

      <form ref={formRef} onSubmit={handleSave} className="space-y-5 rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="flex items-center gap-2 font-semibold text-white">
          <Shield size={18} className="text-fuchsia-300" />
          共用設定
        </div>

        {!canEdit ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            目前只有管理者可以修改這組全校共用設定。教師可以查看狀態並在卡牌管理頁直接使用。
          </div>
        ) : null}

        <div className="grid gap-4">
          <label className="space-y-2">
            <span className="text-sm text-slate-300">Gateway 公開網址</span>
            <input
              name="baseUrl"
              value={form.baseUrl}
              onChange={event => setForm(previous => ({ ...previous, baseUrl: event.target.value }))}
              placeholder="https://your-comfy-gateway.example.com"
              disabled={!canEdit}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white disabled:opacity-60"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm text-slate-300">共享金鑰</span>
            <input
              name="sharedSecret"
              type="password"
              value={form.sharedSecret}
              onChange={event => setForm(previous => ({ ...previous, sharedSecret: event.target.value }))}
              placeholder={settings?.shared_secret_configured ? '已設定；留空代表維持原本金鑰' : '請輸入與 Gateway 一致的共享金鑰'}
              disabled={!canEdit}
              autoComplete="off"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white disabled:opacity-60"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm text-slate-300">ComfyUI API workflow JSON</span>
            <textarea
              name="workflowApiJson"
              value={form.workflowApiJson}
              onChange={event => setForm(previous => ({ ...previous, workflowApiJson: event.target.value }))}
              rows={16}
              disabled={!canEdit}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 font-mono text-sm text-white disabled:opacity-60"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm text-slate-300">負面提示詞</span>
            <textarea
              name="negativePrompt"
              value={form.negativePrompt}
              onChange={event => setForm(previous => ({ ...previous, negativePrompt: event.target.value }))}
              rows={3}
              disabled={!canEdit}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white disabled:opacity-60"
            />
          </label>

          <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
            <div>
              <p className="text-sm text-slate-300">Seed 設定</p>
              <p className="mt-1 text-xs text-slate-500">可切換固定 seed 或每次亂數。若 workflow 中有 <code>{'{{seed}}'}</code>，系統會自動代入。</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200">
                <input
                  type="radio"
                  name="seedMode"
                  value="random"
                  checked={form.seedMode === 'random'}
                  onChange={() => setForm(previous => ({ ...previous, seedMode: 'random' }))}
                  disabled={!canEdit}
                  className="accent-indigo-500"
                />
                每次亂數
              </label>
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200">
                <input
                  type="radio"
                  name="seedMode"
                  value="fixed"
                  checked={form.seedMode === 'fixed'}
                  onChange={() => setForm(previous => ({ ...previous, seedMode: 'fixed' }))}
                  disabled={!canEdit}
                  className="accent-indigo-500"
                />
                固定 seed
              </label>
            </div>

            {form.seedMode === 'fixed' ? (
              <label className="space-y-2">
                <span className="text-sm text-slate-300">固定 seed 值</span>
                <input
                  name="fixedSeed"
                  type="number"
                  min="0"
                  step="1"
                  value={form.fixedSeed}
                  onChange={event => setForm(previous => ({ ...previous, fixedSeed: event.target.value }))}
                  disabled={!canEdit}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white disabled:opacity-60"
                />
              </label>
            ) : (
              <input type="hidden" name="fixedSeed" value="" />
            )}
          </div>

          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
            <input
              name="isEnabled"
              type="checkbox"
              checked={form.isEnabled}
              onChange={event => setForm(previous => ({ ...previous, isEnabled: event.target.checked }))}
              disabled={!canEdit}
              className="accent-indigo-500"
            />
            啟用共享 ComfyUI 主機
          </label>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Sparkles size={16} className="text-indigo-300" />
            可用佔位符
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {WORKFLOW_PLACEHOLDERS.map(item => (
              <span key={item} className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                {item}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">系統會在送到 Gateway 前，自動把這些佔位符替換成目前卡牌的提示詞、名稱、分集冊與風格資訊。</p>
        </div>

        {canEdit ? (
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-fuchsia-600 px-5 py-3 font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50"
          >
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? '儲存中...' : '儲存共享設定'}
          </button>
        ) : null}
      </form>

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="flex items-center gap-2 font-semibold text-white">
          <CheckCircle2 size={18} className="text-emerald-300" />
          Gateway 契約
        </div>
        <div className="mt-3 space-y-2 text-sm text-slate-300">
          <p>`GET /health`：回傳 Gateway 與 ComfyUI 是否可用。</p>
          <p>`POST /generate`：接收 workflow JSON、佔位符與共享金鑰，回傳單張 base64 圖片。</p>
        </div>
      </section>
    </div>
  )
}
