import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronDown, ChevronUp } from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { CATEGORIES, isExcluded, EXCLUDE_CATEGORY_ID } from '@/data/categories'
import { categoryPortions, filterByTimeFilter } from '@/utils/chartCompute'
import { useModalRegistration } from '@/hooks/useModalRegistration'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { useAllCategories } from '@/hooks/useAllCategories'
import type { Transaction, TimeFilter } from '@/types'

function formatEur(v: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(v)
}

interface Props {
  open: boolean
  onClose: () => void
  onTransactionSelect: (tx: Transaction) => void
  filter?: TimeFilter
}

export function CategoryBreakdownModal({ open, onClose, onTransactionSelect, filter }: Props) {
  useModalRegistration(open)
  const { transactions } = useTransactionsCtx()
  const { allMap } = useAllCategories()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const categoryEntries = useMemo(() => {
    const scoped = filter ? filterByTimeFilter(transactions, filter) : transactions
    const booked = scoped.filter(t => !t.isPending && !isExcluded(t))
    const map = new Map<string, { tx: Transaction; amount: number }[]>()
    for (const tx of booked) {
      for (const p of categoryPortions(tx)) {
        if (p.categoryId === EXCLUDE_CATEGORY_ID) continue
        if (!map.has(p.categoryId)) map.set(p.categoryId, [])
        map.get(p.categoryId)!.push({ tx, amount: p.amount })
      }
    }
    return [...map.entries()]
      .map(([catId, items]) => ({
        cat: allMap[catId] ?? CATEGORIES['other'],
        items: items.sort((a, b) => b.tx.date.getTime() - a.tx.date.getTime()),
        total: items.reduce((sum, it) => sum + it.amount, 0),
      }))
      .sort((a, b) => a.total - b.total)
  }, [transactions, filter, allMap])

  return createPortal(
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="catbreak-backdrop"
              id="modal-catbreak-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md"
              onClick={onClose}
            />
            <motion.div
              key="catbreak-sheet"
              id="modal-catbreak-sheet"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 40 }}
              onClick={e => e.stopPropagation()}
              className="absolute bottom-0 left-0 right-0 z-51 rounded-t-4xl border-t border-white/10 flex flex-col max-h-[92svh]"
              style={{ background: 'linear-gradient(160deg, rgba(28,24,46,0.2) 0%, rgba(18,15,36,0.7) 100%)', backdropFilter: 'blur(var(--blur-modal))', WebkitBackdropFilter: 'blur(var(--blur-modal))' }}
            >
              <div id="modal-catbreak-handle" className="w-10 h-1 rounded-full bg-white/15 mx-auto mt-3 mb-1 shrink-0" />

              <div id="modal-catbreak-scroll" className="overflow-y-auto flex-1 min-h-0 px-5 pt-3 pb-6">
                <div id="modal-catbreak-header" className="flex items-center justify-between mb-5">
                  <h3 id="modal-catbreak-title" className="text-sm font-semibold text-white/80">Kategorien</h3>
                  <button
                    id="btn-catbreak-close"
                    onClick={onClose}
                    className="w-8 h-8 rounded-full bg-white/6 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
                  >
                    <X size={15} />
                  </button>
                </div>

                <div id="catbreak-list" className="flex flex-col gap-2">
                  {categoryEntries.map(({ cat, items, total }) => {
                    const isExpanded = expandedId === cat.id
                    return (
                      <div
                        key={cat.id}
                        id={`catbreak-cat-${cat.id}`}
                        className="rounded-card_sm border overflow-hidden"
                        style={{ borderColor: `${cat.color}25`, backgroundColor: `${cat.color}15`, backdropFilter: 'blur(calc(var(--blur-modal) + 2px))', WebkitBackdropFilter: 'blur(calc(var(--blur-modal) + 2px))' }}
                      >
                        <button
                          id={`btn-catbreak-expand-${cat.id}`}
                          className="w-full flex items-center gap-3 px-3 py-3 text-left active:opacity-70 transition-opacity"
                          onClick={() => setExpandedId(isExpanded ? null : cat.id)}
                        >
                          <div
                            id={`catbreak-cat-icon-${cat.id}`}
                            className="w-8 h-8 rounded-card_sm flex items-center justify-center shrink-0 text-base"
                            style={{ backgroundColor: `${cat.color}22`, border: `1.5px solid ${cat.color}40` }}
                          >
                            {cat.icon.startsWith('data:') || cat.icon.startsWith('http')
                              ? <img src={cat.icon} alt="" className="w-full h-full object-cover rounded-card_sm" />
                              : cat.icon}
                          </div>
                          <div id={`catbreak-cat-info-${cat.id}`} className="flex-1 min-w-0">
                            <p className="text-sm text-white/80">{cat.label}</p>
                            <p className="text-[10px] text-white/30">{items.length} Buchung{items.length !== 1 ? 'en' : ''}</p>
                          </div>
                          <p id={`catbreak-cat-total-${cat.id}`} className={`text-sm font-semibold shrink-0 mr-1 ${total >= 0 ? 'text-emerald-400' : 'text-white/60'}`}>
                            {total >= 0 ? '+' : ''}{formatEur(total)}
                          </p>
                          {isExpanded
                            ? <ChevronUp size={14} className="shrink-0 text-white/30" />
                            : <ChevronDown size={14} className="shrink-0 text-white/30" />}
                        </button>

                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              id={`catbreak-cat-txlist-${cat.id}`}
                              initial={{ height: 0 }}
                              animate={{ height: 'auto' }}
                              exit={{ height: 0 }}
                              transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
                              className="overflow-hidden"
                            >
                              <div className="border-t mx-3 mb-1" style={{ borderColor: `${cat.color}20` }} />
                              <div id={`catbreak-cat-txs-${cat.id}`} className="pb-2">
                                {items.map(({ tx, amount }) => (
                                  <button
                                    key={tx.id}
                                    id={`btn-catbreak-tx-${tx.id}`}
                                    onClick={() => onTransactionSelect(tx)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/4 active:bg-white/6 transition-colors rounded-card_sm"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs text-white/70 truncate">
                                        {tx.customLabel ?? tx.counterparty}
                                        {tx.splits && tx.splits.length ? <span className="text-white/30"> · geteilt</span> : null}
                                      </p>
                                      <p className="text-[10px] text-white/30">
                                        {format(tx.date, 'dd. MMM yyyy', { locale: de })}
                                      </p>
                                    </div>
                                    <p className={`text-xs font-medium shrink-0 ${amount < 0 ? 'text-white/60' : 'text-emerald-400'}`}>
                                      {amount >= 0 ? '+' : ''}{formatEur(amount)}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>,
    document.body
  )
}
