import { useState, useMemo } from 'react'
import { Search, X, SlidersHorizontal } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { TimeFilter, Transaction } from '@/types'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { useFilteredTransactions } from '@/hooks/useFilteredTransactions'
import { useAllCategories } from '@/hooks/useAllCategories'
import { computeAvailablePeriods } from '@/utils/chartCompute'
import { TimeFilterBar } from '@/components/ui/TimeFilterBar'
import { TransactionList } from '@/components/transactions/TransactionList'
import { TransactionDetailModal } from '@/components/transactions/TransactionDetailModal'
import { PillButton } from '@/components/ui/PillButton'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { ChartLoader } from '@/components/ui/ChartLoader'

export function Transactions() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('month')
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const { allList } = useAllCategories()
  const [filterOpen, setFilterOpen] = useState(false)
  const [selected, setSelected] = useState<Transaction | null>(null)
  const { transactions, updateCategory, updateTransaction, refreshAll } = useTransactionsCtx()
  const [refreshing, setRefreshing] = useState(false)

  // Pull-to-refresh: download everything from the cloud — categories + merchant
  // patterns (R2) and the transactions (D1). This is how a new device pulls the
  // data after its API key is entered. Loading overlay until it resolves.
  async function handleRefresh() {
    setRefreshing(true)
    try { await refreshAll() } finally { setRefreshing(false) }
  }

  const timeFiltered = useFilteredTransactions(transactions, timeFilter)
  const periods = useMemo(() => computeAvailablePeriods(transactions), [transactions])

  const displayed = useMemo(() => {
    let result = timeFiltered
    if (filterCategory) {
      result = result.filter(t => t.categoryId === filterCategory)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(t =>
        t.counterparty.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      )
    }
    return result
  }, [timeFiltered, filterCategory, search])

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <ChartLoader
      show={refreshing}
      message="Buchungen werden aktualisiert…"
      onClose={() => setRefreshing(false)}
    />
    <div id="page-transactions" className="flex flex-col gap-4">
      <div
        id="tx-sticky-filter"
        className="sticky top-0 z-30"
        style={{
          backdropFilter: 'blur(6px)',
          paddingTop: '50px',
          WebkitBackdropFilter: 'blur(6px)',
          backgroundColor: 'rgba(10, 10, 20, 0.75)',
          boxShadow: '0 -4px 24px 10px rgba(10,10,10,0.8), 0 -1px 80px 10px rgba(10,10,10,0.8)',
        }}
      >
        <TimeFilterBar value={timeFilter} onChange={setTimeFilter} id="tx" periods={periods} />
      </div>

      <div id="tx-search-bar" className="relative flex items-center mx-4">
        <Search size={14} className="absolute left-3 text-white/30 pointer-events-none" />
        <input
          type="text"
          placeholder="Suchen…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-pill bg-white/5 border border-white/8 pl-8 pr-4 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-purple-500/40 focus:bg-white/[0.07] transition-all duration-200"
        />
        <div className="absolute right-2 flex items-center gap-1">
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

      {/* Category filter pills */}
      <AnimatePresence>
        {filterOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden mx-4"
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

      <p id="tx-result-count" className="text-xs text-white/30 mx-4">
        {displayed.length} Buchung{displayed.length !== 1 ? 'en' : ''}
      </p>

      <div className="mx-4">
        <TransactionList
          transactions={displayed}
          onCategoryChange={updateCategory}
          onTransactionClick={setSelected}
        />
      </div>

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
