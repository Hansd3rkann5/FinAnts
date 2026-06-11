import { clsx } from 'clsx'

interface Props {
  amount: number
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function AmountDisplay({ amount, className, size = 'md' }: Props) {
  const isPositive = amount >= 0
  const formatted = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount)

  return (
    <span
      className={clsx(
        'font-semibold tabular-nums',
        size === 'sm'  && 'text-sm',
        size === 'md'  && 'text-base',
        size === 'lg'  && 'text-xl',
        size === 'xl'  && 'text-3xl',
        isPositive ? 'text-emerald-400' : 'text-white/90',
        className,
      )}
    >
      {isPositive ? '+' : ''}{formatted}
    </span>
  )
}
