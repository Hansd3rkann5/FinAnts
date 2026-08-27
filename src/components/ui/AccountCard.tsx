import { motion } from 'framer-motion'
import type { Account } from '@/types'
import { formatEur, formatDate, ACCOUNT_TYPE_LABELS } from '@/utils/format'
import { useLongPress } from '@/hooks/useLongPress'

const TYPE_ICON: Record<Account['type'], string> = {
  giro: '💳',
  savings: '🏦',
  depot: '📈',
  loan: '📋',
  other: '🏧',
}

interface Props {
  account: Account
  onToggle?: (iban: string) => void
  showToggle?: boolean
  onLongPress?: () => void
}

export function AccountCard({ account, onToggle, showToggle = false, onLongPress }: Props) {
  const isPositive = account.balance >= 0
  const longPress = useLongPress(onLongPress ?? (() => {}), 500)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: account.included ? 1 : 0.5, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className="rounded-card border border-white/8 bg-white/4 backdrop-blur-glass p-3 flex items-center gap-3 select-none"
      style={{
        borderColor: account.included ? 'rgba(var(--acc2-rgb),0.25)' : 'rgba(255,255,255,0.06)',
        cursor: onLongPress ? 'pointer' : undefined,
      }}
      {...(onLongPress ? longPress : {})}
    >
      <div className="w-9 h-9 rounded-card_sm bg-white/6 flex items-center justify-center text-base shrink-0 overflow-hidden">
        {account.customLogo
          ? <img src={account.customLogo} alt="Logo" className="w-full h-full object-contain" />
          : TYPE_ICON[account.type]}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white/80 truncate">
          {(account.description && account.description !== account.owner)
            ? account.description
            : ACCOUNT_TYPE_LABELS[account.type]}
        </p>
        <p className="text-[10px] text-white/30 truncate">
          {/^[A-Z]{2}\d{2}/.test(account.iban)
            ? account.iban.replace(/(.{4})/g, '$1 ').trim()
            : account.accountNumber || account.iban}
        </p>
      </div>

      <div className="text-right shrink-0">
        <p className={`text-sm font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {formatEur(account.balance, 2, account.currency)}
        </p>
        <p className="text-[10px] text-white/25">Stand {formatDate(account.balanceDate)}</p>
      </div>

      {showToggle && onToggle && (
        <button
          type="button"
          onClick={() => onToggle(account.iban)}
          className="shrink-0 w-10 h-6 rounded-pill relative transition-colors duration-200"
          style={{
            backgroundColor: account.included ? 'rgba(var(--acc2-rgb),0.6)' : 'rgba(255,255,255,0.1)',
          }}
          aria-label={account.included ? 'Konto ausschließen' : 'Konto einschließen'}
        >
          <motion.div
            animate={{ x: account.included ? 22 : 2 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm"
          />
        </button>
      )}
    </motion.div>
  )
}
