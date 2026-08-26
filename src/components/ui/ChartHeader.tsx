import { useState, useMemo, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { SlidersHorizontal, Link2, Check, ChevronDown } from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import type { TimeFilter } from '@/types'
import { getFilterMode } from '@/utils/chartCompute'
import type { AvailablePeriods } from '@/utils/chartCompute'

const MODE_OPTIONS: { value: 'week' | 'month' | 'year' | 'all'; label: string }[] = [
  { value: 'week',  label: 'Woche' },
  { value: 'month', label: 'Monat' },
  { value: 'year',  label: 'Jahr'  },
  { value: 'all',   label: 'Alles' },
]

function filterBadgeLabel(f: TimeFilter): string {
  const mode = getFilterMode(f)
  if (f === mode) return MODE_OPTIONS.find(o => o.value === mode)?.label ?? ''
  const parts = f.split('/')
  if (parts[0] === 'year')  return parts[1]
  if (parts[0] === 'month') return format(new Date(+parts[1], +parts[2] - 1, 1), "MMM ''yy", { locale: de })
  if (parts[0] === 'week')  return `KW ${parts[2]}`
  return f
}

interface Props {
  icon: React.ReactNode
  title: string
  synced: boolean
  effectiveFilter: TimeFilter
  onSyncToggle: () => void
  onFilterChange: (f: TimeFilter) => void
  extra?: React.ReactNode
  periods?: AvailablePeriods
  chartId?: string
  /** When set, the title becomes a button that toggles the panel body and shows
      a rotating chevron. */
  collapsible?: boolean
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export function ChartHeader({
  icon, title, synced, effectiveFilter,
  onSyncToggle, onFilterChange, extra, periods, chartId,
  collapsible, collapsed, onToggleCollapse,
}: Props) {
  const [open, setOpen] = useState(false)
  const mode = getFilterMode(effectiveFilter)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState({ right: 0, top: 0 })

  // Anchor the portalled dropdown under the settings button (right-aligned).
  useLayoutEffect(() => {
    if (!open) return
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setAnchor({ right: window.innerWidth - r.right, top: r.bottom + 6 })
  }, [open])

  // Specific period chips — most recent first
  const specificChips = useMemo((): { value: TimeFilter; label: string }[] => {
    if (!periods) return []
    if (mode === 'year') {
      return [...periods.years].reverse().map(yr => ({
        value: `year/${yr}` as TimeFilter,
        label: `${yr}`,
      }))
    }
    if (mode === 'month') {
      return [...periods.months].reverse().map(({ year, month }) => ({
        value: `month/${year}/${month}` as TimeFilter,
        label: format(new Date(year, month - 1, 1), "MMM ''yy", { locale: de }),
      }))
    }
    if (mode === 'week') {
      const multiYear = new Set(periods.weeks.map(w => w.year)).size > 1
      return [...periods.weeks].reverse().map(({ year, week }) => ({
        value: `week/${year}/${week}` as TimeFilter,
        label: multiYear ? `KW ${week} '${String(year).slice(2)}` : `KW ${week}`,
      }))
    }
    return []
  }, [mode, periods])

  const hasRight = specificChips.length > 0

  // Switching mode keeps the dropdown open; selecting a period closes it
  function selectMode(m: 'week' | 'month' | 'year' | 'all') { onFilterChange(m) }
  function selectPeriod(f: TimeFilter) { onFilterChange(f); setOpen(false) }

  return (
    <div id={chartId ? `chart-${chartId}-header` : undefined} className="flex items-center gap-1.5 mb-4">
      {icon}
      {collapsible ? (
        <button
          id={chartId ? `btn-${chartId}-collapse` : undefined}
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          className="flex items-center gap-1 flex-1 min-w-0 group -my-1 py-1"
        >
          <h2 id={chartId ? `chart-${chartId}-title` : undefined} className="text-sm font-semibold text-white/70 group-hover:text-white/90 min-w-0 truncate transition-colors">{title}</h2>
          <motion.span
            animate={{ rotate: collapsed ? 0 : 180 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="text-white/35 group-hover:text-white/70 shrink-0 transition-colors"
          >
            <ChevronDown size={14} />
          </motion.span>
        </button>
      ) : (
        <h2 id={chartId ? `chart-${chartId}-title` : undefined} className="text-sm font-semibold text-white/70 flex-1 min-w-0 truncate">{title}</h2>
      )}

      {!synced && (
        <span id={chartId ? `badge-${chartId}-filter` : undefined} className="h-6 flex items-center text-[9px] text-white/35 bg-white/5 border border-white/8 px-1.5 rounded-full shrink-0">
          {filterBadgeLabel(effectiveFilter)}
        </span>
      )}

      {extra}

      {/* Settings dropdown */}
      <div id={chartId ? `chart-${chartId}-settings-wrapper` : undefined} className="relative shrink-0">
        <button
          id={chartId ? `btn-${chartId}-settings` : undefined}
          ref={btnRef}
          onClick={() => setOpen(v => !v)}
          aria-label="Zeitraum wählen"
          className={`w-6 h-6 flex items-center justify-center rounded-full transition-colors ${
            open
              ? 'text-white/70 bg-white/10'
              : 'text-white/30 hover:text-white/60 hover:bg-white/5'
          }`}
        >
          <SlidersHorizontal size={11} />
        </button>

        {createPortal(
          <AnimatePresence>
          {open && (
            <>
              <div className="fixed inset-0 z-100" onClick={() => setOpen(false)} />

              {/* Dropdown — portalled to body (so its backdrop-filter isn't
                  no-op'd by the GlassCard's own backdrop-filter), anchored under
                  the settings button and expanding leftward. */}
              <motion.div
                id={chartId ? `dropdown-${chartId}` : undefined}
                initial={{ opacity: 0, scale: 0.88, y: -4 }}
                animate={{ opacity: 1, scale: 1,   y:  0 }}
                exit={{    opacity: 0, scale: 0.88, y: -4 }}
                transition={{ duration: 0.14, ease: [0.4, 0, 0.2, 1] }}
                style={{
                  transformOrigin: 'top right',
                  backgroundColor: 'rgba(39, 0, 105, 0.59)',
                  right: anchor.right, top: anchor.top,
                  backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                }}
                className="fixed z-110 border border-white/10 rounded-xl shadow-xl overflow-hidden"
              >
                <div className="flex h-30">
                  {/* Left column: period picker — slides in/out, constrained to mode column height */}
                  <AnimatePresence>
                    {hasRight && (
                      <motion.div
                        id={chartId ? `dropdown-${chartId}-periods` : undefined}
                        key="period-col"
                        initial={{ maxWidth: 0, opacity: 0 }}
                        animate={{ maxWidth: 120, opacity: 1 }}
                        exit={{ maxWidth: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        className="h-full border-r border-white/8 overflow-hidden"
                        style={{ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}
                      >
                        <div className="flex flex-col py-1 h-full overflow-y-auto" style={{ minWidth: 88 }}>
                          {specificChips.map((chip, i) => {
                            // The first chip is the current period — also highlight it when
                            // effectiveFilter is still the generic mode (e.g. "year"), same as
                            // the old separate "Aktuell" row used to.
                            const isActive = effectiveFilter === chip.value || (i === 0 && effectiveFilter === mode)
                            return (
                              <button
                                id={chartId ? `dropdown-${chartId}-period-${String(chip.value).replace(/\//g, '-')}` : undefined}
                                key={String(chip.value)}
                                onClick={() => selectPeriod(chip.value)}
                                className={`w-full px-3 py-1.5 text-xs flex items-center justify-between gap-3 transition-colors ${
                                  isActive
                                    ? 'text-purple-300 bg-purple-500/15'
                                    : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                                }`}
                              >
                                {chip.label}
                                {isActive && <Check size={9} className="shrink-0" />}
                              </button>
                            )
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Right column: mode selector — fixed width, always anchored at right-0 */}
                  <div
                    id={chartId ? `dropdown-${chartId}-modes` : undefined}
                    className="flex flex-col py-1 w-24 shrink-0"
                    style={{ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}
                  >
                    {MODE_OPTIONS.map(opt => (
                      <button
                        id={chartId ? `dropdown-${chartId}-mode-${opt.value}` : undefined}
                        key={opt.value}
                        onClick={() => selectMode(opt.value)}
                        className={`w-full px-3 py-1.5 text-xs flex items-center justify-between transition-colors ${
                          mode === opt.value
                            ? 'text-purple-300 bg-purple-500/15'
                            : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                        }`}
                      >
                        {opt.label}
                        {mode === opt.value && <Check size={9} className="shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            </>
          )}
          </AnimatePresence>,
          document.body,
        )}
      </div>

      {/* Sync toggle */}
      <button
        id={chartId ? `btn-${chartId}-sync` : undefined}
        onClick={onSyncToggle}
        aria-label={synced ? 'Vom globalen Filter trennen' : 'Mit globalem Filter verknüpfen'}
        title={synced ? 'Vom globalen Filter trennen' : 'Mit globalem Filter verknüpfen'}
        className={`w-6 h-6 flex items-center justify-center rounded-full shrink-0 transition-all ${
          synced
            ? 'text-purple-400 bg-purple-500/15'
            : 'text-white/25 hover:text-white/60 hover:bg-white/5'
        }`}
      >
        <Link2 size={11} />
      </button>
    </div>
  )
}
