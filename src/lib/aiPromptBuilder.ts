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

export type AlbumPromptInput = {
  name: string
  description?: string | null
  coverColor?: string | null
  cardCount?: number | null
}

export function getStylePrompt(imageStyle: string) {
  return STYLE_PROMPTS[imageStyle] ?? STYLE_PROMPTS[DEFAULT_IMAGE_STYLE]
}

function describeAccentColor(color: string | null | undefined, fallback: string) {
  const normalized = color?.trim().toLowerCase()

  if (!normalized) return fallback
  if (normalized === '#334155') return 'a deep slate-blue'
  if (normalized === '#6366f1') return 'a vivid indigo-blue'
  if (normalized === '#22c55e') return 'a fresh emerald-green'
  if (normalized === '#ef4444') return 'a confident crimson-red'
  if (normalized === '#f59e0b') return 'a warm amber-gold'
  if (normalized === '#a855f7') return 'a rich violet-purple'
  if (normalized === '#ec4899') return 'a bright rose-pink'

  return 'the selected accent colour'
}

function buildSupportingDetail(detail: string | null | undefined, subject: string) {
  const trimmedDetail = detail?.trim()
  if (!trimmedDetail) return ''

  return `Include this supporting scene detail naturally in the composition. ${trimmedDetail}. It must support ${subject} and must not replace it as the main subject.`
}

function buildNoTextInstruction() {
  return 'Do not render any words, letters, numbers, captions, logos, watermarks, or interface elements in the artwork. The application adds the title and all labels outside the generated illustration.'
}

export function buildCardPrompt(card: CardPromptInput, imageStyle: string, imagePrompt: string | null | undefined) {
  const stylePrompt = getStylePrompt(imageStyle)
  const customPrompt = buildSupportingDetail(imagePrompt, `the ${card.name} scene`)
  const description = card.description?.trim() ? `The scene should also reflect this card description. ${card.description.trim()}.` : ''
  const albumLabel = card.albumName ?? card.series ?? 'Campus Collection'

  return [
    stylePrompt,
    'Design artwork for a school collectible card.',
    `Depict ${card.name} as the unmistakable main subject at first glance.`,
    `The artwork belongs to the ${albumLabel} school collection and has ${card.rarity} rarity.`,
    `Use ${describeAccentColor(card.color, 'a deep slate-blue')} as the main accent colour for the frame and surrounding details.`,
    description,
    customPrompt,
    buildNoTextInstruction(),
    'Avoid unrelated portrait subjects. If a person appears, they must clearly belong to the main scene.',
  ]
    .filter(Boolean)
    .join(' ')
}

export function buildEquipmentPrompt(equipment: EquipmentPromptInput, imageStyle: string, imagePrompt: string | null | undefined) {
  const stylePrompt = getStylePrompt(imageStyle)
  const customPrompt = buildSupportingDetail(imagePrompt, `the ${equipment.name} equipment`)
  const description = equipment.description?.trim() ? `The equipment should also convey this description. ${equipment.description.trim()}.` : ''

  return [
    stylePrompt,
    'Design artwork for a school collectible equipment item.',
    `Depict ${equipment.name} as the unmistakable main subject.`,
    `It is a ${equipment.rarity} ${equipment.slotType} equipment item.`,
    description,
    customPrompt,
    'The item itself must dominate the composition.',
    'If a character appears, they must remain secondary to the equipment.',
    buildNoTextInstruction(),
  ]
    .filter(Boolean)
    .join(' ')
}

export function buildProfessionPrompt(profession: ProfessionPromptInput, imageStyle: string, imagePrompt: string | null | undefined) {
  const stylePrompt = getStylePrompt(imageStyle)
  const customPrompt = buildSupportingDetail(imagePrompt, `the ${profession.name} profession`)
  const description = profession.description?.trim() ? `The profession should also convey this description. ${profession.description.trim()}.` : ''

  return [
    stylePrompt,
    'Design artwork for a fantasy school profession or class.',
    `Represent ${profession.name} clearly as the main subject.`,
    `This is an advanced school profession unlocked at tier ${profession.unlockTier}.`,
    `Use ${describeAccentColor(profession.themeColor, 'a vivid indigo-blue')} as the profession's accent colour.`,
    description,
    customPrompt,
    'The result should work as a polished profession icon or portrait for a mobile game selection screen.',
    buildNoTextInstruction(),
  ]
    .filter(Boolean)
    .join(' ')
}

export function buildAchievementPrompt(achievement: AchievementPromptInput, imageStyle: string, imagePrompt: string | null | undefined) {
  const stylePrompt = getStylePrompt(imageStyle)
  const customPrompt = buildSupportingDetail(imagePrompt, `the ${achievement.name} achievement concept`)
  const description = achievement.description?.trim() ? `The badge should also convey this description. ${achievement.description.trim()}.` : ''

  return [
    stylePrompt,
    'Design artwork for a school game achievement badge.',
    `Represent the ${achievement.name} achievement concept clearly and symbolically.`,
    `It represents ${achievement.progressMode ?? 'cumulative'} progress in a ${achievement.category ?? 'mixed'} activity.`,
    description,
    customPrompt,
    'The result should work as a polished achievement icon or reward badge in a mobile game.',
    buildNoTextInstruction(),
  ]
    .filter(Boolean)
    .join(' ')
}

export function buildAlbumPrompt(album: AlbumPromptInput, imageStyle: string, imagePrompt: string | null | undefined) {
  const stylePrompt = getStylePrompt(imageStyle)
  const customPrompt = buildSupportingDetail(imagePrompt, `the ${album.name} album theme`)
  const description = album.description?.trim() ? `The cover should also convey this description. ${album.description.trim()}.` : ''

  return [
    stylePrompt,
    'Design artwork for a school collectible album cover.',
    `Represent the ${album.name} album theme clearly as the main visual idea.`,
    `Use ${describeAccentColor(album.coverColor, 'a deep slate-blue')} as the cover accent colour.`,
    album.cardCount ? `The collection has room for ${album.cardCount} cards.` : '',
    description,
    customPrompt,
    'The result should work as a polished mobile game collection book cover or binder cover.',
    buildNoTextInstruction(),
  ]
    .filter(Boolean)
    .join(' ')
}
