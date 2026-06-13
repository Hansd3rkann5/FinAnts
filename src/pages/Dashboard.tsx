import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingDown, TrendingUp, RefreshCw, ChevronDown, ChevronUp, Landmark, Pencil } from 'lucide-react'
import type { TimeFilter, Transaction } from '@/types'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { useFilteredTransactions, useBalanceSummary } from '@/hooks/useFilteredTransactions'
import { useAccounts } from '@/hooks/useAccounts'
import { useManualBalance } from '@/hooks/useManualBalance'
import { GlassCard } from '@/components/ui/GlassCard'
import { TimeFilterBar } from '@/components/ui/TimeFilterBar'
import { CategoryPieChart } from '@/components/charts/CategoryPieChart'
import { BalanceBar } from '@/components/charts/BalanceBar'
import { CategoryManageModal } from '@/components/ui/CategoryManageModal'
import { CategoryBreakdownModal } from '@/components/ui/CategoryBreakdownModal'
import { RecurringModal } from '@/components/ui/RecurringModal'
import { AccountCard } from '@/components/ui/AccountCard'
import { TransactionDetailModal } from '@/components/transactions/TransactionDetailModal'

function formatEur(v: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits }).format(v)
}

export function Dashboard() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>(
    () => (localStorage.getItem('dash-time-filter') as TimeFilter) ?? 'month'
  )

  function handleTimeFilter(v: TimeFilter) {
    setTimeFilter(v)
    localStorage.setItem('dash-time-filter', v)
  }
  const [showAccounts, setShowAccounts] = useState(false)
  const [catManageOpen, setCatManageOpen] = useState(false)
  const [catBreakdownOpen, setCatBreakdownOpen] = useState(false)
  const [recurringOpen, setRecurringOpen] = useState(false)
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)
  const { transactions, recurringGroups, updateTransaction } = useTransactionsCtx()
  const { accounts, toggleIncluded, totalWealth } = useAccounts()
  const { balance: manualBalance, updatedAt: balanceUpdatedAt } = useManualBalance()
  const filtered = useFilteredTransactions(transactions, timeFilter)
  const summary = useBalanceSummary(filtered)

  return (
    <div id="page-dashboard" className="flex flex-col gap-4">
      <TimeFilterBar value={timeFilter} onChange={handleTimeFilter} id="dash" />

      {accounts.length === 0 && manualBalance !== null && (
        <GlassCard id="card-manual-balance" glow="purple">
          <div className="flex items-center gap-2 mb-1">
            <Landmark size={14} className="text-purple-400" />
            <p className="text-xs text-white/40">Kontostand</p>
            {balanceUpdatedAt && (
              <p className="ml-auto text-[10px] text-white/25">{balanceUpdatedAt}</p>
            )}
          </div>
          <motion.p
            key={manualBalance}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className={`text-3xl font-bold ${manualBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
          >
            {formatEur(manualBalance, 2)}
          </motion.p>
        </GlassCard>
      )}

      {accounts.length > 0 && (
        <GlassCard id="card-wealth" glow="purple">
          <div className="flex items-center gap-2 mb-1">
            <Landmark size={14} className="text-purple-400" />
            <p className="text-xs text-white/40">Gesamtvermögen</p>
            <motion.button
              type="button"
              onClick={() => setShowAccounts(v => !v)}
              className="ml-auto text-white/30 hover:text-white/60 flex items-center gap-1 text-[10px]"
              whileTap={{ scale: 0.95 }}
            >
              {accounts.length} Konten
              {showAccounts ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </motion.button>
          </div>

          <motion.p
            key={totalWealth}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className={`text-3xl font-bold mb-3 ${totalWealth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
          >
            {formatEur(totalWealth, 2)}
          </motion.p>

          <AnimatePresence>
            {showAccounts && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                className="overflow-hidden"
              >
                <div id="accounts-list" className="flex flex-col gap-2 pt-1">
                  {accounts.map(a => (
                    <AccountCard
                      key={a.iban}
                      account={a}
                      onToggle={toggleIncluded}
                      showToggle
                    />
                  ))}
                  {accounts.some(a => !a.included) && (
                    <p className="text-[10px] text-white/25 text-center pt-1">
                      Ausgeblendete Konten fließen nicht ins Gesamtvermögen ein
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>
      )}

      <GlassCard id="card-balance" glow={accounts.length === 0 && manualBalance === null ? 'purple' : undefined}>
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

      <div id="stats-row" className="grid grid-cols-2 gap-3">
        <GlassCard id="card-income-stat" padding="sm" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-card_sm bg-emerald-500/15 flex items-center justify-center text-emerald-400">
            <TrendingUp size={18} />
          </div>
          <div>
            <p className="text-[10px] text-white/40">Einnahmen</p>
            <p className="text-sm font-semibold text-emerald-400">{formatEur(summary.totalIncome)}</p>
          </div>
        </GlassCard>
        <GlassCard id="card-expense-stat" padding="sm" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-card_sm bg-red-500/10 flex items-center justify-center text-red-400">
            <TrendingDown size={18} />
          </div>
          <div>
            <p className="text-[10px] text-white/40">Ausgaben</p>
            <p className="text-sm font-semibold text-white/80">{formatEur(summary.totalExpenses)}</p>
          </div>
        </GlassCard>
      </div>

      <GlassCard id="card-categories">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white/70">Kategorien</h2>
          <button
            id="btn-manage-categories"
            onClick={() => setCatManageOpen(true)}
            className="w-7 h-7 rounded-full bg-white/6 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors active:scale-90"
          >
            <Pencil size={13} />
          </button>
        </div>


        {summary.categories.length > 0 ? (
          <CategoryPieChart categories={summary.categories} />
        ) : (
          <div id="categories-empty-state" className="flex flex-col items-center gap-2 py-8 text-white/25">
            <span className="text-2xl">📊</span>
            <p className="text-xs">Noch keine Ausgaben im Zeitraum</p>
          </div>
        )}
        <button
          id="btn-category-breakdown"
          onClick={() => setCatBreakdownOpen(true)}
          className="w-full text-center text-xs text-white/25 hover:text-white/50 transition-colors pt-3 mt-1 border-t border-white/6"
        >
          {`Alle anzeigen (${new Set(transactions.map(t => t.categoryId)).size})`}
        </button>
      </GlassCard>

      {recurringGroups.length > 0 && (
        <GlassCard id="card-recurring" glow="purple">
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw size={14} className="text-purple-400" />
            <h2 className="text-sm font-semibold text-white/70">Daueraufträge erkannt</h2>
            <span className="ml-auto text-xs text-white/30">{recurringGroups.length}</span>
          </div>
          <div id="recurring-list" className="flex flex-col gap-2">
            {recurringGroups.slice(0, 4).map(g => (
              <div key={g.id} data-component="recurring-row" className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-white/80 truncate max-w-45">{g.counterparty}</p>
                  <p className="text-[10px] text-purple-400/70 capitalize">{
                    { weekly: 'Wöchentlich', monthly: 'Monatlich', quarterly: 'Quartalsweise', yearly: 'Jährlich' }[g.frequency]
                  }</p>
                </div>
                <p className={`text-sm font-semibold ${g.approximateAmount < 0 ? 'text-white/70' : 'text-emerald-400'}`}>
                  {g.approximateAmount < 0 ? '' : '+'}{formatEur(g.approximateAmount)}
                </p>
              </div>
            ))}
          </div>
          <button
            id="btn-recurring-all"
            onClick={() => setRecurringOpen(true)}
            className="w-full text-center text-xs text-white/25 hover:text-white/50 transition-colors pt-3 mt-2 border-t border-white/6"
          >
            {recurringGroups.length > 4 ? `Alle anzeigen (+${recurringGroups.length - 4})` : 'Alle anzeigen'}
          </button>
        </GlassCard>
      )}


      <CategoryManageModal
        open={catManageOpen}
        onClose={() => setCatManageOpen(false)}
      />
      <CategoryBreakdownModal
        open={catBreakdownOpen}
        onClose={() => setCatBreakdownOpen(false)}
        onTransactionSelect={tx => { setCatBreakdownOpen(false); setSelectedTx(tx) }}
      />
      <TransactionDetailModal
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
        onUpdate={(id, patch) => {
          updateTransaction(id, patch)
          setSelectedTx(prev => prev ? { ...prev, ...patch } : null)
        }}
      />
      <RecurringModal
        open={recurringOpen}
        onClose={() => setRecurringOpen(false)}
      />
    </div>
  )
}
