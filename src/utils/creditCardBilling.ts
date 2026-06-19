import type { Transaction } from '@/types'

// Extracts the real statement closing date from a Giro "Kreditkarte" booking's
// label, e.g. "Karte Nr. 523224xxxxxx2972 ... Abrechnung vom 28.05.2026
// Card-ID: ...". This is the bank's own record of the period boundary —
// more reliable than inferring it from a settlement row in a Mastercard CSV,
// which might not even be available yet (see computeCreditCardBucket).
export function extractAbrechnungDate(label: string | undefined): Date | null {
  const m = (label ?? '').match(/Abrechnung vom (\d{2})\.(\d{2})\.(\d{4})/)
  if (!m) return null
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
}

export interface CreditCardBucket {
  giroId: string
  newlyLinkedIds: string[]
  splits: { categoryId: string; amount: number }[]
}

// Given one Giro "Kreditkarte" booking, find every credit-card purchase
// (source === 'creditcard') that falls in its billing window — whether
// already linked to it (re-evaluating after a later Mastercard CSV upload
// added more detail) or still standalone (the Giro side billed before that
// detail was ever imported) — and compute the resulting category/Remaining
// breakdown. Pure function; the caller applies the linking (batchUpdateParent)
// and the splits (setSplit).
export function computeCreditCardBucket(
  giroBooking: Transaction,
  allTransactions: Transaction[],
  kreditkarteCategoryId: string,
): CreditCardBucket | null {
  const closing = extractAbrechnungDate(giroBooking.customLabel)
  if (!closing) return null

  // Previous period's closing date: the latest *other* Kreditkarte booking's
  // own closing date that's still before this one — else fall back to ~31
  // days, same as the initial-import edge case in Settings.tsx.
  const earlierClosings = allTransactions
    .filter(t => t.id !== giroBooking.id && t.categoryId === kreditkarteCategoryId)
    .map(t => extractAbrechnungDate(t.customLabel))
    .filter((d): d is Date => !!d && d < closing)
  const periodStart = earlierClosings.length
    ? new Date(Math.max(...earlierClosings.map(d => d.getTime())))
    : new Date(closing.getTime() - 31 * 86_400_000)

  const periodPurchases = allTransactions.filter(t =>
    t.source === 'creditcard' &&
    (t.parentId === giroBooking.id || !t.parentId) &&
    t.date > periodStart && t.date <= closing,
  )
  if (periodPurchases.length === 0) return null

  const newlyLinkedIds = periodPurchases.filter(t => t.parentId !== giroBooking.id).map(t => t.id)

  const byCategory = new Map<string, number>()
  for (const p of periodPurchases) byCategory.set(p.categoryId, (byCategory.get(p.categoryId) ?? 0) + p.amount)
  const splits = [...byCategory.entries()].map(([categoryId, amount]) => ({ categoryId, amount }))

  const knownSum = periodPurchases.reduce((s, p) => s + p.amount, 0)
  const remaining = Math.round((giroBooking.amount - knownSum) * 100) / 100
  if (Math.abs(remaining) >= 0.01) splits.push({ categoryId: 'other', amount: remaining })

  // Biggest spend first — amounts are negative for expenses, so ascending
  // puts the most-negative (largest expense) first, same convention as
  // CategoryBreakdownModal's sort.
  splits.sort((a, b) => a.amount - b.amount)

  return { giroId: giroBooking.id, newlyLinkedIds, splits }
}
