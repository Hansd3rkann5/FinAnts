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

export function TimeFilterBar({ value, onChange, periods }: Props) {
  const mode = getFilterMode(value)
  const activeIndex = Math.max(0, MODES.findIndex(m => m.value === mode))
  const hasPicker = mode !== 'all'

  const barRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const listRef = useRef<HTMLDivElement>(null)

  const [open, setOpen] = useState(false)
  // Geometry of the active mode button — the pill is positioned over it.
  const [pos, setPos] = useState({ left: 0, top: 0, width: 0, height: 0 })

  const options = useMemo((): { value: TimeFilter; label: string }[] => {
    if (!hasPicker || !periods) return []
    const head = { value: mode as TimeFilter, label: 'Aktuell' }
    if (mode === 'year') {
      return [head, ...periods.years.map(yr => ({ value: `year/${yr}` as TimeFilter, label: `${yr}` }))]
    }
    if (mode === 'month') {
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
  }, [mode, hasPicker, periods])

  // Measure the active button so the pill can sit exactly over it.
  useLayoutEffect(() => {
    const btn = btnRefs.current[activeIndex]
    if (btn) setPos({ left: btn.offsetLeft, top: btn.offsetTop, width: btn.offsetWidth, height: btn.offsetHeight })
  }, [activeIndex, value])

  useEffect(() => {
    const reposition = () => {
      const btn = btnRefs.current[activeIndex]
      if (btn) setPos({ left: btn.offsetLeft, top: btn.offsetTop, width: btn.offsetWidth, height: btn.offsetHeight })
    }
    window.addEventListener('resize', reposition)
    return () => window.removeEventListener('resize', reposition)
  }, [activeIndex])

  // Close on outside tap.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // Scroll the open list to the selected period (else to the newest, at bottom).
  useEffect(() => {
    if (!open) return
    const el = listRef.current
    if (!el) return
    const active = el.querySelector('[data-active="true"]') as HTMLElement | null
    if (active) active.scrollIntoView({ block: 'nearest' })
    else el.scrollTop = el.scrollHeight
  }, [open, options.length])

  function clickMode(m: Mode) {
    if (m === mode) { if (hasPicker) setOpen(o => !o); return }   // re-tap active → toggle
    onChange(m)                       // switch mode (current period) …
    setOpen(m !== 'all')              // … and open its picker (none for "Alles")
  }

  function selectPeriod(v: TimeFilter) {
    onChange(v)
    setOpen(false)                    // collapse once a period is chosen
  }

  return (
    <div className="px-4">
      <div ref={barRef} className="relative flex rounded-pill bg-white/5 border border-white/8 p-1 gap-0.5">
        {MODES.map((opt, i) => (
          <button
            key={opt.value}
            ref={el => { btnRefs.current[i] = el }}
            onClick={() => clickMode(opt.value)}
            className="relative flex-1 py-1.5 text-xs font-medium rounded-pill z-10"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            {/* active label is rendered by the pill on top, so hide it here */}
            <span style={{ opacity: mode === opt.value ? 0 : 1 }}>{opt.label}</span>
          </button>
        ))}

        {/* The active pill itself — slides between modes and expands downward
            to hold the period options (no separate dropdown element). */}
        <motion.div
          className="absolute z-20 overflow-hidden bg-linear-to-r from-purple-600/80 to-blue-600/80 border border-purple-500/40 shadow-lg shadow-black/30"
          initial={false}
          animate={{ left: pos.left, top: pos.top, width: pos.width, borderRadius: open ? 14 : 9999 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        >
          <button
            onClick={() => hasPicker && setOpen(o => !o)}
            className="flex w-full items-center justify-center text-xs font-medium text-white"
            style={{ height: pos.height }}
          >
            {MODES[activeIndex].label}
          </button>

          <AnimatePresence initial={false}>
            {open && hasPicker && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                className="overflow-hidden"
              >
                <div ref={listRef} className="max-h-44 overflow-y-auto border-t border-white/20 pb-1">
                  {options.map(opt => {
                    const active = value === opt.value
                    return (
                      <button
                        key={String(opt.value)}
                        data-active={active}
                        onClick={() => selectPeriod(opt.value)}
                        className={`block w-full text-center px-2 py-1.5 text-xs font-medium transition-colors ${
                          active ? 'bg-white/25 text-white' : 'text-white/80 hover:bg-white/12'
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
        </motion.div>
      </div>
    </div>
  )
}
