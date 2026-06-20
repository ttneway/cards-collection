export const RARITY_ORDER = ['N', 'R', 'SR', 'SSR', 'UR'] as const

export const RARITY_COLORS: Record<string, string> = {
  N: '#94a3b8',
  R: '#22c55e',
  SR: '#3b82f6',
  SSR: '#a855f7',
  UR: '#f59e0b'
}

export const RARITY_LABELS: Record<string, string> = {
  N: '\u666e\u901a',
  R: '\u7a00\u6709',
  SR: '\u8d85\u7a00\u6709',
  SSR: '\u50b3\u8aaa',
  UR: '\u5178\u85cf'
}

export function formatRarityLabel(rarity: string) {
  return `${RARITY_LABELS[rarity] ?? rarity} (${rarity})`
}

export const ROLE_LABELS: Record<string, string> = {
  student: '\u5b78\u751f',
  leader: '\u5e79\u90e8',
  teacher: '\u6559\u5e2b',
  admin: '\u7ba1\u7406\u8005'
}
