import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import type { Transaction } from '@/types'
import { TransactionCard } from './TransactionCard'
import { CATEGORIES } from '@/data/categories'
import { formatEur } from '@/utils/format'


interface Props {
  parent: Transaction | null
  items: Transaction[]
  onClose: () => void
  onSelectChild: (tx: Transaction) => void
}

// Lists the itemized credit-card purchases billed under a lump-sum Giro
// "Kreditkarte" booking, using the exact same TransactionCard used in the
// main overview (same swipe-to-delete, same click-through). Lower z-index
// than TransactionDetailModal (z-40/z-50) so opening a child's detail view
// stacks correctly on top of this sheet rather than replacing it.
export function KreditkartenBreakdownModal({ parent, items, onClose, onSelectChild }: Props) {
  const knownSum = items.reduce((s, t) => s + t.amount, 0)
  const remaining = parent ? Math.round((parent.amount - knownSum) * 100) / 100 : 0
  const showRemaining = !!parent && Math.abs(remaining) >= 0.01

  return createPortal(
    <AnimatePresence>
      {parent && (
        <>
          <motion.div
            key="cc-backdrop"
            id="modal-cc-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-20 bg-black/60 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            key="cc-sheet"
            id="modal-cc-sheet"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            onClick={e => e.stopPropagation()}
            className="absolute bottom-0 left-0 right-0 z-30 rounded-t-4xl border-t border-white/10 flex flex-col max-h-[92svh]"
            style={{ background: 'linear-gradient(160deg, rgba(28,24,46,0.2) 0%, rgba(18,15,36,0.6) 100%)', backdropFilter: 'blur(var(--blur-modal))', WebkitBackdropFilter: 'blur(var(--blur-modal))' }}
          >
            <div id="modal-cc-handle" className="w-10 h-1 rounded-full bg-white/15 mx-auto mt-3 mb-0 shrink-0" />

            <div id="modal-cc-scroll" className="overflow-y-auto flex-1 min-h-0 px-5 pt-3 pb-6">
              <div id="modal-cc-header" className="flex items-center justify-between mb-4">
                <span className="text-xs text-white/30 uppercase tracking-wider">
                  Kreditkarte · {items.length} Buchung{items.length !== 1 ? 'en' : ''}
                </span>
                <button id="btn-cc-close" onClick={onClose} className="w-8 h-8 rounded-full bg-white/6 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors">
                  <X size={15} />
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {items.map((tx, i) => (
                  <TransactionCard key={tx.id} transaction={tx} index={i} onClick={onSelectChild} />
                ))}

                {showRemaining && (
                  <div id="modal-cc-remaining" className="flex items-center gap-3 p-3 rounded-card_sm bg-white/3 border border-dashed border-white/10 opacity-70">
                    <div className="w-[42px] h-[42px] rounded-full bg-white/6 flex items-center justify-center text-lg shrink-0">
                      {CATEGORIES['other'].icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white/70 truncate">Verbleibend (nicht aufgeschlüsselt)</p>
                      <p className="text-xs text-white/40">{CATEGORIES['other'].label}</p>
                    </div>
                    <span className={`text-sm font-medium shrink-0 ${remaining >= 0 ? 'text-emerald-400' : 'text-white/70'}`}>
                      {formatEur(remaining)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
