import { supabase } from './supabase'
import type {
  AchievementCategory,
  AchievementConditionType,
  AchievementProgressMode,
  AchievementStatus,
} from '../types'

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  task: '任務',
  card: '卡牌',
  points: '星星',
  mixed: '混合',
}

export const ACHIEVEMENT_PROGRESS_MODE_LABELS: Record<AchievementProgressMode, string> = {
  cumulative: '累積',
  streak: '連續',
  all_complete: '全部完成',
}

export const ACHIEVEMENT_CONDITION_LABELS: Record<AchievementConditionType, string> = {
  tasks_completed_total: '累積完成任務',
  tasks_completed_selected: '指定任務累積次數',
  task_streak_any: '連續完成任務',
  task_streak_selected: '指定任務連續完成',
  cards_collected_total: '累積收集卡牌',
  series_complete: '收齊系列',
  album_complete: '收齊卡冊',
  points_earned_total: '歷史累積星星',
  selected_tasks_all_complete: '指定任務全部完成',
  rarity_collection: '指定稀有度收集',
}

export async function syncMyAchievements() {
  const { data, error } = await supabase.rpc('sync_my_achievements')
  if (error) throw error
  return Number(data ?? 0)
}

export async function loadMyAchievementStatuses() {
  const { data, error } = await supabase.rpc('get_my_achievement_statuses')
  if (error) throw error

  return ((data ?? []) as any[]).map((row): AchievementStatus => ({
    ...row,
    conditions: Array.isArray(row.conditions) ? row.conditions : [],
  }))
}

export async function claimAchievementReward(achievementId: string) {
  const { data, error } = await supabase.rpc('claim_achievement_reward', {
    p_achievement_id: achievementId,
  })

  if (error) throw error
  return data as {
    ok: boolean
    achievement_id: string
    points_awarded: number
    card_reward: string | null
    card_reward_name: string | null
    message: string
  }
}
