import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Cloud,
  Cpu,
  ExternalLink,
  ImagePlus,
  KeyRound,
  Layers3,
  Library,
  ListChecks,
  Package,
  Server,
  ShieldCheck,
  Sparkles,
  Trophy,
  Upload,
  Users,
  Wand2,
  Wifi,
  Workflow,
} from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

type HelpTab = 'overview' | 'cloud' | 'comfyui'

type PageGuide = {
  title: string
  description: string
  to: string
  icon: LucideIcon
  adminOnly?: boolean
}

const tabs: Array<{ id: HelpTab; label: string; icon: LucideIcon }> = [
  { id: 'overview', label: '後台功能', icon: BookOpen },
  { id: 'cloud', label: '雲端 AI', icon: Cloud },
  { id: 'comfyui', label: '共享 ComfyUI', icon: Server },
]

const pageGuides: PageGuide[] = [
  { title: '卡牌與分集冊', description: '先建立分集冊，再建立卡牌；可上傳圖片、雲端生圖或使用共享 ComfyUI。', to: '/teacher/cards', icon: Library },
  { title: '卡包管理', description: '設定卡包內容、抽取張數與連抽方式，控制學生可抽到哪些卡牌。', to: '/teacher/packs', icon: Package },
  { title: '任務管理', description: '建立全校、每日、每週或指定學生任務，設定獎勵、冷卻與週期上限。', to: '/teacher/tasks', icon: ListChecks },
  { title: '成就管理', description: '建立累積、連續與全部完成條件；學生達成後可手動領取獎勵。', to: '/teacher/achievements', icon: Trophy },
  { title: '學生管理', description: '查看學生資料、點數、卡牌與角色狀態，進行教師端調整。', to: '/teacher/students', icon: Users },
  { title: '職業管理', description: '建立職業、每級成長效果，以及男性與女性職業圖片。', to: '/teacher/professions', icon: Wand2 },
  { title: '裝備管理', description: '建立裝備、部位、稀有度與效果，並製作裝備圖片。', to: '/teacher/equipment', icon: Sparkles },
  { title: '學習分析', description: '查看任務、點數、卡牌與學生參與情形。', to: '/teacher/analytics', icon: BarChart3 },
  { title: '共享生圖設定', description: '設定 Gateway、共享金鑰、預設規則與多組 ComfyUI 工作流。', to: '/teacher/ai-remote', icon: Server, adminOnly: true },
]

const workflowPlaceholders = [
  ['{{full_prompt}}', '系統整理後的完整自然語言提示詞'],
  ['{{negative_prompt}}', '共享設定或本次修改的負面提示詞'],
  ['{{seed}}', '固定 seed 或每次自動產生的亂數 seed'],
  ['{{image_width}}', '依用途自動計算的圖片寬度'],
  ['{{image_height}}', '依用途自動計算的圖片高度'],
  ['{{aspect_ratio}}', '目前圖片用途建議的比例'],
  ['{{card_name}}', '卡牌、裝備、職業、成就或分集冊名稱'],
  ['{{extra_prompt}}', '教師輸入的補充提示詞'],
  ['{{source_image_filename}}', '圖生圖上傳到 ComfyUI 後的檔名'],
]

const errorGuides = [
  ['設定未完成', '請管理員確認網址、共享金鑰、預設 workflow 與「啟用共享主機」都已設定。'],
  ['Gateway 無法連線', '確認這台生圖主機已開機，Gateway 與 Tunnel 都已啟動，公開網址沒有變更。'],
  ['ComfyUI 未就緒', 'Gateway 可以連線，但 ComfyUI 尚未啟動、仍在載入，或監聽的連接埠不正確。'],
  ['工作流送出失敗', '確認貼入的是「API 格式」JSON，且工作流使用的模型、LoRA 與自訂節點都已安裝。'],
  ['圖生圖找不到圖片', '先在生圖區上傳參考圖；工作流需有 LoadImage 節點，或使用 {{source_image_filename}}。'],
  ['生圖逾時', '大型模型可能需要較久。先到 ComfyUI 看佇列與錯誤，再確認顯示卡記憶體是否足夠。'],
  ['生成成功但沒有圖片', '工作流必須包含可輸出的 SaveImage 或 PreviewImage 節點，系統預設取第一張輸出圖。'],
]

