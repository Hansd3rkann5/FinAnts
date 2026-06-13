import { useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import type { TimeFilter } from '@/types'
import { getFilterMode } from '@/utils/chartCompute'
import type { AvailablePeriods } from '@/utils/chartCompute'

const MODES: { label: string; value: 'week' | 'month' | 'year' | 'all' }[] = [
  { label: 'Woche',  value: 'week'  },
  { label: 'Monat',  value: 'month' },
  { label: 'Jahr',   value: 'year'  },
  { label: 'Alles',  value: 'all'   },
]

function SubChip({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all border ${
        active
          ? 'bg-purple-500/25 border-purple-500/40 text-purple-200'
          : 'bg-white/5 border-white/8 text-white/40 hover:text-white/70 hover:bg-white/10'
      }`}
    >
      {label}
    </button>
  )
}

interface Props {
  value: TimeFilter
  onChange: (v: TimeFilter) => void
  id?: string
  periods?: AvailablePeriods
}

export function TimeFilterBar({ value, onChange, id = 'default', periods }: Props) {
  const mode = getFilterMode(value)
  const subRef = useRef<HTMLDivElement>(null)

  // Build sub-row chips for the active mode
  const subChips = useMemo((): { value: TimeFilter; label: string }[] => {
    if (!periods) return []
    if (mode === 'year') {
      return periods.years.map(yr => ({
        value: `year/${yr}` as TimeFilter,
        label: `${yr}`,
      }))
    }
    if (mode === 'month') {
      return periods.months.map(({ year, month }) => ({
        value: `month/${year}/${month}` as TimeFilter,
        label: format(new Date(year, month - 1, 1), "MMM ''yy", { locale: de }),
      }))
    }
    if (mode === 'week') {
      const multiYear = new Set(periods.weeks.map(w => w.year)).size > 1
      return periods.weeks.map(({ year, week }) => ({
        value: `week/${year}/${week}` as TimeFilter,
        label: multiYear ? `KW ${week} '${String(year).slice(2)}` : `KW ${week}`,
      }))
    }
    return []
  }, [mode, periods])

  // Auto-scroll sub-row to right (most recent on right)
  useEffect(() => {
    const el = subRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [mode, subChips.length])

  const hasSubRow = subChips.length > 0 && mode !== 'all'

  return (
    <div className="flex flex-col gap-1.5">
      {/* Mode buttons — padded so they align with page content */}
      <div className="px-4">
        <div className="relative flex rounded-pill bg-white/5 border border-white/8 p-1 gap-0.5">
          {MODES.map(opt => (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className="relative flex-1 py-1.5 text-xs font-medium rounded-pill transition-colors duration-200 z-10"
              style={{ color: mode === opt.value ? '#fff' : 'rgba(255,255,255,0.5)' }}
            >
              {mode === opt.value && (
                <motion.span
                  layoutId={`time-filter-pill-${id}`}
                  className="absolute inset-0 rounded-pill bg-linear-to-r from-purple-600/70 to-blue-600/70 border border-purple-500/30"
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                />
              )}
              <span className="relative z-10">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Specific period sub-row */}
      <AnimatePresence>
        {hasSubRow && (
          <motion.div
            key={mode}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div ref={subRef} className="overflow-x-auto">
              <div className="flex gap-1.5 pb-0.5 px-0.5">
                <SubChip
                  label="Aktuell"
                  active={value === mode}
                  onClick={() => onChange(mode)}
                />
                {subChips.map(chip => (
                  <SubChip
                    key={String(chip.value)}
                    label={chip.label}
                    active={value === chip.value}
                    onClick={() => onChange(chip.value)}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
