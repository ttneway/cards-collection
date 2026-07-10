import { Eye, RefreshCw, Wand2 } from 'lucide-react'

type AiPromptEditorProps = {
  visible: boolean
  loading: boolean
  generating: boolean
  finalPrompt: string
  negativePrompt: string
  seed: string
  supportsNegativePrompt: boolean
  supportsSeed: boolean
  onToggle: () => void
  onRefresh: () => void
  onGenerate: () => void
  onFinalPromptChange: (value: string) => void
  onNegativePromptChange: (value: string) => void
  onSeedChange: (value: string) => void
  disabled?: boolean
}

export default function AiPromptEditor({
  visible,
  loading,
  generating,
  finalPrompt,
  negativePrompt,
  seed,
  supportsNegativePrompt,
  supportsSeed,
  onToggle,
  onRefresh,
  onGenerate,
  onFinalPromptChange,
  onNegativePromptChange,
  onSeedChange,
  disabled = false,
}: AiPromptEditorProps) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600 disabled:opacity-50"
        >
          <Eye size={16} />
          查看本次提示詞
        </button>
        {visible ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={disabled || loading}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? '整理中...' : '依目前設定重算'}
          </button>
        ) : null}
      </div>

      {visible ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            這裡會顯示這一次真正送去生圖的提示詞。你可以直接修改後再送出。
          </p>

          <label className="block space-y-1">
            <span className="text-xs text-slate-400">finalPrompt</span>
            <textarea
              value={finalPrompt}
              onChange={event => onFinalPromptChange(event.target.value)}
              rows={8}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">
                negativePrompt {supportsNegativePrompt ? '' : '(目前來源不會使用)'}
              </span>
              <textarea
                value={negativePrompt}
                onChange={event => onNegativePromptChange(event.target.value)}
                rows={4}
                disabled={!supportsNegativePrompt}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white disabled:opacity-50"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-slate-400">seed {supportsSeed ? '' : '(目前來源不會使用)'}</span>
              <input
                type="text"
                inputMode="numeric"
                value={seed}
                onChange={event => onSeedChange(event.target.value)}
                disabled={!supportsSeed}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white disabled:opacity-50"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onGenerate}
              disabled={disabled || generating || loading || !finalPrompt.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50"
            >
              <Wand2 size={16} />
              {generating ? '生圖中...' : '使用以上提示詞生圖'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
