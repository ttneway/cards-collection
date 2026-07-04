export function classNames(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function formatStars(amount: number): string {
  return amount.toLocaleString()
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function readStoredNumber(key: string, fallback: number, min: number, max: number): number {
  if (typeof window === 'undefined') return fallback

  const rawValue = window.localStorage.getItem(key)
  if (!rawValue) return fallback

  const parsedValue = Number(rawValue)
  if (!Number.isFinite(parsedValue)) return fallback

  return clampNumber(parsedValue, min, max)
}
