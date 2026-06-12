import { useAuthStore } from '../stores/authStore'

export default function TradesPage() {
  useAuthStore()

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">交換中心</h1>
      <p className="text-sm text-slate-400">此功能即將開放，敬請期待</p>

      <div className="text-center py-12 text-slate-500">
        <p>交換功能需教師或幹部核可後方可使用</p>
      </div>
    </div>
  )
}
