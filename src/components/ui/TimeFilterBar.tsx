import { useRef, useEffect, useMemo, useState, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import type { TimeFilter } from '@/types'
import { getFilterMode } from '@/utils/chartCompute'
import type { AvailablePeriods } from '@/utils/chartCompute'

type Mode = 'week' | 'month' | 'year' | 'all'

const MODES: { label: string; value: Mode }[] = [
  { label: 'Woche',  value: 'week'  },
  { label: 'Monat',  value: 'month' },
  { label: 'Jahr',   value: 'year'  },
  { label: 'Alles',  value: 'all'   },
]

interface Props {
  value: TimeFilter
  onChange: (v: TimeFilter) => void
  id?: string
  periods?: AvailablePeriods
}

export function TimeFilterBar({ value, onChange, id = 'default', periods }: Props) {
  const mode = getFilterMode(value)
  const barRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const listRef = useRef<HTMLDivElement>(null)

  // Which mode's period dropdown is open (anchored under that mode's pill).
  const [openMode, setOpenMode] = useState<Mode | null>(null)
  const [pos, setPos] = useState({ left: 0, width: 0 })

  // Period options for the open mode: "Aktuell" + every specific period.
  const options = useMemo((): { value: TimeFilter; label: string }[] => {
    if (!openMode || openMode === 'all' || !periods) return []
    const head = { value: openMode as TimeFilter, label: 'Aktuell' }
    if (openMode === 'year') {
      return [head, ...periods.years.map(yr => ({ value: `year/${yr}` as TimeFilter, label: `${yr}` }))]
    }
    if (openMode === 'month') {
      return [head, ...periods.months.map(({ year, month }) => ({
        value: `month/${year}/${month}` as TimeFilter,
        label: format(new Date(year, month - 1, 1), "MMM ''yy", { locale: de }),
      }))]
    }
    const multiYear = new Set(periods.weeks.map(w => w.year)).size > 1
    return [head, ...periods.weeks.map(({ year, week }) => ({
      value: `week/${year}/${week}` as TimeFilter,
      label: multiYear ? `KW ${week} '${String(year).slice(2)}` : `KW ${week}`,
    }))]
  }, [openMode, periods])

  // Anchor the dropdown under the active mode's button.
  useLayoutEffect(() => {
    if (openMode == null) return
    const i = MODES.findIndex(m => m.value === openMode)
    const btn = btnRefs.current[i]
    if (btn) setPos({ left: btn.offsetLeft, width: btn.offsetWidth })
  }, [openMode])

  useEffect(() => {
    if (openMode == null) return
    const reposition = () => {
      const i = MODES.findIndex(m => m.value === openMode)
      const btn = btnRefs.current[i]
      if (btn) setPos({ left: btn.offsetLeft, width: btn.offsetWidth })
    }
    const onOutside = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpenMode(null)
    }
    window.addEventListener('resize', reposition)
    document.addEventListener('pointerdown', onOutside)
    return () => {
      window.removeEventListener('resize', reposition)
      document.removeEventListener('pointerdown', onOutside)
    }
  }, [openMode])

  // Scroll the open list to the selected period (else to the newest, at bottom).
  useEffect(() => {
    if (!openMode) return
    const el = listRef.current
    if (!el) return
    const active = el.querySelector('[data-active="true"]') as HTMLElement | null
    if (active) active.scrollIntoView({ block: 'nearest' })
    else el.scrollTop = el.scrollHeight
  }, [openMode, options.length])

  function clickMode(m: Mode) {
    if (m === 'all') { onChange('all'); setOpenMode(null); return }
    if (getFilterMode(value) !== m) {
      onChange(m)          // switch to that mode (current period) …
      setOpenMode(m)       // … and open its period picker
    } else {
      setOpenMode(prev => (prev ? null : m))   // re-tapping the active mode toggles
    }
  }

  function selectPeriod(v: TimeFilter) {
    onChange(v)
    setOpenMode(null)      // collapse once a period is chosen
  }

  return (
    <div className="px-4">
      <div ref={barRef} className="relative flex rounded-pill bg-white/5 border border-white/8 p-1 gap-0.5">
        {MODES.map((opt, i) => (
          <button
            key={opt.value}
            ref={el => { btnRefs.current[i] = el }}
            onClick={() => clickMode(opt.value)}
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

        {/* Period dropdown — expands down from the active mode pill */}
        <AnimatePresence>
          {openMode && options.length > 0 && (
            <motion.div
              key={openMode}
              initial={{ opacity: 0, height: 0, y: -4 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="absolute z-50 overflow-hidden rounded-card border border-purple-500/30 bg-[#14141f]/95 backdrop-blur-xl shadow-xl shadow-black/40"
              style={{ left: pos.left, width: pos.width, top: 'calc(100% + 6px)' }}
            >
              <div ref={listRef} className="max-h-44 overflow-y-auto py-1">
                {options.map(opt => {
                  const active = value === opt.value
                  return (
                    <button
                      key={String(opt.value)}
                      data-active={active}
                      onClick={() => selectPeriod(opt.value)}
                      className={`block w-full text-center px-2 py-1.5 text-xs font-medium transition-colors ${
                        active ? 'bg-purple-500/25 text-purple-100' : 'text-white/55 hover:bg-white/8 hover:text-white/80'
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
