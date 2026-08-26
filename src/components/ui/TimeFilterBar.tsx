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

// Every period for a given mode, newest first. Pulled out of the component so
// clickMode can look up the *target* mode's options (before `mode` itself has
// switched) to immediately select its current period, not just the generic mode.
function periodOptionsFor(m: Mode, periods?: AvailablePeriods): { value: TimeFilter; label: string }[] {
  if (m === 'all' || !periods) return []
  if (m === 'year') {
    return periods.years.map(yr => ({ value: `year/${yr}` as TimeFilter, label: `${yr}` })).reverse()
  }
  if (m === 'month') {
    return periods.months.map(({ year, month }) => ({
      value: `month/${year}/${month}` as TimeFilter,
      label: format(new Date(year, month - 1, 1), "MMM ''yy", { locale: de }),
    })).reverse()
  }
  const multiYear = new Set(periods.weeks.map(w => w.year)).size > 1
  return periods.weeks.map(({ year, week }) => ({
    value: `week/${year}/${week}` as TimeFilter,
    label: multiYear ? `KW ${week} '${String(year).slice(2)}` : `KW ${week}`,
  })).reverse()
}

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
  // A specific period (e.g. 'year/2026') is currently selected for the active
  // mode, rather than the bare generic mode — this is what makes the pill
  // show "2026" instead of "Jahr".
  const hasOverride = hasPicker && value !== mode

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
  // Direction for the pill label's vertical swap: 'up' when picking a period
  // (old label exits the top, new one enters from below — see selectPeriod),
  // 'down' when resetting to a generic mode (the mirror image — see clickMode).
  const [direction, setDirection] = useState<'up' | 'down'>('up')

  // Newest first. Every period for the current mode, regardless of whether
  // it's the one currently selected — `options` below removes that one for
  // the dropdown list, since it's already shown as the pill label.
  const allOptions = useMemo(
    () => (hasPicker ? periodOptionsFor(mode as Mode, periods) : []),
    [mode, hasPicker, periods],
  )

  // The dropdown only ever offers periods other than the one already active —
  // picking one replaces the pill's current override, so showing it again in
  // the list would be redundant. Switching away (clickMode) or picking a
  // different period both implicitly return the old value to this list.
  const options = useMemo(
    () => allOptions.filter(o => o.value !== value),
    [allOptions, value],
  )

  const activeOverrideLabel = hasOverride ? allOptions.find(o => o.value === value)?.label : undefined
  const pillLabel = activeOverrideLabel ?? MODES[activeIndex].label

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

  // The active period is never in the list (see `options` above), so there's
  // no "selected" row to scroll to — just open at the newest, now at top.
  useEffect(() => {
    if (!open) return
    const el = listRef.current
    if (el) el.scrollTop = 0
  }, [open])

  function clickMode(m: Mode) {
    clearOpenTimer()
    if (m === mode) { if (hasPicker) setOpen(o => !o); return }   // re-tap active → toggle instantly
    setOpen(false)                    // close any open dropdown before the pill slides
    setDirection('down')              // switching mode always resets any override → label slides down
    // Jump straight to the current period for the new mode (e.g. clicking
    // "Monat" selects this month directly, label shows "Jun '26" right away)
    // instead of the generic mode — that's what "Aktuell" used to mean anyway.
    const current = m !== 'all' ? periodOptionsFor(m, periods)[0]?.value : undefined
    onChange(current ?? m)            // switch mode — the indicator pill slides over ~0.22s
    if (m !== 'all') {
      // open the picker only after the pill has finished moving to the new mode
      openTimer.current = window.setTimeout(() => setOpen(true), 240)
    }
  }

  function selectPeriod(v: TimeFilter) {
    clearOpenTimer()
    setDirection('up')                // picking a period always sets an override → label slides up
    onChange(v)
    setOpen(false)
  }

  // Clear any pending delayed-open on unmount.
  useEffect(() => () => clearOpenTimer(), [])

  return (
    <div id={`tf-${id}`}>
      <div id={`tf-bar-${id}`} ref={barRef} className="relative flex rounded-pill bg-white/5 border border-white/8 p-1 gap-0.5"
      style={{backdropFilter: 'blur(5px)'}}
      >
        {MODES.map((opt, i) => (
          <button
            key={opt.value}
            id={`tf-mode-${opt.value}-${id}`}
            ref={el => { btnRefs.current[i] = el }}
            onClick={() => clickMode(opt.value)}
            className="relative flex-1 py-1.5 text-xs font-medium rounded-pill z-10"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            {/* The pill on top renders the active label, so this copy is just
                hidden (not removed — it still reserves the button's layout
                space). Keep its text in sync with the pill (generic label, or
                the picked period once there's an override) so the two never
                disagree, e.g. mid-slide-transition. */}
            <span style={{ opacity: mode === opt.value ? 0 : 1 }}>
              {mode === opt.value ? pillLabel : opt.label}
            </span>
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
            className="relative flex w-full items-center justify-center overflow-hidden"
            style={{ height: pos.height }}
          >
            {/* Vertical swap between the generic mode label ("Jahr") and a
                picked period ("2026") — up when selecting, down when a mode
                switch resets back to generic (see clickMode/selectPeriod). */}
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={pillLabel}
                initial={{ y: direction === 'up' ? 16 : -16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: direction === 'up' ? -16 : 16, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white"
              >
                {pillLabel}
              </motion.span>
            </AnimatePresence>
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
                {/* The currently active period is never in this list (see
                    `options`) — it's already shown as the pill label — so
                    there's no "active" row to highlight here anymore. */}
                {options.map(opt => (
                  <button
                    key={String(opt.value)}
                    id={`tf-opt-${String(opt.value).replace(/\//g, '-')}-${id}`}
                    onClick={() => selectPeriod(opt.value)}
                    className="block w-full text-center px-2 py-1.5 text-xs font-medium text-white/85 hover:bg-white/15 transition-colors"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
