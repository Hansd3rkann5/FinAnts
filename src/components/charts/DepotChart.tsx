import { useState, useRef, useMemo } from 'react'
import { useInView } from 'framer-motion'
import { useAppUnlocked } from '@/hooks/useAppUnlocked'
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { LineChart as LineChartIcon, TrendingUp, TrendingDown } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { ChartHeader } from '@/components/ui/ChartHeader'
import { useDepotHistory } from '@/hooks/useDepotHistory'
import { useChartFilter } from '@/hooks/useChartFilter'
import { getFilterDateRange, type AvailablePeriods } from '@/utils/chartCompute'
import type { TimeFilter } from '@/types'
import { getNiceTicks, StickyYAxis } from './chartUtils'
import { formatEur } from '@/utils/format'
import type { DepotPosition } from '@/utils/depotHistory'

// The reconstructed history goes back only as far as the oldest trade, so
// fetching a generous window once (and filtering client-side per TimeFilter)
// is cheaper and snappier than re-hitting the worker on every range change.
const LOOKBACK_DAYS = 1825

const H = 150
const MARGIN_TOP = 8
const X_AXIS_H = 20

// Below ~3 months the month-only label collapses every tick to "Aug"; show the
// day too so the axis is actually readable. Longer spans stay month + year.
function labelForDate(date: string, dayLevel: boolean): string {
  const d = new Date(date + 'T00:00:00')
  return dayLevel
    ? d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
    : d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }).replace('.', '')
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const pt = payload[0].payload
  const dateStr = new Date(pt.date + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' })
  return (
    <div className="bg-[#12122a]/95 backdrop-blur border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-white/40 mb-1">{dateStr}</p>
      <p className="text-purple-300 font-medium">{formatEur(payload[0].value, 2)}</p>
    </div>
  )
}

