export type Role = 'student' | 'leader' | 'teacher' | 'admin'
export type CharacterGender = 'male' | 'female'

export type Rarity = 'N' | 'R' | 'SR' | 'SSR' | 'UR'

export type TaskType = 'scan' | 'approve' | 'auto'

export type TaskRecurrenceType = 'once' | 'daily' | 'weekly' | 'semester' | 'custom'
export type TaskScopeType = 'school' | 'class'
export type TaskOpenerRole = 'leader' | 'teacher'
export type ProfessionEffectType =
  | 'task_points_percent'
  | 'daily_task_points_percent'
  | 'weekly_task_points_percent'
  | 'draw_ssr_rate_flat'
  | 'draw_ur_rate_flat'
  | 'points_on_scan_percent'
  | 'points_on_button_claim_percent'
  | 'pack_cost_discount_percent'
export type EquipmentSlotType = 'headwear' | 'necklace' | 'ring' | 'pet'
export type EquipmentSourceType = 'teacher' | 'task' | 'achievement' | 'shop' | 'mixed'

export type TradeStatus = 'pending' | 'approved' | 'rejected'

export type AchievementConditionType =
  | 'tasks_completed_total'
  | 'tasks_completed_selected'
  | 'task_streak_any'
  | 'task_streak_selected'
  | 'cards_collected_total'
  | 'series_complete'
  | 'album_complete'
  | 'points_earned_total'
  | 'selected_tasks_all_complete'
  | 'rarity_collection'

export type AchievementCategory = 'task' | 'card' | 'points' | 'mixed'
export type AchievementProgressMode = 'cumulative' | 'streak' | 'all_complete'
export type AchievementAuthoringMode = 'simple' | 'advanced'
export type AchievementClaimMode = 'manual'

export type AnnouncementCategory = 'system' | 'task'

export interface Profile {
  id: string
  email: string
  name: string
  student_id: string | null
  role: Role
  gender: CharacterGender | null
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
  auth_user_id: string | null
  name: string
  student_no: string
  seat_no: number | null
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
  album_id: string | null
  image_url: string | null
  image_prompt: string | null
  image_style: string | null
  image_storage_path: string | null
  image_generated_at: string | null
  color: string
  is_limited: boolean
  is_active: boolean
  created_at: string
  album?: CardAlbum | null
}

export interface CardAlbum {
  id: string
  name: string
  description: string
  cover_color: string
  image_url: string | null
  image_prompt: string | null
  image_style: string | null
  image_storage_path?: string | null
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
  cards_per_open: number
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
  scope_type: TaskScopeType
  class_id: string | null
  recurrence_type: TaskRecurrenceType
  custom_reset_days: number | null
  per_period_limit: number
  claim_cooldown_minutes: number
  allow_scanner: boolean
  allow_button_claim: boolean
  allowed_opener_roles: TaskOpenerRole[]
  scan_station_enabled: boolean
  scan_window_enabled: boolean
  window_start_time: string | null
  window_end_time: string | null
  window_timezone: string
  code_format: 'code128' | 'qr' | 'both'
  equipment_reward_id: string | null
  is_active: boolean
  max_completions: number | null
  starts_at: string | null
  ends_at: string | null
  archive_after_days: number
  created_at: string
  task_classes?: Array<{
    class_id: string
    class?: Class | null
  }>
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
  image_url: string | null
  image_prompt: string | null
  image_style: string | null
  image_storage_path: string | null
  image_generated_at: string | null
  category: AchievementCategory
  progress_mode: AchievementProgressMode
  authoring_mode: AchievementAuthoringMode
  claim_mode: AchievementClaimMode
  sort_order: number
  is_preset: boolean
  condition_type?: string | null
  condition_value?: number
  condition_card_id?: string | null
  condition_series?: string | null
  condition_rarity?: Rarity | null
  card_reward: string | null
  points_reward: number
  equipment_reward_id: string | null
  is_active: boolean
  created_at: string
  achievement_conditions?: AchievementCondition[]
}

export interface AchievementConditionTaskLink {
  id?: string
  condition_id?: string
  task_id: string
  created_at?: string
}

export interface AchievementCondition {
  id: string
  achievement_id: string
  condition_type: AchievementConditionType
  target_value: number
  sort_order: number
  config_json: Record<string, any>
  created_at: string
  achievement_condition_tasks?: AchievementConditionTaskLink[]
}

export interface AchievementStatusCondition {
  id: string
  condition_type: AchievementConditionType | string
  current_value: number
  target_value: number
  complete: boolean
  label: string
}

