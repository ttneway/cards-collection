import type { CharacterGender, ProfessionTemplate } from '../types'

export function resolveProfessionImageUrl(
  profession: Pick<ProfessionTemplate, 'icon_url' | 'icon_url_male' | 'icon_url_female'> | null | undefined,
  gender: CharacterGender | null | undefined
) {
  if (!profession) return null

  if (gender === 'male') {
    return profession.icon_url_male ?? profession.icon_url ?? null
  }

  if (gender === 'female') {
    return profession.icon_url_female ?? profession.icon_url ?? null
  }

  return profession.icon_url ?? profession.icon_url_male ?? profession.icon_url_female ?? null
}
