import { useState, useMemo } from 'react'
import { Search, X, SlidersHorizontal } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { TimeFilter, Transaction } from '@/types'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { useFilteredTransactions } from '@/hooks/useFilteredTransactions'
import { useAllCategories } from '@/hooks/useAllCategories'
import { TimeFilterBar } from '@/components/ui/TimeFilterBar'
import { TransactionList } from '@/components/transactions/TransactionList'
import { TransactionDetailModal } from '@/components/transactions/TransactionDetailModal'
import { PillButton } from '@/components/ui/PillButton'

export function Transactions() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('month')
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const { allList } = useAllCategories()
  const [filterOpen, setFilterOpen] = useState(false)
  const [selected, setSelected] = useState<Transaction | null>(null)
  const { transactions, updateCategory, updateTransaction } = useTransactionsCtx()

  const timeFiltered = useFilteredTransactions(transactions, timeFilter)

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
    <div className="flex flex-col gap-4">
      <TimeFilterBar value={timeFilter} onChange={setTimeFilter} />

      {/* Search bar */}
      <div className="relative flex items-center">
        <Search size={14} className="absolute left-3 text-white/30 pointer-events-none" />
        <input
          type="text"
          placeholder="Suchen…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-pill bg-white/[0.05] border border-white/[0.08] pl-8 pr-4 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-purple-500/40 focus:bg-white/[0.07] transition-all duration-200"
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
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-2 pb-1">
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

      {/* Result count */}
      <p className="text-xs text-white/30">
        {displayed.length} Buchung{displayed.length !== 1 ? 'en' : ''}
      </p>

      <TransactionList
        transactions={displayed}
        onCategoryChange={updateCategory}
        onTransactionClick={setSelected}
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
  )
}