export interface AchievementStatus {
  achievement_id: string
  name: string
  description: string
  icon_url: string | null
  image_url: string | null
  category: AchievementCategory
  progress_mode: AchievementProgressMode
  claim_mode: AchievementClaimMode
  points_reward: number
  card_reward: string | null
  equipment_reward_id: string | null
  status: 'locked' | 'claimable' | 'claimed'
  unlocked_at: string | null
  claimed_at: string | null
  completed_condition_count: number
  total_condition_count: number
  progress_percent: number
  progress_summary: string
  conditions: AchievementStatusCondition[]
}

export interface PlayerProgress {
  user_id: string
  earned_points_total: number
  level: number
  current_profession_id: string | null
  profession_choice_count: number
  available_unlocks: number
  next_choice_tier: number
}

export interface ProfessionEffect {
  id: string
  profession_id: string
  effect_type: ProfessionEffectType
  base_value: number
  per_level_value: number
  max_preview_value: number
  stack_group: string
  description: string
  created_at: string
}

export interface ProfessionTemplate {
  id: string
  name: string
  code: string
  description: string
  theme_color: string
  icon_url: string | null
  icon_url_male: string | null
  icon_url_female: string | null
  image_prompt: string | null
  image_style: string | null
  unlock_tier: number
  is_active: boolean
  is_system: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  profession_effects?: ProfessionEffect[]
  effects?: ProfessionEffect[]
}

export interface PlayerProfession {
  id: string
  user_id: string
  profession_id: string
  unlocked_at_level: number
  equipped_as_primary: boolean
  frozen_level: number
  frozen_effect_snapshot: Record<string, number>
  unlocked_at: string
  updated_at: string
  profession?: ProfessionTemplate
  effects?: ProfessionEffect[]
}

export interface EquipmentEffect {
  id: string
  equipment_id: string
  effect_type: ProfessionEffectType
  base_value: number
  description: string
  created_at: string
}

export interface EquipmentTemplate {
  id: string
  name: string
  slot_type: EquipmentSlotType
  rarity: Rarity
  description: string
  image_url: string | null
  image_prompt: string | null
  image_style: string | null
  source_type: EquipmentSourceType
  shop_cost: number | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  equipment_effects?: EquipmentEffect[]
}

export interface TitleEffect {
  id: string
  title_id: string
  effect_type: ProfessionEffectType
  base_value: number
  description: string
  created_at: string
}

export interface TitleTemplate {
  id: string
  name: string
  description: string
  theme_color: string
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  title_effects?: TitleEffect[]
  effects?: TitleEffect[]
}

export interface PlayerTitle {
  id: string
  user_id: string
  title_id: string
  assigned_by: string | null
  revoked_by: string | null
  assigned_at: string
  revoked_at: string | null
  revoke_reason: string | null
  title?: TitleTemplate
  effects?: TitleEffect[]
}

export interface RemoteAiSettings {
  provider: 'comfyui_gateway'
  base_url: string
  workflow_api_json: string
  negative_prompt: string
  seed_mode: 'random' | 'fixed'
  fixed_seed: number | null
  is_enabled: boolean
  shared_secret_configured: boolean
  updated_at: string | null
  updated_by: string | null
}

export interface RemoteAiWorkflow {
  id: string
  name: string
  target_type: 'all' | 'card' | 'equipment' | 'profession' | 'achievement' | 'album'
  workflow_api_json: string
  is_active: boolean
  sort_order: number
  updated_at: string | null
  updated_by: string | null
}

export interface PlayerEquipment {
  id: string
  user_id: string
  equipment_id: string
  quantity: number
  is_bound: boolean
  acquired_at: string
  updated_at: string
  equipment?: EquipmentTemplate
}

export interface PlayerEquippedItem {
  user_id: string
  slot_type: EquipmentSlotType
  player_equipment_id: string
  equipped_at: string
}

export interface BonusEntry {
  source_category: 'primary' | 'archived' | 'equipment' | 'title'
  source_name: string
  effect_type: ProfessionEffectType
  value: number
}

export interface ComputedCharacterBonus {
  summary: Record<ProfessionEffectType, number>
  breakdown: {
    primary: BonusEntry[]
    archived: BonusEntry[]
    equipment: BonusEntry[]
    title: BonusEntry[]
  }
}

export interface CharacterProfilePayload {
  progress: PlayerProgress
  level_progress: {
    current_level_start_points: number
    next_level_points: number | null
    progress_percent: number
  }
  current_profession: ProfessionTemplate | null
  active_title: PlayerTitle | null
  earned_titles: PlayerTitle[]
  unlocked_professions: PlayerProfession[]
  available_profession_choices: ProfessionTemplate[]
  bonuses: ComputedCharacterBonus
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
