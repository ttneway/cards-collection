export function classNames(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function formatStars(amount: number): string {
  return amount.toLocaleString()
}
