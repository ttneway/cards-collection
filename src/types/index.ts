export type Role = 'student' | 'leader' | 'teacher' | 'admin'

export type Rarity = 'N' | 'R' | 'SR' | 'SSR' | 'UR'

export type TaskType = 'scan' | 'approve' | 'auto'

export type TaskRecurrenceType = 'once' | 'daily' | 'weekly' | 'semester' | 'custom'

export type TradeStatus = 'pending' | 'approved' | 'rejected'

export type AchievementConditionType =
  | 'cards_collected'
  | 'points'
  | 'tasks_completed'
  | 'series_complete'
  | 'rarity_collection'

export type AnnouncementCategory = 'system' | 'task'

export interface Profile {
  id: string
  email: string
  name: string
  student_id: string | null
  role: Role
  title: string | null
  class_id: string | null
  stars: number
  avatar_url: string | null
  scan_code: string | null
  hide_high_rarity_announcements: boolean
  created_at: string
}

export interface DrawAnnouncement {
  id: string
  user_id: string
  card_id: string
  display_name: string
  is_name_hidden: boolean
  rarity: 'SSR' | 'UR'
  card_name: string
  card_series: string
  card_color: string
  created_at: string
  expires_at: string
}

export interface Announcement {
  id: string
  title: string
  body: string
  category: AnnouncementCategory
  source_task_id: string | null
  created_by: string | null
  auto_created: boolean
  is_pinned: boolean
  expires_at: string | null
  created_at: string
}

export interface Class {
  id: string
  name: string
  grade: number
  teacher_id: string
  created_at: string
}

export interface StudentRoster {
  id: string
  name: string
  student_no: string
  email: string | null
  role: Exclude<Role, 'teacher' | 'admin'>
  title: string | null
  class_id: string | null
  scan_code: string
  points: number
  created_by: string
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

export interface PackRarityOdds {
  pack_id: string
  rarity: Rarity
  card_count: number
  total_weight: number
  probability_percent: number
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
  recurrence_type: TaskRecurrenceType
  custom_reset_days: number | null
  per_period_limit: number
  claim_cooldown_minutes: number
  allow_scanner: boolean
  allow_button_claim: boolean
  scan_window_enabled: boolean
  window_start_time: string | null
  window_end_time: string | null
  window_timezone: string
  code_format: 'code128' | 'qr' | 'both'
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
  awarded_by: string | null
  session_id: string | null
  period_key: string | null
  status: 'pending' | 'approved' | 'rejected'
}

export interface TaskClaimStatus {
  task_id: string
  period_key: string
  claim_count: number
  latest_completed_at: string | null
  next_claim_at: string | null
  cooldown_remaining_seconds: number
}

export interface TaskSession {
  id: string
  task_id: string
  actor_id: string
  is_active: boolean
  opened_at: string
  closed_at: string | null
  task?: Task
}

export interface ScanResolution {
  code_type: 'student' | 'task' | 'function'
  target_id: string
  label: string
  action: string | null
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
