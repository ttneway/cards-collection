import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { Trophy, Lock } from 'lucide-react'
import type { Achievement } from '../types'

export default function AchievementsPage() {
  const { user } = useAuthStore()
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [userAchievements, setUserAchievements] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!user) return
    supabase.from('achievements').select('*').eq('is_active', true).then(({ data }) => {
      if (data) setAchievements(data)
    })
    supabase.from('user_achievements').select('achievement_id').eq('user_id', user.id).then(({ data }) => {
      if (data) setUserAchievements(new Set(data.map(a => a.achievement_id)))
    })
  }, [user])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">成就</h1>
      <p className="text-sm text-slate-400">已解鎖 {userAchievements.size} / {achievements.length}</p>

      <div className="grid gap-3">
        {achievements.map(achievement => {
          const unlocked = userAchievements.has(achievement.id)
          return (
            <div
              key={achievement.id}
              className={`bg-slate-800 rounded-xl p-4 flex items-center gap-4 ${unlocked ? '' : 'opacity-50'}`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                unlocked ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-500'
              }`}>
                {unlocked ? <Trophy size={24} /> : <Lock size={24} />}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{achievement.name}</h3>
                <p className="text-sm text-slate-400">{achievement.description}</p>
                {achievement.points_reward > 0 && (
                  <p className="text-xs text-amber-400 mt-1">獎勵 {achievement.points_reward} 星星</p>
                )}
              </div>
              {unlocked && (
                <span className="text-xs bg-green-600/20 text-green-400 px-2 py-1 rounded-full">已解鎖</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
