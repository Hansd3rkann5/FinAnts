import { useRef, useEffect, useMemo, useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
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
  const activeIndex = Math.max(0, MODES.findIndex(m => m.value === mode))
  const hasPicker = mode !== 'all'

  const barRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const openTimer = useRef<number | null>(null)
  const clearOpenTimer = () => {
    if (openTimer.current !== null) { clearTimeout(openTimer.current); openTimer.current = null }
  }

  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ left: 0, top: 0, width: 0, height: 0 })   // pill over active button (within bar)
  const [anchor, setAnchor] = useState({ left: 0, top: 0, width: 0 })        // portal panel (viewport coords)

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

  // Pill geometry within the bar.
  useLayoutEffect(() => {
    const btn = btnRefs.current[activeIndex]
    if (btn) setPos({ left: btn.offsetLeft, top: btn.offsetTop, width: btn.offsetWidth, height: btn.offsetHeight })
  }, [activeIndex, value])

  // Portal panel anchor — viewport rect of the active button, measured while open.
  useLayoutEffect(() => {
    if (!open) return
    const btn = btnRefs.current[activeIndex]
    if (btn) {
      const r = btn.getBoundingClientRect()
      setAnchor({ left: r.left, top: r.bottom + 6, width: r.width })
    }
  }, [open, activeIndex, pos])

  useEffect(() => {
    const reposition = () => {
      const btn = btnRefs.current[activeIndex]
      if (btn) setPos({ left: btn.offsetLeft, top: btn.offsetTop, width: btn.offsetWidth, height: btn.offsetHeight })
    }
    window.addEventListener('resize', reposition)
    return () => window.removeEventListener('resize', reposition)
  }, [activeIndex])

  // Close on outside tap (the panel lives in a portal, so exclude it too).
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!barRef.current?.contains(t) && !panelRef.current?.contains(t)) { clearOpenTimer(); setOpen(false) }
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
    clearOpenTimer()
    if (m === mode) { if (hasPicker) setOpen(o => !o); return }   // re-tap active → toggle instantly
    setOpen(false)                    // close any open dropdown before the pill slides
    onChange(m)                       // switch mode — the indicator pill slides over ~0.22s
    if (m !== 'all') {
      // open the picker only after the pill has finished moving to the new mode
      openTimer.current = window.setTimeout(() => setOpen(true), 240)
    }
  }

  function selectPeriod(v: TimeFilter) {
    clearOpenTimer()
    onChange(v)
    setOpen(false)
  }

  // Clear any pending delayed-open on unmount.
  useEffect(() => () => clearOpenTimer(), [])

  return (
    <div id={`tf-${id}`} className="px-4">
      <div id={`tf-bar-${id}`} ref={barRef} className="relative flex rounded-pill bg-white/5 border border-white/8 p-1 gap-0.5">
        {MODES.map((opt, i) => (
          <button
            key={opt.value}
            id={`tf-mode-${opt.value}-${id}`}
            ref={el => { btnRefs.current[i] = el }}
            onClick={() => clickMode(opt.value)}
            className="relative flex-1 py-1.5 text-xs font-medium rounded-pill z-10"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            {/* active label is rendered by the pill on top, so hide it here */}
            <span style={{ opacity: mode === opt.value ? 0 : 1 }}>{opt.label}</span>
          </button>
        ))}

        {/* Active mode highlight pill (slides between modes). */}
        <motion.div
          id={`tf-pill-${id}`}
          className="absolute z-20 overflow-hidden bg-linear-to-r from-purple-600/75 to-blue-600/75 border border-purple-500/40 shadow-lg shadow-black/30"
          style={{ borderRadius: 20, backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)' }}
          initial={false}
          animate={{ left: pos.left, top: pos.top - 1, width: pos.width }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        >
          <button
            id={`tf-pill-label-${id}`}
            onClick={() => hasPicker && setOpen(o => !o)}
            className="flex w-full items-center justify-center text-xs font-medium text-white"
            style={{ height: pos.height }}
          >
            {MODES[activeIndex].label}
          </button>
        </motion.div>
      </div>

      {/* Period dropdown — portalled to body so its backdrop-filter blurs the
          page content behind it (it'd be clipped inside the blurred header). */}
      {createPortal(
        <AnimatePresence>
          {open && hasPicker && options.length > 0 && (
            <motion.div
              ref={panelRef}
              id={`tf-options-${id}`}
              initial={{ opacity: 0, height: 0, y: -4 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="fixed z-120 overflow-hidden rounded-card border border-purple-500/40 bg-linear-to-r from-purple-600/55 to-blue-600/55 shadow-xl shadow-black/40"
              style={{
                left: anchor.left, top: anchor.top, width: anchor.width,
                transformOrigin: 'top',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
              }}
            >
              <div ref={listRef} className="max-h-44 overflow-y-auto py-1">
                {options.map(opt => {
                  const active = value === opt.value
                  return (
                    <button
                      key={String(opt.value)}
                      id={`tf-opt-${String(opt.value).replace(/\//g, '-')}-${id}`}
                      data-active={active}
                      onClick={() => selectPeriod(opt.value)}
                      className={`block w-full text-center px-2 py-1.5 text-xs font-medium transition-colors ${
                        active ? 'bg-white/30 text-white' : 'text-white/85 hover:bg-white/15'
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
