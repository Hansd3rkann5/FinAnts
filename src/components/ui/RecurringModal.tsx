import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, RefreshCw, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { useModalRegistration } from '@/hooks/useModalRegistration'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { MerchantLogo } from '@/components/transactions/MerchantLogo'
import { TransactionDetailModal } from '@/components/transactions/TransactionDetailModal'
import type { Transaction } from '@/types'

const FREQ_LABEL: Record<string, string> = {
  weekly: 'Wöchentlich',
  monthly: 'Monatlich',
  quarterly: 'Quartalsweise',
  yearly: 'Jährlich',
}

function formatEur(v: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(v)
}

interface Props {
  open: boolean
  onClose: () => void
}

export function RecurringModal({ open, onClose }: Props) {
  useModalRegistration(open)
  const { transactions, recurringGroups, removeRecurringGroup, updateTransaction } = useTransactionsCtx()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Transaction | null>(null)

  const txById = new Map(transactions.map(t => [t.id, t]))

  return createPortal(
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="recurring-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md"
              onClick={onClose}
            />
            <motion.div
              key="recurring-sheet"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 40 }}
              onClick={e => e.stopPropagation()}
              className="absolute bottom-0 left-0 right-0 z-51 rounded-t-4xl border-t border-white/10 flex flex-col max-h-[92svh]"
              style={{ background: 'linear-gradient(160deg, rgba(28,24,46,0.99) 0%, rgba(18,15,36,0.99) 100%)' }}
            >
              <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mt-3 mb-1 shrink-0" />

              <div className="overflow-y-auto flex-1 min-h-0 px-5 pt-3 pb-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <RefreshCw size={14} className="text-purple-400" />
                    <h3 className="text-sm font-semibold text-white/80">Daueraufträge</h3>
                    <span className="text-xs text-white/30">{recurringGroups.length}</span>
                  </div>
                  <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-full bg-white/6 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {recurringGroups.map(g => {
                    const groupTxs = g.transactions
                      .map(id => txById.get(id))
                      .filter(Boolean)
                      .sort((a, b) => b!.date.getTime() - a!.date.getTime()) as Transaction[]
                    const latest = groupTxs[0]
                    const isExpanded = expandedId === g.id

                    return (
                      <div
                        key={g.id}
                        className="rounded-card_sm border border-white/8 overflow-hidden"
                        style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                      >
                        {/* Group header row */}
                        <button
                          className="w-full flex items-center gap-3 px-3 py-3 text-left active:bg-white/5 transition-colors"
                          onClick={() => setExpandedId(isExpanded ? null : g.id)}
                        >
                          <MerchantLogo
                            merchantKey={g.merchantKey}
                            categoryId={latest?.categoryId ?? 'other'}
                            customIcon={latest?.customIcon}
                            size={36}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white/80 truncate">{g.counterparty}</p>
                            <p className="text-[10px] text-purple-400/70">{FREQ_LABEL[g.frequency]}</p>
                          </div>
                          <p className={`text-sm font-semibold shrink-0 ${g.approximateAmount < 0 ? 'text-white/70' : 'text-emerald-400'}`}>
                            {g.approximateAmount >= 0 ? '+' : ''}{formatEur(g.approximateAmount)}
                          </p>
                          <button
                            onClick={e => { e.stopPropagation(); removeRecurringGroup(g.id) }}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white/20 hover:text-red-400 transition-colors ml-1 shrink-0"
                          >
                            <Trash2 size={13} />
                          </button>
                        </button>

                        {/* Expanded transaction list */}
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: 'auto' }}
                              exit={{ height: 0 }}
                              transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                              className="overflow-hidden"
                            >
                              <div className="border-t border-white/6 mx-3 mb-1" />
                              <div className="pb-2">
                                {groupTxs.slice(0, 8).map(tx => (
                                  <button
                                    key={tx.id}
                                    onClick={() => setSelected(tx)}
                                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/4 active:bg-white/6 transition-colors rounded-card_sm"
                                  >
                                    <p className="text-xs text-white/50">
                                      {format(tx.date, 'dd. MMM yyyy', { locale: de })}
                                    </p>
                                    <p className={`text-xs font-medium ${tx.amount < 0 ? 'text-white/60' : 'text-emerald-400'}`}>
                                      {tx.amount >= 0 ? '+' : ''}{formatEur(tx.amount)}
                                    </p>
                                  </button>
                                ))}
                                {groupTxs.length > 8 && (
                                  <p className="text-[10px] text-white/25 text-center py-1">
                                    +{groupTxs.length - 8} weitere
                                  </p>
                                )}
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

      <TransactionDetailModal
        transaction={selected}
        onClose={() => setSelected(null)}
        onUpdate={(id, patch) => {
          updateTransaction(id, patch)
          setSelected(prev => prev ? { ...prev, ...patch } : null)
        }}
      />
    </>,
    document.body
  )
}
