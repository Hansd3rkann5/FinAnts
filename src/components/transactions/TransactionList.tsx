import { useMemo } from 'react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { motion } from 'framer-motion'
import type { Transaction } from '@/types'
import { TransactionCard } from './TransactionCard'

interface Props {
  transactions: Transaction[]
  onCategoryChange?: (id: string, cat: Transaction['categoryId']) => void
}

function groupByDay(transactions: Transaction[]): { label: string; items: Transaction[] }[] {
  const map = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    const key = format(tx.date, 'yyyy-MM-dd')
    const group = map.get(key) ?? []
    group.push(tx)
    map.set(key, group)
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateStr, items]) => {
      const date = new Date(dateStr)
      const now = new Date()
      const isToday = format(date, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd')
      const isYesterday = format(date, 'yyyy-MM-dd') === format(new Date(now.getTime() - 86400000), 'yyyy-MM-dd')
      const label = isToday
        ? 'Heute'
        : isYesterday
        ? 'Gestern'
        : format(date, 'EEEE, dd. MMMM', { locale: de })
      return { label, items }
    })
}

export function TransactionList({ transactions, onCategoryChange }: Props) {
  const groups = useMemo(() => groupByDay(transactions), [transactions])

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-white/30">
        <span className="text-4xl mb-3">📭</span>
        <p className="text-sm">Keine Buchungen im gewählten Zeitraum</p>
      </div>
    )
  }

  let globalIndex = 0

  return (
    <div className="flex flex-col gap-4">
      {groups.map(({ label, items }) => (
        <motion.div
          key={label}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 px-1">
            {label}
          </p>
          <div className="flex flex-col gap-1.5">
            {items.map(tx => (
              <TransactionCard
                key={tx.id}
                transaction={tx}
                onCategoryChange={onCategoryChange}
                index={globalIndex++}
              />
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  )
}
