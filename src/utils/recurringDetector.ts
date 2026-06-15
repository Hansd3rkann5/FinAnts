import type { Transaction, RecurringGroup } from '@/types'
import { differenceInDays } from 'date-fns'
import { isExcluded } from '@/data/categories'

const FREQ_WINDOWS = {
  weekly:    { min: 5,   max: 9 },
  monthly:   { min: 25,  max: 35 },
  quarterly: { min: 80,  max: 100 },
  yearly:    { min: 340, max: 390 },
}

function amountSimilar(a: number, b: number): boolean {
  return Math.abs(Math.abs(a) - Math.abs(b)) < 0.5
}

function groupKey(tx: Transaction): string {
  const cp = tx.counterparty.trim().toLowerCase().slice(0, 30)
  const roundedAmount = Math.round(Math.abs(tx.amount) * 10) / 10
  return `${cp}|${roundedAmount}`
}

export function detectRecurring(transactions: Transaction[]): {
  transactions: Transaction[]
  groups: RecurringGroup[]
} {
  const byKey = new Map<string, Transaction[]>()

  for (const tx of transactions) {
    if (isExcluded(tx)) continue   // excluded transactions never count as recurring
    const key = groupKey(tx)
    const group = byKey.get(key) ?? []
    group.push(tx)
    byKey.set(key, group)
  }

  const groups: RecurringGroup[] = []
  const recurringIds = new Set<string>()

  for (const [key, txs] of byKey.entries()) {
    if (txs.length < 2) continue

    const sorted = [...txs].sort((a, b) => a.date.getTime() - b.date.getTime())
    const amountConsistent = sorted.every(t => amountSimilar(t.amount, sorted[0].amount))
    if (!amountConsistent) continue

    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(differenceInDays(sorted[i].date, sorted[i - 1].date))
    }

    if (gaps.length === 0) continue
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length
    const maxDeviation = Math.max(...gaps.map(g => Math.abs(g - avgGap)))

    if (maxDeviation > avgGap * 0.25) continue

    let frequency: RecurringGroup['frequency'] | null = null
    for (const [freq, { min, max }] of Object.entries(FREQ_WINDOWS) as [RecurringGroup['frequency'], { min: number; max: number }][]) {
      if (avgGap >= min && avgGap <= max) {
        frequency = freq
        break
      }
    }

    if (!frequency) continue

    const [cp] = key.split('|')
    const groupId = `rg-${cp.replace(/\W/g, '')}-${frequency}`

    for (const tx of sorted) {
      recurringIds.add(tx.id)
    }

    groups.push({
      id: groupId,
      merchantKey: sorted[0].merchantKey ?? '',
      counterparty: sorted[0].counterparty,
      approximateAmount: sorted[0].amount,
      frequency,
      transactions: sorted.map(t => t.id),
    })
  }

  const annotated = transactions.map(tx => ({
    ...tx,
    isRecurring: recurringIds.has(tx.id),
    recurringGroupId: groups.find(g => g.transactions.includes(tx.id))?.id,
  }))

  return { transactions: annotated, groups }
}
