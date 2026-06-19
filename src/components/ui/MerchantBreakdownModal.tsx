import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { computeMerchantBreakdown } from '@/utils/chartCompute'
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

// Lower z-index than TransactionDetailModal (z-40/z-50) so opening a
// transaction's detail view stacks on top of this sheet rather than
// replacing it — onTransactionSelect intentionally leaves `open` untouched.
export function MerchantBreakdownModal({ open, onClose, onTransactionSelect, filter }: Props) {
  useModalRegistration(open)
  const { transactions, excludedMerchants, excludeMerchant } = useTransactionsCtx()
  const { allMap } = useAllCategories()
  const [expandedName, setExpandedName] = useState<string | null>(null)
  const [confirmName, setConfirmName] = useState<string | null>(null)

  const excludedSet = useMemo(() => new Set(excludedMerchants), [excludedMerchants])

  const merchantEntries = useMemo(
    () => computeMerchantBreakdown(transactions, filter ?? 'all').filter(e => !excludedSet.has(e.name)),
    [transactions, filter, excludedSet],
  )

  return createPortal(
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="merchbreak-backdrop"
              id="modal-merchbreak-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-20 bg-black/60 backdrop-blur-md"
              onClick={onClose}
            />
            <motion.div
              key="merchbreak-sheet"
              id="modal-merchbreak-sheet"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 40 }}
              onClick={e => e.stopPropagation()}
              className="absolute bottom-0 left-0 right-0 z-30 rounded-t-4xl border-t border-white/10 flex flex-col max-h-[92svh]"
              style={{ background: 'linear-gradient(160deg, rgba(28,24,46,0.2) 0%, rgba(18,15,36,0.7) 100%)', backdropFilter: 'blur(var(--blur-modal))', WebkitBackdropFilter: 'blur(var(--blur-modal))' }}
            >
              <div id="modal-merchbreak-handle" className="w-10 h-1 rounded-full bg-white/15 mx-auto mt-3 mb-1 shrink-0" />

              <div id="modal-merchbreak-scroll" className="overflow-y-auto flex-1 min-h-0 px-5 pt-3 pb-6">
                <div id="modal-merchbreak-header" className="flex items-center justify-between mb-5">
                  <h3 id="modal-merchbreak-title" className="text-sm font-semibold text-white/80">Händler</h3>
                  <button
                    id="btn-merchbreak-close"
                    onClick={onClose}
                    className="w-8 h-8 rounded-full bg-white/6 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
                  >
                    <X size={15} />
                  </button>
                </div>

                <div id="merchbreak-list" className="flex flex-col gap-2">
                  {merchantEntries.map(({ name, items, total, categoryId }) => {
                    const isExpanded = expandedName === name
                    const cat = allMap[categoryId]
                    return (
                      <div
                        key={name}
                        id={`merchbreak-row-${name}`}
                        className="rounded-card_sm border border-white/8 bg-white/4 overflow-hidden"
                        style={{ backdropFilter: 'blur(calc(var(--blur-modal) + 2px))', WebkitBackdropFilter: 'blur(calc(var(--blur-modal) + 2px))' }}
                      >
                        <div className="flex items-center gap-1 pr-2">
                          <button
                            id={`btn-merchbreak-expand-${name}`}
                            className="flex-1 min-w-0 flex items-center gap-3 px-3 py-3 text-left active:opacity-70 transition-opacity"
                            onClick={() => setExpandedName(isExpanded ? null : name)}
                          >
                            {cat && (
                              <div
                                id={`merchbreak-icon-${name}`}
                                className="w-8 h-8 rounded-card_sm flex items-center justify-center shrink-0 text-base"
                                style={{ backgroundColor: `${cat.color}22`, border: `1.5px solid ${cat.color}40` }}
                              >
                                {cat.icon.startsWith('data:') || cat.icon.startsWith('http')
                                  ? <img src={cat.icon} alt="" className="w-full h-full object-cover rounded-card_sm" />
                                  : cat.icon}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white/80 truncate">{name}</p>
                              <p className="text-[10px] text-white/30">{items.length} Buchung{items.length !== 1 ? 'en' : ''}</p>
                            </div>
                            <p className="text-sm font-semibold text-white/60 shrink-0 mr-1">{formatEur(total)}</p>
                            {isExpanded
                              ? <ChevronUp size={14} className="shrink-0 text-white/30" />
                              : <ChevronDown size={14} className="shrink-0 text-white/30" />}
                          </button>
                          <button
                            id={`btn-merchbreak-exclude-${name}`}
                            onClick={() => setConfirmName(name)}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white/30 hover:text-red-400 transition-colors shrink-0"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              id={`merchbreak-txlist-${name}`}
                              initial={{ height: 0 }}
                              animate={{ height: 'auto' }}
                              exit={{ height: 0 }}
                              transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
                              className="overflow-hidden"
                            >
                              <div className="border-t border-white/8 mx-3 mb-1" />
                              <div id={`merchbreak-txs-${name}`} className="pb-2">
                                {items.map(tx => (
                                  <button
                                    key={tx.id}
                                    id={`btn-merchbreak-tx-${tx.id}`}
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
                                    <p className="text-xs font-medium shrink-0 text-white/60">
                                      {formatEur(tx.amount)}
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

      <AnimatePresence>
        {confirmName && (
          <>
            <motion.div
              id="modal-merchdelete-backdrop"
              key="merchdelete-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-60 bg-black/70 backdrop-blur-md"
              onClick={() => setConfirmName(null)}
            />
            <motion.div
              id="modal-merchdelete-dialog"
              key="merchdelete-dialog"
              initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-0 z-61 flex items-center justify-center px-6 pointer-events-none"
            >
              <div
                id="modal-merchdelete-card"
                className="pointer-events-auto w-full max-w-xs rounded-2xl border border-white/10 overflow-hidden"
                style={{ background: 'linear-gradient(160deg, rgba(28,24,46,0.2) 0%, rgba(18,15,36,0.6) 100%)', backdropFilter: 'blur(var(--blur-modal))', WebkitBackdropFilter: 'blur(var(--blur-modal))' }}
              >
                <div className="flex flex-col items-center gap-1 px-5 pt-6 pb-4 text-center">
                  <div className="w-11 h-11 rounded-full bg-red-500/15 border border-red-500/25 flex items-center justify-center mb-2">
                    <Trash2 size={18} className="text-red-400" />
                  </div>
                  <p id="merchdelete-title" className="text-sm font-semibold text-white/90">Händler entfernen?</p>
                  <p id="merchdelete-name" className="text-xs text-white/50 truncate max-w-full mt-0.5">{confirmName}</p>
                  <p className="text-[11px] text-white/30 mt-2">
                    Wird nicht mehr als Top-Händler berücksichtigt. Die Buchungen selbst bleiben erhalten.
                  </p>
                </div>
                <div className="flex border-t border-white/8">
                  <button
                    id="btn-merchdelete-cancel"
                    onClick={() => setConfirmName(null)}
                    className="flex-1 py-3.5 text-sm text-white/50 hover:text-white/80 transition-colors border-r border-white/8"
                  >
                    Abbrechen
                  </button>
                  <button
                    id="btn-merchdelete-confirm"
                    onClick={() => { excludeMerchant(confirmName); setConfirmName(null) }}
                    className="flex-1 py-3.5 text-sm font-medium text-red-400 hover:text-red-300 transition-colors"
                  >
                    Entfernen
                  </button>
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
