import { motion } from 'framer-motion'
import type { TimeFilter } from '@/types'

const OPTIONS: { label: string; value: TimeFilter }[] = [
  { label: 'Woche',  value: 'week'  },
  { label: 'Monat',  value: 'month' },
  { label: 'Jahr',   value: 'year'  },
  { label: 'Alles',  value: 'all'   },
]

interface Props {
  value: TimeFilter
  onChange: (v: TimeFilter) => void
}

export function TimeFilterBar({ value, onChange }: Props) {
  return (
    <div className="relative flex rounded-pill bg-white/[0.05] border border-white/[0.08] p-1 gap-0.5">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className="relative flex-1 py-1.5 text-xs font-medium rounded-pill transition-colors duration-200 z-10"
          style={{ color: value === opt.value ? '#fff' : 'rgba(255,255,255,0.5)' }}
        >
          {value === opt.value && (
            <motion.span
              layoutId="time-filter-pill"
              className="absolute inset-0 rounded-pill bg-gradient-to-r from-purple-600/70 to-blue-600/70 border border-purple-500/30"
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            />
          )}
          <span className="relative z-10">{opt.label}</span>
        </button>
      ))}
    </div>
  )
}
