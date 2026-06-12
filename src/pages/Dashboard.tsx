import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingDown, TrendingUp, RefreshCw, ChevronDown, ChevronUp, Landmark, Plus, X } from 'lucide-react'
import type { TimeFilter, Transaction } from '@/types'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { useFilteredTransactions, useBalanceSummary } from '@/hooks/useFilteredTransactions'
import { useAccounts } from '@/hooks/useAccounts'
import { GlassCard } from '@/components/ui/GlassCard'
import { TimeFilterBar } from '@/components/ui/TimeFilterBar'
import { CategoryPieChart } from '@/components/charts/CategoryPieChart'
import { BalanceBar } from '@/components/charts/BalanceBar'
import { TransactionList } from '@/components/transactions/TransactionList'
import { TransactionDetailModal } from '@/components/transactions/TransactionDetailModal'
import { CategoryCreateModal } from '@/components/ui/CategoryCreateModal'
import { AccountCard } from '@/components/ui/AccountCard'

function formatEur(v: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits }).format(v)
}

export function Dashboard() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('month')
  const [showAccounts, setShowAccounts] = useState(false)
  const [selected, setSelected] = useState<Transaction | null>(null)
  const [createCatOpen, setCreateCatOpen] = useState(false)
  const { transactions, recurringGroups, updateCategory, updateTransaction, customCategories, addCustomCategory, deleteCustomCategory } = useTransactionsCtx()
  const { accounts, toggleIncluded, totalWealth } = useAccounts()
  const filtered = useFilteredTransactions(transactions, timeFilter)
  const summary = useBalanceSummary(filtered)

  return (
    <div id="page-dashboard" className="flex flex-col gap-4">
      <TimeFilterBar value={timeFilter} onChange={setTimeFilter} />

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

      <GlassCard id="card-balance" glow={accounts.length === 0 ? 'purple' : undefined}>
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
            id="btn-add-category"
            onClick={() => setCreateCatOpen(true)}
            className="w-7 h-7 rounded-full bg-white/6 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors active:scale-90"
          >
            <Plus size={14} />
          </button>
        </div>

        {customCategories.length > 0 && (
          <div id="custom-categories-list" className="flex flex-wrap gap-1.5 mb-4">
            {customCategories.map(cat => (
              <div
                key={cat.id}
                data-component="custom-category-chip"
                data-category-id={cat.id}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-pill border text-xs"
                style={{ backgroundColor: `${cat.color}18`, borderColor: `${cat.color}40`, color: cat.color }}
              >
                <span>{cat.icon}</span>
                <span className="font-medium">{cat.label}</span>
                <button
                  onClick={() => deleteCustomCategory(cat.id)}
                  className="ml-0.5 w-4 h-4 rounded-full flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
                >
                  <X size={9} />
                </button>
              </div>
            ))}
          </div>
        )}

        {summary.categories.length > 0 ? (
          <CategoryPieChart categories={summary.categories} />
        ) : (
          <div id="categories-empty-state" className="flex flex-col items-center gap-2 py-8 text-white/25">
            <span className="text-2xl">📊</span>
            <p className="text-xs">Noch keine Ausgaben im Zeitraum</p>
          </div>
        )}
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
            {recurringGroups.length > 4 && (
              <p className="text-xs text-white/30 text-center">+{recurringGroups.length - 4} weitere</p>
            )}
          </div>
        </GlassCard>
      )}

      <div id="recent-transactions">
        <h2 className="text-sm font-semibold text-white/50 mb-3">Letzte Buchungen</h2>
        <TransactionList
          transactions={filtered.slice(0, 20)}
          onCategoryChange={updateCategory}
          onTransactionClick={setSelected}
        />
      </div>

      <TransactionDetailModal
        transaction={selected}
        onClose={() => setSelected(null)}
        onUpdate={(id, patch) => {
          updateTransaction(id, patch)
          setSelected(prev => prev ? { ...prev, ...patch } : null)
        }}
      />

      <CategoryCreateModal
        open={createCatOpen}
        onClose={() => setCreateCatOpen(false)}
        onSave={addCustomCategory}
      />
    </div>
  )
}
