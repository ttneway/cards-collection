export type Role = 'student' | 'leader' | 'teacher'

export type Rarity = 'N' | 'R' | 'SR' | 'SSR' | 'UR'

export type TaskType = 'scan' | 'approve' | 'auto'

export type TradeStatus = 'pending' | 'approved' | 'rejected'

export type AchievementConditionType =
  | 'cards_collected'
  | 'points'
  | 'tasks_completed'
  | 'series_complete'
  | 'rarity_collection'

export interface Profile {
  id: string
  email: string
  name: string
  student_id: string | null
  role: Role
  class_id: string | null
  stars: number
  avatar_url: string | null
  created_at: string
}

export interface Class {
  id: string
  name: string
  grade: number
  teacher_id: string
  created_at: string
}

export interface ClassLeader {
  id: string
  class_id: string
  user_id: string
  created_at: string
}

export interface Card {
  id: string
  name: string
  rarity: Rarity
  description: string
  series: string
  image_url: string | null
  color: string
  is_limited: boolean
  is_active: boolean
  created_at: string
}

export interface UserCard {
  id: string
  user_id: string
  card_id: string
  count: number
  acquired_at: string
  card?: Card
}

export interface CardPack {
  id: string
  name: string
  description: string
  cost: number
  image_url: string | null
  is_active: boolean
  created_at: string
}

export interface PackContent {
  id: string
  pack_id: string
  card_id: string
  weight: number
  card?: Card
}

export interface Task {
  id: string
  title: string
  description: string
  type: TaskType
  points: number
  task_code: string | null
  created_by: string
  class_id: string | null
  is_active: boolean
  max_completions: number | null
  starts_at: string | null
  ends_at: string | null
  created_at: string
}

export interface TaskReward {
  id: string
  task_id: string
  card_id: string
}

export interface TaskCompletion {
  id: string
  task_id: string
  user_id: string
  completed_at: string
  approved_by: string | null
  status: 'pending' | 'approved' | 'rejected'
}

export interface Achievement {
  id: string
  name: string
  description: string
  icon_url: string | null
  condition_type: AchievementConditionType
  condition_value: number
  condition_card_id: string | null
  condition_series: string | null
  condition_rarity: Rarity | null
  card_reward: string | null
  points_reward: number
  is_active: boolean
  created_at: string
}

export interface UserAchievement {
  id: string
  user_id: string
  achievement_id: string
  unlocked_at: string
  achievement?: Achievement
}

export interface Transaction {
  id: string
  user_id: string
  type: 'earn' | 'spend' | 'trade'
  amount: number
  description: string
  related_id: string | null
  created_at: string
}

export interface Trade {
  id: string
  from_user_id: string
  to_user_id: string
  offered_card_id: string
  requested_card_id: string
  status: TradeStatus
  approved_by: string | null
  created_at: string
  updated_at: string
}
