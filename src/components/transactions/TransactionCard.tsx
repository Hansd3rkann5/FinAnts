import { useState } from 'react'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { RefreshCw } from 'lucide-react'
import type { Transaction } from '@/types'
import { MerchantLogo } from './MerchantLogo'
import { AmountDisplay } from '@/components/ui/AmountDisplay'
import { CategoryBadge } from '@/components/ui/CategoryBadge'
import { CategoryPicker } from '@/components/ui/CategoryPicker'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { resolveProfile } from '@/hooks/useMerchantProfiles'

interface Props {
  transaction: Transaction
  onCategoryChange?: (id: string, cat: Transaction['categoryId']) => void
  onClick?: (tx: Transaction) => void
  index?: number
}

export function TransactionCard({ transaction: tx, onCategoryChange, onClick, index = 0 }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const { merchantProfiles } = useTransactionsCtx()
  const profile = resolveProfile(tx, merchantProfiles)

  const displayLabel = tx.customLabel ?? profile?.label
  const displayIcon  = tx.customIcon  ?? profile?.customIcon

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1], delay: Math.min(index * 0.04, 0.3) }}
        onClick={() => onClick?.(tx)}
        className="flex items-center gap-3 p-3 rounded-card_sm bg-white/3 border border-white/6 active:bg-white/[0.07] transition-colors duration-100 cursor-pointer"
      >
        <MerchantLogo merchantKey={tx.merchantKey} categoryId={tx.categoryId} customIcon={displayIcon} size={42} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white/90 truncate leading-tight">
                {displayLabel || tx.counterparty || tx.description || '–'}
              </p>
              <p className="text-xs text-white/40 truncate mt-0.5 leading-tight">
                {displayLabel
                  ? (tx.counterparty || tx.description || '')
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
            ) : (
              <CategoryBadge
                categoryId={tx.categoryId}
                size="sm"
                onClick={onCategoryChange ? () => setPickerOpen(true) : undefined}
              />
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

      <CategoryPicker
        open={pickerOpen}
        current={tx.categoryId}
        onSelect={cat => onCategoryChange?.(tx.id, cat)}
        onClose={() => setPickerOpen(false)}
      />
    </>
  )
}
