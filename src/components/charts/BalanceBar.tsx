import type { BalanceSummary } from '@/types'

interface Props {
  summary: BalanceSummary
}

function formatEur(v: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

export function BalanceBar({ summary }: Props) {
  const total = summary.totalIncome + summary.totalExpenses
  const incomeWidth = total > 0 ? (summary.totalIncome / total) * 100 : 50

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-end">
        <div>
          <p className="text-xs text-white/40 mb-0.5">Einnahmen</p>
          <p className="text-sm font-semibold text-emerald-400">{formatEur(summary.totalIncome)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-white/40 mb-0.5">Saldo</p>
          <p className={`text-base font-bold ${summary.balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {summary.balance >= 0 ? '+' : ''}{formatEur(summary.balance)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-white/40 mb-0.5">Ausgaben</p>
          <p className="text-sm font-semibold text-white/70">{formatEur(summary.totalExpenses)}</p>
        </div>
      </div>

      <div className="h-2 rounded-pill bg-white/[0.06] overflow-hidden flex">
        <div
          className="h-full rounded-pill bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ width: `${incomeWidth}%` }}
        />
      </div>
    </div>
  )
}
