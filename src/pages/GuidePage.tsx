import { BookOpen, Gift, ShieldCheck, Sparkles, Star, Sword, Trophy, Wand2 } from 'lucide-react'

type LevelRow = {
  level: number
  totalPoints: number
  nextLevelPoints: number | null
}

function pointsRequiredForLevel(level: number) {
  if (level <= 1) return 0
  return (((level - 1) * level) / 2) * 120
}

const levelRows: LevelRow[] = Array.from({ length: 10 }, (_, index) => {
  const level = index + 1
  return {
    level,
    totalPoints: pointsRequiredForLevel(level),
    nextLevelPoints: level >= 60 ? null : pointsRequiredForLevel(level + 1),
  }
})

const professionMilestones = [
  { level: 'Lv.1-9', description: '還沒有職業能力，先以累積點數、完成任務與收集卡片為主。' },
  { level: 'Lv.10', description: '第一次選職業，開始擁有主職業被動效果。' },
  { level: 'Lv.20', description: '解鎖第二次選職，可新增一個職業。' },
  { level: 'Lv.30 / 40 / 50 / 60', description: '持續新增職業選擇，舊主職效果會保留，主職可切換。' },
]

const taskRules = [
  '任務可能是全校性或指定班級任務。',
  '任務可以設定週期上限，例如每日 1 次、每日 3 次、每週 1 次。',
  '任務可以設定開放時間，例如 07:00-08:00 只允許在這段時間完成。',
  '任務可以設定完成方式：掃描器、登入後按鈕，或兩者都開放。',
  '掃碼任務是否能在工作站直接發點，取決於任務本身的掃描設定與啟用狀態。',
]

const packRules = [
  '每個卡包都有自己的內容與權重，抽中機率會公開顯示在抽卡商店。',
  '不同稀有度會依卡包設定有不同機率，並不是所有卡包都相同。',
  '抽到重複卡片時，會累積成卡片數量，方便之後交換與交易。',
  '抽中 SSR / UR 以上稀有度時，系統會依設定顯示公告。',
]

export default function GuidePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">遊戲說明</h1>
        <p className="mt-1 text-sm text-slate-400">
          這一頁整理目前站內已實作的規則與機制，方便學生理解玩法，也方便教師說明。
        </p>
      </div>

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="flex items-center gap-2 text-lg font-semibold text-white">
          <BookOpen size={18} className="text-indigo-300" />
          系統核心玩法
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-white">
              <Star size={16} className="text-amber-300" />
              <span className="font-medium">點數與任務</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              學生透過完成任務、掃描條碼、按鈕領取等方式累積星星。星星會影響等級成長，也能用來抽卡與購買部分裝備。
            </p>
          </div>

          <div className="rounded-2xl bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-white">
              <Gift size={16} className="text-fuchsia-300" />
              <span className="font-medium">卡片收集</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              卡片依分集冊分類收藏。抽到重複卡片時會累積數量，而不是覆蓋，後續可延伸到交換與交易系統。
            </p>
          </div>

          <div className="rounded-2xl bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-white">
              <Sword size={16} className="text-emerald-300" />
              <span className="font-medium">角色養成</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              玩家角色會隨累積獲點升級，並逐步解鎖職業與裝備。這些效果會影響任務加點、抽卡率或商店折扣。
            </p>
          </div>

          <div className="rounded-2xl bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-white">
              <ShieldCheck size={16} className="text-cyan-300" />
              <span className="font-medium">權限角色與遊戲職業分開</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              `student / leader / teacher / admin` 是系統權限；職業、裝備、等級則是遊戲養成，不會和權限角色混在一起。
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="flex items-center gap-2 text-lg font-semibold text-white">
          <Sparkles size={18} className="text-amber-300" />
          任務規則
        </div>
        <div className="mt-4 space-y-3">
          {taskRules.map(rule => (
            <div key={rule} className="rounded-xl bg-slate-900/60 px-4 py-3 text-sm leading-6 text-slate-300">
              {rule}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="flex items-center gap-2 text-lg font-semibold text-white">
          <Star size={18} className="text-indigo-300" />
          等級規則
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          角色等級依「累積總獲點」計算，不會因為花掉星星而下降。系統目前採固定公式：
          <span className="mx-1 rounded bg-slate-900 px-2 py-1 text-slate-100">升到 Lv.n 所需總點數 = ((n-1) × n / 2) × 120</span>
        </p>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-700">
          <div className="grid grid-cols-[80px_1fr_1fr] bg-slate-900/80 px-4 py-3 text-xs font-medium text-slate-300">
            <span>等級</span>
            <span>達成此級總點數</span>
            <span>下一級總點數</span>
          </div>
          {levelRows.map(row => (
            <div
              key={row.level}
              className="grid grid-cols-[80px_1fr_1fr] border-t border-slate-700 bg-slate-800/70 px-4 py-3 text-sm text-slate-200"
            >
              <span>Lv.{row.level}</span>
              <span>{row.totalPoints}</span>
              <span>{row.nextLevelPoints ?? '已滿級'}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="flex items-center gap-2 text-lg font-semibold text-white">
          <Wand2 size={18} className="text-fuchsia-300" />
          職業解鎖
        </div>
        <div className="mt-4 space-y-3">
          {professionMilestones.map(item => (
            <div key={item.level} className="rounded-2xl bg-slate-900/60 p-4">
              <p className="font-medium text-white">{item.level}</p>
              <p className="mt-1 text-sm leading-6 text-slate-300">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="flex items-center gap-2 text-lg font-semibold text-white">
          <ShieldCheck size={18} className="text-emerald-300" />
          裝備欄位
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { name: '頭飾', desc: '偏任務型加成，例如每日任務或掃碼任務額外點數。' },
            { name: '項鍊', desc: '偏成長型或消費型效果，例如總獲點加成、商店折扣。' },
            { name: '戒指', desc: '偏抽卡型效果，例如 SSR / UR 小幅機率加成。' },
            { name: '寵物', desc: '偏特色被動，例如每日第一次任務加成或小機率額外獎勵。' },
          ].map(item => (
            <div key={item.name} className="rounded-2xl bg-slate-900/60 p-4">
              <p className="font-medium text-white">{item.name}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="flex items-center gap-2 text-lg font-semibold text-white">
          <Gift size={18} className="text-violet-300" />
          抽卡與卡片
        </div>
        <div className="mt-4 space-y-3">
          {packRules.map(rule => (
            <div key={rule} className="rounded-xl bg-slate-900/60 px-4 py-3 text-sm leading-6 text-slate-300">
              {rule}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <div className="flex items-center gap-2 text-lg font-semibold text-white">
          <Trophy size={18} className="text-amber-300" />
          公告與成就
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-slate-900/60 p-4">
            <p className="font-medium text-white">首頁公告</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              教師新增任務時可自動公告，管理員也能另外發布系統公告，玩家在首頁可直接看到最新消息。
            </p>
          </div>
          <div className="rounded-2xl bg-slate-900/60 p-4">
            <p className="font-medium text-white">高稀有度公告</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              抽到 SSR / UR 以上卡片時，系統會依設定顯示跑馬燈公告，並可選擇是否隱藏姓名。
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
