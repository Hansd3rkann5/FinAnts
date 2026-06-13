import { motion } from 'framer-motion'
import type { TopMerchant } from '@/utils/chartCompute'
import type { Category } from '@/types'

function formatEur(v: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

interface Props {
  merchants: TopMerchant[]
  allMap: Record<string, Category>
}

export function TopMerchantsBar({ merchants, allMap }: Props) {
  const max = merchants[0]?.total ?? 1

  return (
    <div id="chart-top-merchants" className="flex flex-col gap-2.5">
      {merchants.map((m, i) => {
        const cat = allMap[m.categoryId]
        const pct = (m.total / max) * 100
        return (
          <div key={m.name} id={`merchant-row-${i}`} className="flex items-center gap-2">
            <span className="text-[10px] text-white/20 w-4 shrink-0 text-right">{i + 1}</span>
            <span id={`merchant-name-${i}`} className="text-xs text-white/60 truncate w-28 shrink-0">{m.name}</span>
            <div id={`merchant-bar-track-${i}`} className="flex-1 h-1.5 bg-white/6 rounded-full overflow-hidden">
              <motion.div
                id={`merchant-bar-${i}`}
                className="h-full rounded-full"
                style={{ backgroundColor: cat?.color ?? '#6b7280' }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1], delay: i * 0.04 }}
              />
            </div>
            <div className="text-right shrink-0 w-14">
              <p className="text-xs font-medium text-white/80">{formatEur(m.total)}</p>
              {m.count > 1 && <p className="text-[9px] text-white/25">{m.count}×</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
