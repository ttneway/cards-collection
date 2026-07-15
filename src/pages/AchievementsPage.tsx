import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Gift, Lock, RefreshCw, Trophy } from 'lucide-react'
import {
  ACHIEVEMENT_CATEGORY_LABELS,
  ACHIEVEMENT_PROGRESS_MODE_LABELS,
  claimAchievementReward,
  loadMyAchievementStatuses,
  syncMyAchievements,
} from '../lib/achievements'
import type { AchievementStatus } from '../types'

export default function AchievementsPage() {
  const [achievements, setAchievements] = useState<AchievementStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const unlockedCount = useMemo(
    () => achievements.filter(item => item.status !== 'locked').length,
    [achievements]
  )

  const loadStatuses = async () => {
    const rows = await loadMyAchievementStatuses()
    setAchievements(rows)
  }

  const syncAndLoad = async () => {
    setSyncing(true)
    setError(null)

    try {
      await syncMyAchievements()
      await loadStatuses()
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : '同步成就時發生錯誤。')
    } finally {
      setSyncing(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    void syncAndLoad()
  }, [])

  const handleClaim = async (achievementId: string) => {
    setClaimingId(achievementId)
    setMessage(null)
    setError(null)

    try {
      const result = await claimAchievementReward(achievementId)
      setMessage(result.message)
      await loadStatuses()
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : '領取成就獎勵時發生錯誤。')
    } finally {
      setClaimingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">成就</h1>
          <p className="mt-1 text-sm text-slate-400">已解鎖 {unlockedCount} / {achievements.length} 個成就</p>
        </div>
        <button
          type="button"
          onClick={() => void syncAndLoad()}
          disabled={syncing}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600 disabled:opacity-50"
        >
          <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
          {syncing ? '同步中...' : '重新同步'}
        </button>
      </div>

      {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</div> : null}
      {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/70 px-4 py-6 text-center text-sm text-slate-400">
          成就資料載入中...
        </div>
      ) : (
        <div className="grid gap-3">
          {achievements.map(achievement => {
            const unlocked = achievement.status !== 'locked'
            const claimable = achievement.status === 'claimable'
            const claimed = achievement.status === 'claimed'
            const imageUrl = achievement.image_url ?? achievement.icon_url

            return (
              <div
                key={achievement.achievement_id}
                className={`rounded-2xl border p-4 ${
                  unlocked ? 'border-slate-700 bg-slate-800/80' : 'border-slate-800 bg-slate-900/70'
                }`}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex gap-3">
                    {imageUrl ? (
                      <div className={`h-12 w-12 overflow-hidden rounded-xl border ${unlocked ? 'border-white/10' : 'border-slate-800 opacity-50'}`}>
                        <img src={imageUrl} alt={achievement.name} className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                          claimable
                            ? 'bg-amber-500/20 text-amber-300'
                            : claimed
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : unlocked
                                ? 'bg-indigo-500/20 text-indigo-300'
                                : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {claimed ? <CheckCircle2 size={24} /> : unlocked ? <Trophy size={24} /> : <Lock size={24} />}
                      </div>
                    )}

                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className={`font-semibold ${unlocked ? 'text-white' : 'text-slate-300'}`}>{achievement.name}</h3>
                        <span className="rounded-full bg-slate-700 px-2.5 py-1 text-xs text-slate-200">
                          {ACHIEVEMENT_PROGRESS_MODE_LABELS[achievement.progress_mode]}
                        </span>
                        <span className="rounded-full bg-slate-700 px-2.5 py-1 text-xs text-slate-200">
                          {ACHIEVEMENT_CATEGORY_LABELS[achievement.category]}
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-slate-400">{achievement.description || '尚未填寫描述'}</p>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-700">
                        <div
                          className={`h-full rounded-full ${
                            claimable || claimed ? 'bg-emerald-400' : 'bg-indigo-400'
                          }`}
                          style={{ width: `${Math.max(0, Math.min(achievement.progress_percent, 100))}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-400">{achievement.progress_summary}</p>

                      <div className="mt-3 space-y-1">
                        {achievement.conditions.map(condition => (
                          <p key={condition.id} className="text-xs text-slate-500">
                            - {condition.label}
                          </p>
                        ))}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-amber-300">
                        {achievement.points_reward > 0 ? <span>星星獎勵 {achievement.points_reward}</span> : null}
                        {achievement.card_reward ? <span>含卡牌獎勵</span> : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {claimable ? (
                      <button
                        type="button"
                        onClick={() => void handleClaim(achievement.achievement_id)}
                        disabled={claimingId === achievement.achievement_id}
                        className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                      >
                        <Gift size={16} />
                        {claimingId === achievement.achievement_id ? '領取中...' : '領取獎勵'}
                      </button>
                    ) : (
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs ${
                          claimed
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : unlocked
                              ? 'bg-indigo-500/20 text-indigo-300'
                              : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {claimed ? '已領取' : unlocked ? '可查看' : '未達成'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