function SectionTitle({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description?: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <Icon size={19} className="text-indigo-300" />
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      {description ? <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p> : null}
    </div>
  )
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 border-t border-slate-700/80 py-5 first:border-t-0 first:pt-0 sm:grid-cols-[2.5rem_1fr]">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/15 font-mono text-sm font-semibold text-indigo-200">
        {number}
      </div>
      <div>
        <h3 className="font-semibold text-white">{title}</h3>
        <div className="mt-2 space-y-2 text-sm leading-6 text-slate-300">{children}</div>
      </div>
    </div>
  )
}

export default function TeacherHelpPage() {
  const { user } = useAuthStore()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const activeTab: HelpTab =
    requestedTab === 'cloud' || requestedTab === 'comfyui' || requestedTab === 'overview'
      ? requestedTab
      : location.hash === '#ai-image'
        ? 'cloud'
        : 'overview'

  function selectTab(tab: HelpTab) {
    setSearchParams({ tab })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="border-b border-slate-700 pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-indigo-300">Teacher handbook</p>
            <h1 className="mt-2 text-2xl font-bold text-white">教師後台說明</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              依照目前系統功能整理。先從功能總覽找到要處理的頁面，再依生圖來源查看雲端 AI 或共享 ComfyUI 教學。
            </p>
          </div>
          {user?.role === 'admin' ? (
            <Link
              to="/teacher/ai-remote"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white no-underline hover:bg-indigo-500"
            >
              <Server size={16} />
              開啟共享生圖設定
            </Link>
          ) : null}
        </div>
      </header>

      <nav aria-label="說明頁分頁" className="overflow-x-auto border-b border-slate-700 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max gap-1">
          {tabs.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id)}
                aria-selected={isActive}
                className={`flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors sm:px-4 ${
                  isActive
                    ? 'border-indigo-400 text-white'
                    : 'border-transparent text-slate-400 hover:border-slate-600 hover:text-slate-200'
                }`}
              >
                <Icon size={16} className="hidden sm:block" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </nav>

      {activeTab === 'overview' ? (
        <div className="space-y-8">
          <section>
            <SectionTitle icon={CheckCircle2} title="建議操作順序" description="第一次設定系統時，依照這個順序會比較容易檢查問題。" />
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ['先建立內容', '建立分集冊、卡牌、職業、裝備、任務與成就。'],
                ['再設定取得方式', '設定卡包、任務獎勵、成就獎勵與學生可使用的功能。'],
                ['最後用學生帳號驗證', '確認卡圖、牌庫、角色、任務領取與成就進度都正確。'],
              ].map(([title, description], index) => (
                <div key={title} className="rounded-lg border border-slate-700 bg-slate-800/70 p-4">
                  <p className="font-mono text-xs text-indigo-300">STEP {index + 1}</p>
                  <p className="mt-2 font-semibold text-white">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="border-t border-slate-700 pt-7">
            <SectionTitle icon={Layers3} title="各頁面功能" description="點選項目可直接前往對應的教師後台頁面。" />
            <div className="grid gap-2 lg:grid-cols-2">
              {pageGuides.map(item => {
                const Icon = item.icon
                const unavailable = item.adminOnly && user?.role !== 'admin'
                const content = (
                  <>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-indigo-300">
                      <Icon size={19} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-white">{item.title}</p>
                        {item.adminOnly ? <span className="text-xs text-amber-300">僅管理員設定</span> : null}
                      </div>
                      <p className="mt-1 text-sm leading-5 text-slate-400">{item.description}</p>
                    </div>
                    {!unavailable ? <ChevronRight size={17} className="shrink-0 text-slate-500" /> : null}
                  </>
                )

                return unavailable ? (
                  <div key={item.to} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4 opacity-75">
                    {content}
                  </div>
                ) : (
                  <Link key={item.to} to={item.to} className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/60 p-4 no-underline hover:border-indigo-500/60 hover:bg-slate-800">
                    {content}
                  </Link>
                )
              })}
            </div>
          </section>

          <section className="border-t border-slate-700 pt-7">
            <SectionTitle icon={ShieldCheck} title="權限與資料安全" />
            <div className="grid gap-4 text-sm leading-6 text-slate-300 md:grid-cols-2">
              <div>
                <p className="font-medium text-white">一般教師</p>
                <p className="mt-1">可管理教學內容並使用已設定好的共享工作流，但不能修改全校共用的 Gateway、金鑰與工作流。</p>
              </div>
              <div>
                <p className="font-medium text-white">管理員</p>
                <p className="mt-1">可以維護共享生圖主機與系統設定。共享金鑰不會在一般列表中顯示明文。</p>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === 'cloud' ? (
        <div id="ai-image" className="space-y-8">
          <section>
            <SectionTitle icon={Cloud} title="雲端 AI 生圖" description="適合不依賴學校生圖主機的情況。教師可使用自己的 API key，使用費與額度由供應商決定。" />
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ['Gemini', '輸入 Google AI Studio API key。若出現 429，通常是額度不足或流量限制。'],
                ['OpenAI', '輸入可使用圖片模型的 OpenAI API key；ChatGPT 訂閱與 API 額度分開計算。'],
                ['Hugging Face', '輸入 Access Token、作者名稱與模型名稱；模型仍需支援目前選用的推論供應商。'],
              ].map(([title, description]) => (
                <div key={title} className="rounded-lg border border-slate-700 bg-slate-800/70 p-4">
                  <p className="font-semibold text-white">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="border-t border-slate-700 pt-7">
            <SectionTitle icon={KeyRound} title="Hugging Face 設定" />
            <Step number={1} title="申請 Access Token">
              <p>
                前往{' '}
                <a className="text-indigo-300 hover:text-indigo-200" href="https://huggingface.co/settings/tokens" target="_blank" rel="noreferrer">
                  Hugging Face Tokens <ExternalLink size={13} className="inline" />
                </a>
                ，建立具有推論權限的 token，再貼到教師自備 API key 欄位。
              </p>
            </Step>
            <Step number={2} title="拆分作者與模型名稱">
              <p>模型網址若是 <code className="text-indigo-200">huggingface.co/black-forest-labs/FLUX.1-schnell</code>：</p>
              <p>作者填 <code className="text-white">black-forest-labs</code>，模型填 <code className="text-white">FLUX.1-schnell</code>。</p>
            </Step>
            <Step number={3} title="先檢查，再生圖">
              <p>按「檢查」確認供應商與模型。模型頁存在不代表一定支援 Inference API；若顯示 Model not supported，請更換可推論的模型。</p>
            </Step>
          </section>

          <section className="border-t border-slate-700 pt-7">
            <SectionTitle icon={ImagePlus} title="各頁通用生圖流程" />
            <ol className="grid gap-3 text-sm text-slate-300 md:grid-cols-2">
              {[
                '先填好名稱、描述、風格與補充提示詞。',
                '選擇雲端 AI，輸入供應商與教師自己的 API key。',
                '按「查看本次提示詞」，需要時修改 finalPrompt、negativePrompt 與 seed。',
                '生成後先看預覽，確認正確再儲存或套用；失敗時舊圖片不會被覆蓋。',
              ].map((text, index) => (
                <li key={text} className="flex gap-3 rounded-lg border border-slate-700 bg-slate-800/60 p-4">
                  <span className="font-mono text-indigo-300">{index + 1}</span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      ) : null}

      {activeTab === 'comfyui' ? (
        <div className="space-y-8">
          <section>
            <SectionTitle icon={Server} title="共享 ComfyUI 的運作方式" description="這台電腦負責模型與生圖；教師可從不同電腦開啟 GitHub Pages 網站，透過固定 Tunnel 使用它。" />
            <div className="grid items-stretch gap-2 text-center text-sm md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
              {[
                ['卡牌網站', '送出提示詞與工作流'],
                ['固定 Tunnel', '提供 HTTPS 公開入口'],
                ['Gateway', '驗證金鑰並轉送'],
                ['ComfyUI', '載入模型並產生圖片'],
              ].map(([title, description], index) => (
                <div key={title} className="contents">
                  <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-4">
                    <p className="font-semibold text-white">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
                  </div>
                  {index < 3 ? <ChevronRight className="mx-auto self-center rotate-90 text-indigo-300 md:rotate-0" size={18} /> : null}
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
              <p className="font-medium">重要觀念</p>
              <p className="mt-1">GitHub Pages 不會直接連到教師電腦的 127.0.0.1。公開連線一定經過 Tunnel 與 Gateway，ComfyUI 本身不直接暴露在網路上。</p>
            </div>
          </section>

          <section className="border-t border-slate-700 pt-7">
            <SectionTitle icon={ShieldCheck} title="管理員首次設定" description="這一段只需由管理員在共享生圖主機設定一次。" />
            <Step number={1} title="確認三個服務都在執行">
              <p>共享主機開機後，確認 ComfyUI、Gateway 與 Tunnel 都已自動啟動。ComfyUI 可以只監聽本機連線，由 Gateway 代為存取。</p>
            </Step>
            <Step number={2} title="從 ComfyUI 匯出 API 格式工作流">
              <p>在 ComfyUI Desktop 載入並成功執行工作流，再使用「Save (API Format)」或開發者選單中的 API 格式匯出。</p>
              <p>一般介面工作流 JSON 含有版面座標，不能直接當 API workflow 使用。</p>
            </Step>
            <Step number={3} title="加入提示詞與 seed 佔位符">
              <p>把正面提示詞節點的文字改成 <code className="text-indigo-200">{'{{full_prompt}}'}</code>，負面提示詞可改成 <code className="text-indigo-200">{'{{negative_prompt}}'}</code>，取樣器 seed 可改成 <code className="text-indigo-200">{'{{seed}}'}</code>。</p>
            </Step>
            <Step number={4} title="新增共享工作流">
              <p>到「共享生圖設定」按「新增工作流」，填寫名稱、適用頁面、排序與 API workflow JSON，再啟用並儲存。</p>
              <p>適用頁面可選全部、卡牌、裝備、職業、成就或分集冊。教師只會看到符合目前頁面的工作流。</p>
            </Step>
            <Step number={5} title="完成主機共用設定">
              <p>填入 Gateway 的 HTTPS 公開網址與共享金鑰，設定預設負面提示詞、亂數或固定 seed，最後開啟「啟用共享 ComfyUI 主機」。</p>
            </Step>
            <Step number={6} title="按測試連線確認三段狀態">
              <p>設定完成、Gateway 可連線、ComfyUI 就緒都應顯示成功。若其中一段失敗，依本頁下方的故障排查處理。</p>
            </Step>
          </section>

          <section className="border-t border-slate-700 pt-7">
            <SectionTitle icon={Workflow} title="工作流 JSON 怎麼準備" description="保留模型與節點連線，只把需要由網站動態替換的輸入改成佔位符。" />
            <div className="overflow-hidden rounded-lg border border-slate-700">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800 text-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-medium">佔位符</th>
                    <th className="px-4 py-3 font-medium">系統代入內容</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-900/50 text-slate-400">
                  {workflowPlaceholders.map(([placeholder, description]) => (
                    <tr key={placeholder}>
                      <td className="px-4 py-3 font-mono text-indigo-200">{placeholder}</td>
                      <td className="px-4 py-3">{description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
                <p className="font-medium text-white">文字生圖工作流</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">工作流至少需要模型載入、提示詞編碼、取樣、解碼，以及 SaveImage 或 PreviewImage 輸出。系統預設取第一張輸出圖。</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
                <p className="font-medium text-white">圖生圖工作流</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">工作流需要 LoadImage 節點。建議把 image 欄位設成 <code className="text-indigo-200">{'{{source_image_filename}}'}</code>；若沒有佔位符，Gateway 會嘗試綁定第一個 LoadImage 節點。</p>
              </div>
            </div>
          </section>

          <section className="border-t border-slate-700 pt-7">
            <SectionTitle icon={Wand2} title="教師實際生圖流程" description="卡牌、分集冊、職業、裝備與成就頁面都使用相同的預覽流程。" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                [Workflow, '選工作流', '選擇適合目前頁面與用途的共享工作流。'],
                [Upload, '需要時上傳參考圖', '圖生圖才需要；文字生圖可略過。'],
                [BookOpen, '查看本次提示詞', '可修改 finalPrompt、negativePrompt 與 seed。'],
                [CheckCircle2, '產生預覽再套用', '預覽不會覆蓋舊圖，按套用後才正式儲存。'],
              ].map(([Icon, title, description]) => {
                const ItemIcon = Icon as LucideIcon
                return (
                  <div key={String(title)} className="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
                    <ItemIcon size={18} className="text-indigo-300" />
                    <p className="mt-3 font-medium text-white">{String(title)}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-400">{String(description)}</p>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100">
              <p className="font-medium">提示詞已使用自然語言</p>
              <p className="mt-1">名稱用來描述主體，補充提示詞用來描述場景。系統會要求模型不要把卡名、色碼、欄位名稱或操作文字印進圖片；卡名與標籤由網站介面另外顯示。</p>
            </div>
          </section>

          <section className="border-t border-slate-700 pt-7">
            <SectionTitle icon={CircleAlert} title="常見錯誤與處理方式" />
            <div className="divide-y divide-slate-700 border-y border-slate-700">
              {errorGuides.map(([errorTitle, solution]) => (
                <div key={errorTitle} className="grid gap-1 py-4 md:grid-cols-[12rem_1fr] md:gap-4">
                  <p className="font-medium text-rose-200">{errorTitle}</p>
                  <p className="text-sm leading-6 text-slate-400">{solution}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="border-t border-slate-700 pt-7">
            <SectionTitle icon={Cpu} title="主機使用與記憶體" />
            <div className="grid gap-4 text-sm leading-6 text-slate-300 md:grid-cols-2">
              <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
                <div className="flex items-center gap-2 font-medium text-white"><Wifi size={17} className="text-emerald-300" />開機後</div>
                <p className="mt-2">ComfyUI、Gateway 與 Tunnel 應由開機自動啟動。網站顯示主機不可用時，先回到共享主機檢查這三個服務。</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
                <div className="flex items-center gap-2 font-medium text-white"><Cpu size={17} className="text-amber-300" />閒置後</div>
                <p className="mt-2">系統可在離開生圖頁面或一段時間沒有生圖時釋放 ComfyUI 模型，以降低顯示卡記憶體占用；下一次生圖會重新載入模型。</p>
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-3 border-t border-slate-700 pt-6 sm:flex-row">
            {user?.role === 'admin' ? (
              <Link to="/teacher/ai-remote" className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white no-underline hover:bg-indigo-500">
                <Server size={16} />
                前往共享生圖設定
              </Link>
            ) : null}
            <button type="button" onClick={() => selectTab('overview')} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-600 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-800">
              <BookOpen size={16} />
              回到後台功能總覽
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