function PositionRow({ pos, showPct }: { pos: DepotPosition; showPct: boolean }) {
  const positive = pos.pnl >= 0
  return (
    <div className="flex items-center gap-2 py-2.5 border-b border-white/5 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/80 font-medium truncate">{pos.name}</p>
        <p className="text-[10px] text-white/30 font-mono mt-0.5">{pos.isin} · {pos.shares.toLocaleString('de-DE', { maximumFractionDigits: 6 })} Stk</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs text-white/80">{formatEur(pos.currentValue, 2)}</p>
        <p className={`text-[10px] font-medium mt-0.5 flex items-center justify-end gap-0.5 ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
          {positive ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
          {showPct
            ? `${positive ? '+' : ''}${pos.pnlPct.toFixed(2)} %`
            : `${positive ? '+' : ''}${formatEur(pos.pnl, 2)}`}
        </p>
      </div>
    </div>
  )
}

interface Props {
  globalFilter: TimeFilter
  periods: AvailablePeriods
}

// Shown on the Dashboard once the Trade Republic account is toggled on —
// cumulative depot value, or drill into a single holding. Uses the same
// ChartHeader as every other panel: linked to the global time filter by
// default, unlink to pick its own range. Reconstructed from stored trades +
// Yahoo historical prices, see worker/src/traderepublic/depotHistory.ts.
export function DepotChart({ globalFilter, periods }: Props) {
  const { synced, effectiveFilter, setFilter, toggleSync } = useChartFilter(globalFilter)
  const [selectedIsin, setSelectedIsin] = useState<string | null>(null)
  const [showPct, setShowPct] = useState(true)
  const { data, loading, error } = useDepotHistory(LOOKBACK_DAYS)

  const containerRef = useRef<HTMLDivElement>(null)
  const unlocked = useAppUnlocked()
  const inViewRaw = useInView(containerRef, { once: true, amount: 0.3 })
  // Hold the entry animation while the lock screen is up — Recharts animates
  // on the main thread and starves the PIN keypad of input events.
  const inView = inViewRaw && unlocked

  const selectedStock = data?.perStock.find(s => s.isin === selectedIsin)

  const points = useMemo(() => {
    const raw = selectedStock?.points ?? data?.cumulative ?? []
    const { start, end } = getFilterDateRange(effectiveFilter)
    const windowed = effectiveFilter === 'all'
      ? raw
      : raw.filter(p => {
          const d = new Date(p.date + 'T00:00:00')
          return d >= start && d <= end
        })
    const spanDays = windowed.length >= 2
      ? (new Date(windowed[windowed.length - 1].date).getTime() - new Date(windowed[0].date).getTime()) / 86_400_000
      : 0
    const dayLevel = spanDays <= 92
    return windowed.map(p => ({ date: p.date, label: labelForDate(p.date, dayLevel), value: p.value }))
  }, [selectedStock, data?.cumulative, effectiveFilter])

  const maxVal = useMemo(() => Math.max(...points.map(p => p.value), 0), [points])
  const ticks = getNiceTicks(maxVal)
  const yMax = ticks[ticks.length - 1] || 1

  // Remount the chart whenever the shown series changes (range or selected
  // holding), so Recharts replays its left-to-right "draw" animation each time
  // instead of silently swapping the data underneath a static line.
  const animKey = `${selectedIsin ?? 'total'}|${effectiveFilter}`

  return (
    <GlassCard id="card-depot-chart" glow="purple" className="mx-4">
      <ChartHeader
        chartId="depot"
        icon={<LineChartIcon size={14} className="text-purple-400" />}
        title="Depot-Verlauf"
        synced={synced}
        effectiveFilter={effectiveFilter}
        onSyncToggle={toggleSync}
        onFilterChange={setFilter}
        periods={periods}
      />

      {(data?.perStock?.length ?? 0) > 0 && (
        <div id="depot-chart-stock-pills" className="flex flex-wrap gap-1.5 mb-3">
          <button
            onClick={() => setSelectedIsin(null)}
            className="px-2.5 py-1 rounded-pill text-xs font-medium border transition-all"
            style={{
              backgroundColor: selectedIsin === null ? 'rgba(var(--acc-rgb),0.2)' : 'rgba(255,255,255,0.04)',
              borderColor: selectedIsin === null ? 'rgba(var(--acc-rgb),0.4)' : 'rgba(255,255,255,0.08)',
              color: selectedIsin === null ? 'var(--acc-soft)' : 'rgba(255,255,255,0.5)',
            }}
          >
            Gesamt
          </button>
          {data?.perStock.map(s => (
            <button
              key={s.isin}
              onClick={() => setSelectedIsin(s.isin)}
              className="px-2.5 py-1 rounded-pill text-xs font-medium border transition-all"
              style={{
                backgroundColor: selectedIsin === s.isin ? 'rgba(var(--acc-rgb),0.2)' : 'rgba(255,255,255,0.04)',
                borderColor: selectedIsin === s.isin ? 'rgba(var(--acc-rgb),0.4)' : 'rgba(255,255,255,0.08)',
                color: selectedIsin === s.isin ? 'var(--acc-soft)' : 'rgba(255,255,255,0.5)',
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {loading && points.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-xs text-white/30">Lädt…</div>
      ) : error ? (
        <div className="flex items-center justify-center py-10 text-xs text-red-400/70">{error}</div>
      ) : points.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-xs text-white/30">Keine Daten im Zeitraum</div>
      ) : (
        <div ref={containerRef} className="flex items-start">
          <StickyYAxis ticks={ticks} yMax={yMax} height={H} marginTop={MARGIN_TOP} xAxisHeight={X_AXIS_H} />
          <div className="flex-1 min-w-0">
            <ResponsiveContainer width="100%" height={H}>
              <LineChart key={animKey} data={points} margin={{ top: MARGIN_TOP, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="label"
                  height={X_AXIS_H}
                  padding={{ left: 12, right: 12 }}
                  tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.max(0, Math.floor(points.length / 6))}
                />
                <YAxis domain={[0, yMax]} hide />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
                <Line
                  dataKey="value" stroke="#c084fc" strokeWidth={2} dot={false}
                  activeDot={{ r: 3, fill: '#c084fc', strokeWidth: 0 }}
                  isAnimationActive={inView} animationDuration={550} animationEasing="ease-out"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Positionen ── */}
      {(data?.positions?.length ?? 0) > 0 && (
        <div className="mt-4 pt-3 border-t border-white/6">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] text-white/30 uppercase tracking-wider">Positionen</p>
            <button
              onClick={() => setShowPct(p => !p)}
              className="text-[10px] px-2 py-0.5 rounded-full border border-white/15 text-white/40 hover:text-white/70 transition-colors"
            >
              {showPct ? '% → €' : '€ → %'}
            </button>
          </div>
          <div>
            {data!.positions.map(pos => (
              <PositionRow key={pos.isin} pos={pos} showPct={showPct} />
            ))}
          </div>
          {/* Summary row */}
          {(() => {
            const totalCost = data!.positions.reduce((s, p) => s + p.costBasis, 0)
            const totalVal  = data!.positions.reduce((s, p) => s + p.currentValue, 0)
            const totalPnl  = totalVal - totalCost
            const totalPct  = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0
            const pos       = totalPnl >= 0
            return (
              <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-white/8">
                <p className="text-[10px] text-white/40">Depot gesamt</p>
                <div className="text-right">
                  <p className="text-xs text-white/70 font-medium">{formatEur(totalVal, 2)}</p>
                  <p className={`text-[10px] font-medium flex items-center justify-end gap-0.5 ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
                    {pos ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                    {showPct ? `${pos ? '+' : ''}${totalPct.toFixed(2)} %` : `${pos ? '+' : ''}${formatEur(totalPnl, 2)}`}
                  </p>
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </GlassCard>
  )
}
