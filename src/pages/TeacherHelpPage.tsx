import { BookOpen, Cpu, Library, ListChecks, Package, Sparkles, Users, Wand2, Wrench } from 'lucide-react'

const sectionClassName = 'rounded-2xl border border-slate-700 bg-slate-800/70 p-5'

const huggingFaceExamples = [
  'black-forest-labs / FLUX.1-schnell',
  'stabilityai / stable-diffusion-xl-base-1.0',
  'ZB-Tech / Text-to-Image',
  'playgroundai / playground-v2.5-1024px-aesthetic',
]

export default function TeacherHelpPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">教師後台說明</h1>
        <p className="mt-1 text-sm text-slate-400">
          這裡整理教師後台每個頁面的用途、常見操作流程，以及 AI 生圖設定的實用說明。
        </p>
      </div>

      <section className={sectionClassName}>
        <div className="flex items-center gap-2">
          <BookOpen size={18} className="text-indigo-300" />
          <h2 className="text-lg font-semibold text-white">快速導覽</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-white"><Library size={16} className="text-indigo-300" />卡牌管理</div>
            <p className="mt-2 text-sm text-slate-400">建立卡牌、設定顏色、描述、上傳圖片，或使用 AI 生卡圖。</p>
          </div>
          <div className="rounded-xl bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-white"><Package size={16} className="text-violet-300" />分集冊與卡包</div>
            <p className="mt-2 text-sm text-slate-400">整理卡牌主題、設定卡包內容與抽卡張數、調整抽卡體驗。</p>
          </div>
          <div className="rounded-xl bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-white"><ListChecks size={16} className="text-emerald-300" />任務與成就</div>
            <p className="mt-2 text-sm text-slate-400">建立學生任務、獎勵與成就條件，搭配掃碼或按鈕完成。</p>
          </div>
          <div className="rounded-xl bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-white"><Users size={16} className="text-cyan-300" />學生管理</div>
            <p className="mt-2 text-sm text-slate-400">建立學生帳號、管理班級資料、補發登入資訊與掃碼資料。</p>
          </div>
          <div className="rounded-xl bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-white"><Wand2 size={16} className="text-fuchsia-300" />職業後台</div>
            <p className="mt-2 text-sm text-slate-400">設定職業名稱、效果、等級解鎖門檻，並可維護男女生不同職業圖片。</p>
          </div>
          <div className="rounded-xl bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-white"><Wrench size={16} className="text-amber-300" />裝備後台</div>
            <p className="mt-2 text-sm text-slate-400">建立裝備、設定效果、商店價格與圖片，也能使用 AI 協助生圖。</p>
          </div>
        </div>
      </section>

      <section id="ai-image" className={sectionClassName}>
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-fuchsia-300" />
          <h2 className="text-lg font-semibold text-white">AI 生圖怎麼用</h2>
        </div>
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          <p>目前系統支援兩種主要方式：雲端 AI 與共享 ComfyUI 主機。</p>
          <p>雲端 AI 適合快速測試；共享 ComfyUI 主機適合校內長期統一風格、共用工作流與模型。</p>
          <p>建議流程是：先填好名稱、描述、風格與補充提示詞，先生成預覽，確認滿意後再套用到卡牌、職業或裝備。</p>
        </div>
      </section>

      <section className={sectionClassName}>
        <div className="flex items-center gap-2">
          <Cpu size={18} className="text-emerald-300" />
          <h2 className="text-lg font-semibold text-white">Hugging Face 設定說明</h2>
        </div>
        <div className="mt-4 space-y-4 text-sm text-slate-300">
          <div className="rounded-xl bg-slate-900/60 p-4">
            <p className="font-medium text-white">1. 如何申請 API key</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-400">
              <li>前往 <a className="text-indigo-300 hover:text-indigo-200" href="https://huggingface.co/settings/tokens" target="_blank" rel="noreferrer">Hugging Face Tokens 頁面</a>。</li>
              <li>登入帳號後建立一組新的 Access Token。</li>
              <li>通常選擇可呼叫 Inference API 的權限即可。</li>
              <li>把 token 貼到「教師自備 API key」欄位。</li>
            </ol>
          </div>

          <div className="rounded-xl bg-slate-900/60 p-4">
            <p className="font-medium text-white">2. 作者 / 模型怎麼填</p>
            <p className="mt-2 text-slate-400">
              系統會把「作者」和「模型名」組合成 `作者/模型名`。例如作者填 `black-forest-labs`，模型名填 `FLUX.1-schnell`，完整路徑就是 `black-forest-labs/FLUX.1-schnell`。
            </p>
          </div>

          <div className="rounded-xl bg-slate-900/60 p-4">
            <p className="font-medium text-white">3. 常見模型路徑範例</p>
            <ul className="mt-2 space-y-1 text-slate-400">
              {huggingFaceExamples.map(example => (
                <li key={example}>- {example}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-100">
            <p className="font-medium">提醒</p>
            <p className="mt-2 text-sm">
              不同模型支援的服務供應商不一定相同。有些模型可以直接走 Hugging Face Inference，有些則需要改走其他供應商。若畫面出現不支援訊息，通常是模型路徑正確，但供應方式不符合。
            </p>
          </div>
        </div>
      </section>

      <section className={sectionClassName}>
        <div className="flex items-center gap-2">
          <Wand2 size={18} className="text-indigo-300" />
          <h2 className="text-lg font-semibold text-white">建議操作順序</h2>
        </div>
        <div className="mt-4 space-y-2 text-sm text-slate-300">
          <p>1. 先建立分集冊、職業、裝備等基礎資料。</p>
          <p>2. 再建立卡牌與卡包，確認圖片、抽卡設定與稀有度都正確。</p>
          <p>3. 最後建立任務、成就與學生資料，讓整體流程接起來。</p>
        </div>
      </section>
    </div>
  )
}
