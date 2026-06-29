import { RARITY_LABELS } from './constants'
import type { EquipmentSlotType, ProfessionEffectType } from '../types'

export const EFFECT_LABELS: Record<ProfessionEffectType, string> = {
  task_points_percent: '任務額外點數',
  daily_task_points_percent: '每日任務額外點數',
  weekly_task_points_percent: '每週任務額外點數',
  draw_ssr_rate_flat: 'SSR 抽中率',
  draw_ur_rate_flat: 'UR 抽中率',
  points_on_scan_percent: '掃碼任務額外點數',
  points_on_button_claim_percent: '按鈕任務額外點數',
  pack_cost_discount_percent: '卡包 / 裝備折扣'
}

export const SLOT_LABELS: Record<EquipmentSlotType, string> = {
  headwear: '頭飾',
  necklace: '項鍊',
  ring: '戒指',
  pet: '寵物'
}

export const STYLE_OPTIONS = ['Q版校園奇幻', '校徽 / 徽章式收藏卡風'] as const

export function formatEffectValue(effectType: ProfessionEffectType, value: number) {
  const rounded = Number(value ?? 0)
  const suffix = effectType.includes('rate') || effectType.includes('percent') ? '%' : ''
  const display = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2)
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${display}${suffix}`
}

export function getTierLabel(unlockTier: number) {
  if (unlockTier === 1) return '10 級職業池'
  if (unlockTier === 2) return '20 級職業池'
  return '30 級以上職業池'
}

export function getBalanceWarnings(effectCount: number, effectTypes: ProfessionEffectType[]) {
  const warnings: string[] = []

  const ssrCount = effectTypes.filter(type => type === 'draw_ssr_rate_flat').length
  const urCount = effectTypes.filter(type => type === 'draw_ur_rate_flat').length
  const drawCount = ssrCount + urCount

  if (drawCount >= 3) {
    warnings.push('同一模板包含過多抽卡效果，建議控制在 1 到 2 個效果。')
  }

  if (urCount > 1) {
    warnings.push('UR 機率加成屬於高價值能力，建議只保留一條。')
  }

  if (effectCount === 0) {
    warnings.push('尚未設定任何能力效果。')
  }

  return warnings
}

export function formatEquipmentRarity(rarity: string) {
  return `${RARITY_LABELS[rarity] ?? rarity} (${rarity})`
}
