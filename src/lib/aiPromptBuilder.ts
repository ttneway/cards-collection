export const DEFAULT_IMAGE_STYLE = 'Q版校園奇幻'

const STYLE_PROMPTS: Record<string, string> = {
  [DEFAULT_IMAGE_STYLE]:
    'Create a polished chibi fantasy campus illustration with bright lighting, clear silhouette, soft depth, and a premium collectible mobile game feeling.',
  '日系動漫插畫':
    'Create a clean anime illustration with readable composition, expressive lighting, refined details, and a premium game reward presentation.',
  '紙牌卡框風格':
    'Create a polished collectible trading-card illustration with a visible decorative frame on all four edges and premium printed-card styling.',
}

export type CardPromptInput = {
  name: string
  rarity: string
  description?: string | null
  series?: string | null
  albumName?: string | null
  color?: string | null
}

export type EquipmentPromptInput = {
  name: string
  rarity: string
  description?: string | null
  slotType: string
}

export type ProfessionPromptInput = {
  name: string
  code: string
  description?: string | null
  themeColor?: string | null
  unlockTier: number
}

export type AchievementPromptInput = {
  name: string
  description?: string | null
  category?: string | null
  progressMode?: string | null
}

export function getStylePrompt(imageStyle: string) {
  return STYLE_PROMPTS[imageStyle] ?? STYLE_PROMPTS[DEFAULT_IMAGE_STYLE]
}

export function buildCardPrompt(card: CardPromptInput, imageStyle: string, imagePrompt: string | null | undefined) {
  const stylePrompt = getStylePrompt(imageStyle)
  const customPrompt = imagePrompt?.trim()
    ? `Supporting detail to include without replacing the main subject: ${imagePrompt.trim()}`
    : ''
  const description = card.description?.trim() ? `Card description: ${card.description.trim()}` : ''
  const albumLabel = card.albumName ?? card.series ?? 'Campus Collection'

  return [
    stylePrompt,
    'Design artwork for a school collectible card.',
    `The primary subject of this card must be "${card.name}".`,
    `Album or collection theme: ${albumLabel}.`,
    `Card rarity: ${card.rarity}.`,
    `Main accent color: ${card.color ?? '#334155'}.`,
    description,
    customPrompt,
    'Keep the named subject obvious at first glance.',
    'Avoid text, watermarks, UI, and unrelated random portrait subjects.',
  ]
    .filter(Boolean)
    .join(' ')
}

export function buildEquipmentPrompt(equipment: EquipmentPromptInput, imageStyle: string, imagePrompt: string | null | undefined) {
  const stylePrompt = getStylePrompt(imageStyle)
  const customPrompt = imagePrompt?.trim()
    ? `Supporting detail to include without replacing the main subject: ${imagePrompt.trim()}`
    : ''
  const description = equipment.description?.trim() ? `Equipment description: ${equipment.description.trim()}` : ''

  return [
    stylePrompt,
    'Design artwork for a school collectible equipment item.',
    `The equipment named "${equipment.name}" must be the main subject.`,
    `Equipment slot: ${equipment.slotType}.`,
    `Equipment rarity: ${equipment.rarity}.`,
    description,
    customPrompt,
    'The item itself must dominate the composition.',
    'If a character appears, they must remain secondary to the equipment.',
    'Avoid text, watermarks, UI, and unrelated random portraits.',
  ]
    .filter(Boolean)
    .join(' ')
}

export function buildProfessionPrompt(profession: ProfessionPromptInput, imageStyle: string, imagePrompt: string | null | undefined) {
  const stylePrompt = getStylePrompt(imageStyle)
  const customPrompt = imagePrompt?.trim()
    ? `Supporting detail to include without replacing the main subject: ${imagePrompt.trim()}`
    : ''
  const description = profession.description?.trim() ? `Profession description: ${profession.description.trim()}` : ''

  return [
    stylePrompt,
    'Design artwork for a fantasy school profession or class.',
    `The profession named "${profession.name}" must be represented clearly as the main subject.`,
    `Profession code: ${profession.code}.`,
    `Theme color: ${profession.themeColor ?? '#6366f1'}.`,
    `Unlock tier: ${profession.unlockTier}.`,
    description,
    customPrompt,
    'The result should work as a polished profession icon or portrait for a mobile game selection screen.',
    'Avoid text, watermarks, UI, and unrelated subjects.',
  ]
    .filter(Boolean)
    .join(' ')
}

export function buildAchievementPrompt(achievement: AchievementPromptInput, imageStyle: string, imagePrompt: string | null | undefined) {
  const stylePrompt = getStylePrompt(imageStyle)
  const customPrompt = imagePrompt?.trim()
    ? `Supporting detail to include without replacing the achievement concept: ${imagePrompt.trim()}`
    : ''
  const description = achievement.description?.trim() ? `Achievement description: ${achievement.description.trim()}` : ''

  return [
    stylePrompt,
    'Design artwork for a school game achievement badge.',
    `The achievement named "${achievement.name}" must be represented clearly as the main subject.`,
    `Achievement category: ${achievement.category ?? 'mixed'}.`,
    `Progress mode: ${achievement.progressMode ?? 'cumulative'}.`,
    description,
    customPrompt,
    'The result should work as a polished achievement icon or reward badge in a mobile game.',
    'Avoid readable text, watermarks, UI, and unrelated portrait subjects.',
  ]
    .filter(Boolean)
    .join(' ')
}
