import { useState, useMemo, useCallback } from 'react'
import { Search, X, SlidersHorizontal } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { TimeFilter, Transaction, Account } from '@/types'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { useEnableBanking } from '@/hooks/useEnableBanking'
import { workerCfg } from '@/components/settings/shared'
import { notify } from '@/utils/notify'
import { useFilteredTransactions } from '@/hooks/useFilteredTransactions'
import { useAllCategories } from '@/hooks/useAllCategories'
import { computeAvailablePeriods } from '@/utils/chartCompute'
import { filterTransactionsByAccounts } from '@/utils/accountFilter'
import { TimeFilterBar } from '@/components/ui/TimeFilterBar'
import { TransactionList } from '@/components/transactions/TransactionList'
import { TransactionDetailModal } from '@/components/transactions/TransactionDetailModal'
import { KreditkartenBreakdownModal } from '@/components/transactions/KreditkartenBreakdownModal'
import { PillButton } from '@/components/ui/PillButton'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { ChartLoader } from '@/components/ui/ChartLoader'

export function Transactions() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [search, setSearch] = useState('')
  const [amountSearch, setAmountSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const { allList } = useAllCategories()
  const [filterOpen, setFilterOpen] = useState(false)
  const [selected, setSelected] = useState<Transaction | null>(null)
  const [breakdownParent, setBreakdownParent] = useState<Transaction | null>(null)
  const {
    transactions, updateTransaction, refreshAll,
    accounts, selectedAccountIbans,
    applyServerTransactions, upsertAccount, markNew,
  } = useTransactionsCtx()
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState('')

  const onEbAccounts = useCallback(
    (incoming: Omit<Account, 'included'>[]) => { for (const a of incoming) upsertAccount(a) },
    [upsertAccount],
  )
  const { refresh: ebRefresh } = useEnableBanking(applyServerTransactions, onEbAccounts, markNew)

  // Same account-selection state as the Dashboard's Kontostand-replacement
  // card (shared via TransactionsContext) — everything below derives from
  // this, not the raw context `transactions`.
  const accountTransactions = useMemo(
    () => filterTransactionsByAccounts(transactions, accounts, selectedAccountIbans),
    [transactions, accounts, selectedAccountIbans],
  )

  const kreditkarteCategoryId = allList.find(c => c.label.trim().toLowerCase() === 'kreditkarte')?.id

  function handleTransactionClick(tx: Transaction) {
    if (kreditkarteCategoryId && tx.categoryId === kreditkarteCategoryId) {
      const hasChildren = accountTransactions.some(t => t.parentId === tx.id)
      if (hasChildren) { setBreakdownParent(tx); return }
    }
    setSelected(tx)
  }

  // Pull-to-refresh, two stages under the full-screen loader:
  // 1. Bank sync via the EnableBanking session stored on the worker — fetches
  //    fresh transactions without a new TAN. If the session is gone (expired /
  //    never connected), a toast points to Settings and the pull continues.
  // 2. Cloud download — categories + merchant patterns (R2) and the merged
  //    transactions (D1). This is also how a new device pulls its data.
  async function handleRefresh() {
    setRefreshing(true)
    try {
      setRefreshMessage('Bank-Session wird geprüft…')
      const bank = await ebRefresh(workerCfg, 30, setRefreshMessage)
      if (bank === 'needs_auth') {
        notify('Bank-Verbindung abgelaufen', 'In den Einstellungen neu mit der Bank verbinden (TAN nötig).')
      }
      await refreshAll(setRefreshMessage)
      setRefreshMessage('Fertig!')
    } finally {
      setRefreshing(false)
    }
  }

  const timeFiltered = useFilteredTransactions(accountTransactions, timeFilter)
  const periods = useMemo(() => computeAvailablePeriods(accountTransactions), [accountTransactions])

  const displayed = useMemo(() => {
    // Itemized credit-card purchases only exist to be found via their parent
    // Giro "Kreditkarte" booking's breakdown modal — never as their own row.
    let result = timeFiltered.filter(t => !t.parentId)
    if (filterCategory) {
      result = result.filter(t => t.categoryId === filterCategory)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(t =>
        t.counterparty.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.customLabel ?? '').toLowerCase().includes(q)
      )
    }
    if (amountSearch.trim()) {
      const q = amountSearch.trim().replace(',', '.')
      result = result.filter(t => Math.abs(t.amount).toFixed(2).includes(q))
    }
    return result
  }, [timeFiltered, filterCategory, search, amountSearch])

  return (
    <PullToRefresh scrollId="page-scroll-transactions" onRefresh={handleRefresh}>
    <ChartLoader show={refreshing} message={refreshMessage} dismissible={false} />
    <div id="page-transactions" className="flex flex-col gap-4">
      <div
        id="tx-sticky-filter"
        className="sticky top-0 z-30"
        style={{
          backdropFilter: 'blur(5px)',
          paddingTop: '60px',
          WebkitBackdropFilter: 'blur(5px)',
          backgroundColor: 'rgba(10, 10, 10, 0.8)',
          boxShadow: '0 -4px 24px 10px rgba(10,10,10,0.8), 0 -1px 80px 10px rgba(10,10,10,0.8)',
          borderRadius: '20px',
        }}
      >
        <TimeFilterBar value={timeFilter} onChange={setTimeFilter} id="tx" periods={periods} />
      </div>

      <div id="tx-search-row" className="flex items-center gap-2">
        <div id="tx-search-bar" className="relative flex-1 flex items-center">
          <Search size={14} className="absolute left-3 text-white/30 pointer-events-none" />
          <input
            type="text"
            placeholder="Suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-pill bg-white/5 border border-white/8 pl-8 pr-4 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-purple-500/40 focus:bg-white/[0.07] transition-all duration-200"
          />
          <div className="absolute right-1.5 flex items-center gap-1">
            {search && (
              <button onClick={() => setSearch('')} className="p-1 text-white/30 hover:text-white/70">
                <X size={14} />
              </button>
            )}
            <button
              onClick={() => setFilterOpen(v => !v)}
              className={`p-1.5 rounded-pill border transition-colors duration-150 ${
                filterCategory
                  ? 'text-purple-400 border-purple-500/40 bg-purple-500/10'
                  : 'text-white/40 border-white/10'
              }`}
            >
              <SlidersHorizontal size={14} />
            </button>
          </div>
        </div>

        <div id="tx-amount-search" className="relative flex items-center w-21 shrink-0">
          <span className="absolute left-3 text-white/30 text-sm pointer-events-none">€</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Betrag"
            value={amountSearch}
            onChange={e => setAmountSearch(e.target.value)}
            className="w-full rounded-pill bg-white/5 border border-white/8 pl-6 pr-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-purple-500/40 focus:bg-white/[0.07] transition-all duration-200"
          />
          {amountSearch && (
            <button onClick={() => setAmountSearch('')} className="absolute right-2 p-1 text-white/30 hover:text-white/70">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Category filter pills */}
      <AnimatePresence>
        {filterOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div id="tx-filter-pills" className="flex flex-wrap gap-2 pb-1">
              <PillButton
                size="sm"
                variant="secondary"
                active={filterCategory === null}
                onClick={() => setFilterCategory(null)}
              >
                Alle
              </PillButton>
              {allList.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setFilterCategory(filterCategory === cat.id ? null : cat.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill text-xs font-medium border transition-all duration-150 active:scale-95"
                  style={{
                    backgroundColor: filterCategory === cat.id ? `${cat.color}20` : 'rgba(255,255,255,0.04)',
                    borderColor: filterCategory === cat.id ? `${cat.color}50` : 'rgba(255,255,255,0.08)',
                    color: filterCategory === cat.id ? cat.color : 'rgba(255,255,255,0.5)',
                  }}
                >
                  <span>{cat.icon}</span>
                  {cat.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p id="tx-result-count" className="text-xs text-white/30">
        {displayed.length} Buchung{displayed.length !== 1 ? 'en' : ''}
      </p>

      <div id="tx-transaction-list">
        <TransactionList
          transactions={displayed}
          onTransactionClick={handleTransactionClick}
        />
      </div>

      <KreditkartenBreakdownModal
        parent={breakdownParent}
        items={breakdownParent ? accountTransactions.filter(t => t.parentId === breakdownParent.id) : []}
        onClose={() => setBreakdownParent(null)}
        onSelectChild={setSelected}
      />

      <TransactionDetailModal
        transaction={selected}
        onClose={() => setSelected(null)}
        onUpdate={(id, patch) => {
          updateTransaction(id, patch)
          // Keep modal open with updated data
          setSelected(prev => prev ? { ...prev, ...patch } : null)
        }}
      />
    </div>
    </PullToRefresh>
  )
}
