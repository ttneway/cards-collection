export const RARITY_ORDER = ['N', 'R', 'SR', 'SSR', 'UR'] as const

export const RARITY_COLORS: Record<string, string> = {
  N: '#94a3b8',
  R: '#22c55e',
  SR: '#3b82f6',
  SSR: '#a855f7',
  UR: '#f59e0b'
}

export const RARITY_LABELS: Record<string, string> = {
  N: '普通',
  R: '稀有',
  SR: '超稀有',
  SSR: '極稀有',
  UR: '傳說'
}

export const ROLE_LABELS: Record<string, string> = {
  student: '學生',
  leader: '幹部',
  teacher: '教師'
}
