import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { RefreshCw, Trash2 } from 'lucide-react'
import type { Transaction } from '@/types'
import { MerchantLogo } from './MerchantLogo'
import { findMerchant } from '@/utils/merchantLogos'
import { AmountDisplay } from '@/components/ui/AmountDisplay'
import { CategoryBadge } from '@/components/ui/CategoryBadge'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { resolveProfile } from '@/hooks/useMerchantProfiles'
import { isExcluded } from '@/data/categories'

const LONG_PRESS_MS = 500

interface Props {
  transaction: Transaction
  onClick?: (tx: Transaction) => void
  index?: number
}

export function TransactionCard({ transaction: tx, onClick, index = 0 }: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const { merchantProfiles, deleteTransaction } = useTransactionsCtx()
  const profile = resolveProfile(tx, merchantProfiles)

  const displayLabel = tx.customLabel ?? profile?.label
  const displayIcon  = tx.customIcon  ?? profile?.customIcon
  const merchantKey  = tx.merchantKey ?? findMerchant(`${tx.description ?? ''} ${tx.counterparty ?? ''}`)?.merchantKey
  const excluded = isExcluded(tx)

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)

  function startLongPress() {
    didLongPress.current = false
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true
      navigator.vibrate?.(40)
      setDeleteOpen(true)
    }, LONG_PRESS_MS)
  }

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function handleClick() {
    if (didLongPress.current) return
    onClick?.(tx)
  }

  function confirmDelete() {
    setDeleteOpen(false)
    deleteTransaction(tx.id)
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: excluded ? 0.45 : 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1], delay: Math.min(index * 0.04, 0.3) }}
        onClick={handleClick}
        onPointerDown={startLongPress}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerCancel={cancelLongPress}
        data-component="tx-card"
        data-tx-id={tx.id}
        className="flex items-center gap-3 p-3 rounded-card_sm bg-white/3 border border-white/6 active:bg-white/[0.07] transition-colors duration-100 cursor-pointer select-none"
      >
        <MerchantLogo merchantKey={merchantKey} categoryId={tx.categoryId} customIcon={displayIcon} size={42} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white/90 truncate leading-tight">
                {displayLabel || tx.counterparty || tx.description || '–'}
              </p>
              <p className="text-xs text-white/40 truncate mt-0.5 leading-tight">
                {displayLabel === tx.counterparty
                  ? ''
                  : displayLabel
                  ? (/paypal/i.test(tx.counterparty)
                      ? (tx.description || '')
                      : (tx.counterparty || tx.description || ''))
                  : (tx.description !== tx.counterparty ? tx.description : '')}
              </p>
            </div>
            <AmountDisplay amount={tx.amount} size="sm" className="shrink-0 mt-0.5" />
          </div>

          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] text-white/30">
              {tx.isPending ? 'Ausstehend' : format(tx.date, 'dd. MMM', { locale: de })}
            </span>
            {tx.isPending ? (
              <span className="inline-flex items-center text-[10px] text-amber-400/80 rounded-pill border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5">
                Ausstehend
              </span>
            ) : tx.splits && tx.splits.length ? (
              <div className="flex items-center gap-1">
                {tx.splits.map((s, i) => (
                  <CategoryBadge key={i} categoryId={s.categoryId} size="sm" showLabel={false} />
                ))}
              </div>
            ) : (
              <CategoryBadge categoryId={tx.categoryId} size="sm" />
            )}
            {tx.isRecurring && !tx.isPending && (
              <span className="inline-flex items-center gap-1 text-[10px] text-purple-400/70 rounded-pill border border-purple-500/20 bg-purple-500/10 px-1.5 py-0.5">
                <RefreshCw size={9} />
                Wiederkehrend
              </span>
            )}
          </div>
        </div>
      </motion.div>

      {createPortal(
        <AnimatePresence>
          {deleteOpen && (
            <>
              <motion.div
                id={`modal-txdelete-backdrop-${tx.id}`}
                key="txdelete-backdrop"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md"
                onClick={() => setDeleteOpen(false)}
              />
              <motion.div
                id={`modal-txdelete-dialog-${tx.id}`}
                key="txdelete-dialog"
                initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="fixed inset-0 z-51 flex items-center justify-center px-6 pointer-events-none"
              >
                <div
                  id={`modal-txdelete-card-${tx.id}`}
                  className="pointer-events-auto w-full max-w-xs rounded-2xl border border-white/10 overflow-hidden"
                  style={{ background: 'linear-gradient(160deg, rgba(28,24,46,0.2) 0%, rgba(18,15,36,0.6) 100%)', backdropFilter: 'blur(var(--blur-modal))', WebkitBackdropFilter: 'blur(var(--blur-modal))' }}
                >
                  <div className="flex flex-col items-center gap-1 px-5 pt-6 pb-4 text-center">
                    <div className="w-11 h-11 rounded-full bg-red-500/15 border border-red-500/25 flex items-center justify-center mb-2">
                      <Trash2 size={18} className="text-red-400" />
                    </div>
                    <p id={`txdelete-title-${tx.id}`} className="text-sm font-semibold text-white/90">Buchung löschen?</p>
                    <p id={`txdelete-name-${tx.id}`} className="text-xs text-white/50 truncate max-w-full mt-0.5">
                      {displayLabel || tx.counterparty || tx.description || '–'}
                    </p>
                    <p id={`txdelete-amount-${tx.id}`} className={`text-sm font-medium mt-1 ${tx.amount >= 0 ? 'text-emerald-400' : 'text-white/70'}`}>
                      {tx.amount >= 0 ? '+' : ''}{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(tx.amount)}
                    </p>
                    <p className="text-[11px] text-white/30 mt-2">Diese Buchung wird dauerhaft aus der Datenbank entfernt.</p>
                  </div>
                  <div className="flex border-t border-white/8">
                    <button
                      id={`btn-txdelete-cancel-${tx.id}`}
                      onClick={() => setDeleteOpen(false)}
                      className="flex-1 py-3.5 text-sm text-white/50 hover:text-white/80 transition-colors border-r border-white/8"
                    >
                      Abbrechen
                    </button>
                    <button
                      id={`btn-txdelete-confirm-${tx.id}`}
                      onClick={confirmDelete}
                      className="flex-1 py-3.5 text-sm font-medium text-red-400 hover:text-red-300 transition-colors"
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
