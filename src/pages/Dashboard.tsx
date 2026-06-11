import { useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingDown, TrendingUp, RefreshCw } from 'lucide-react'
import type { TimeFilter } from '@/types'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { useFilteredTransactions, useBalanceSummary } from '@/hooks/useFilteredTransactions'
import { GlassCard } from '@/components/ui/GlassCard'
import { TimeFilterBar } from '@/components/ui/TimeFilterBar'
import { CategoryPieChart } from '@/components/charts/CategoryPieChart'
import { BalanceBar } from '@/components/charts/BalanceBar'
import { TransactionList } from '@/components/transactions/TransactionList'

function formatEur(v: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

export function Dashboard() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('month')
  const { transactions, recurringGroups, updateCategory } = useTransactionsCtx()
  const filtered = useFilteredTransactions(transactions, timeFilter)
  const summary = useBalanceSummary(filtered)

  return (
    <div className="flex flex-col gap-4">
      {/* Time filter */}
      <TimeFilterBar value={timeFilter} onChange={setTimeFilter} />

      {/* Balance hero card */}
      <GlassCard glow="purple">
        <p className="text-xs text-white/40 mb-1">Saldo im Zeitraum</p>
        <motion.p
          key={`${timeFilter}-${summary.balance}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className={`text-3xl font-bold mb-4 ${summary.balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
        >
          {summary.balance >= 0 ? '+' : ''}{formatEur(summary.balance)}
        </motion.p>
        <BalanceBar summary={summary} />
      </GlassCard>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 gap-3">
        <GlassCard padding="sm" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-card_sm bg-emerald-500/15 flex items-center justify-center text-emerald-400">
            <TrendingUp size={18} />
          </div>
          <div>
            <p className="text-[10px] text-white/40">Einnahmen</p>
            <p className="text-sm font-semibold text-emerald-400">{formatEur(summary.totalIncome)}</p>
          </div>
        </GlassCard>
        <GlassCard padding="sm" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-card_sm bg-red-500/10 flex items-center justify-center text-red-400">
            <TrendingDown size={18} />
          </div>
          <div>
            <p className="text-[10px] text-white/40">Ausgaben</p>
            <p className="text-sm font-semibold text-white/80">{formatEur(summary.totalExpenses)}</p>
          </div>
        </GlassCard>
      </div>

      {/* Category pie chart */}
      {summary.categories.length > 0 && (
        <GlassCard>
          <h2 className="text-sm font-semibold text-white/70 mb-4">Ausgaben nach Kategorie</h2>
          <CategoryPieChart categories={summary.categories} />
        </GlassCard>
      )}

      {/* Recurring standing orders */}
      {recurringGroups.length > 0 && (
        <GlassCard glow="purple">
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw size={14} className="text-purple-400" />
            <h2 className="text-sm font-semibold text-white/70">Daueraufträge erkannt</h2>
            <span className="ml-auto text-xs text-white/30">{recurringGroups.length}</span>
          </div>
          <div className="flex flex-col gap-2">
            {recurringGroups.slice(0, 4).map(g => (
              <div key={g.id} className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-white/80 truncate max-w-[180px]">{g.counterparty}</p>
                  <p className="text-[10px] text-purple-400/70 capitalize">{
                    { weekly: 'Wöchentlich', monthly: 'Monatlich', quarterly: 'Quartalsweise', yearly: 'Jährlich' }[g.frequency]
                  }</p>
                </div>
                <p className={`text-sm font-semibold ${g.approximateAmount < 0 ? 'text-white/70' : 'text-emerald-400'}`}>
                  {g.approximateAmount < 0 ? '' : '+'}{formatEur(g.approximateAmount)}
                </p>
              </div>
            ))}
            {recurringGroups.length > 4 && (
              <p className="text-xs text-white/30 text-center">+{recurringGroups.length - 4} weitere</p>
            )}
          </div>
        </GlassCard>
      )}

      {/* Recent transactions */}
      <div>
        <h2 className="text-sm font-semibold text-white/50 mb-3">Letzte Buchungen</h2>
        <TransactionList
          transactions={filtered.slice(0, 20)}
          onCategoryChange={updateCategory}
        />
      </div>
    </div>
  )
}
