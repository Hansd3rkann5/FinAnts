import type { Account } from '@/types'

// Single home for the EUR formatter previously copy-pasted into 15 components
// with drifting defaults. Charts pass 0 for whole-euro axis labels; detail
// views use the 2-digit default.
export function formatEur(v: number, maximumFractionDigits = 2, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency, maximumFractionDigits }).format(v)
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export const ACCOUNT_TYPE_LABELS: Record<Account['type'], string> = {
  giro: 'Girokonto',
  savings: 'Sparkonto',
  depot: 'Depot',
  loan: 'Kredit',
  other: 'Konto',
}
