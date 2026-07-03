import { useState, useRef, useMemo } from 'react'
import { useInView } from 'framer-motion'
import { useAppUnlocked } from '@/hooks/useAppUnlocked'
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { LineChart as LineChartIcon } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { useDepotHistory } from '@/hooks/useDepotHistory'
import { getNiceTicks, StickyYAxis } from './chartUtils'
import { formatEur } from '@/utils/format'


const RANGE_OPTIONS = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1J', days: 365 },
  { label: '5J', days: 1825 },
]

const H = 150
const MARGIN_TOP = 8
const X_AXIS_H = 20

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

// Shown on the Dashboard once the Trade Republic account is toggled on —
// cumulative depot value, or drill into a single holding, over a selectable
// range. Reconstructed from stored trades + Yahoo historical prices, see
// useDepotHistory/worker/src/traderepublic/depotHistory.ts.
export function DepotChart() {
  const [days, setDays] = useState(180)
  const [selectedIsin, setSelectedIsin] = useState<string | null>(null)
  const { data, loading, error } = useDepotHistory(days)

  const containerRef = useRef<HTMLDivElement>(null)
  const unlocked = useAppUnlocked()
  const inViewRaw = useInView(containerRef, { once: true, amount: 0.3 })
  // Hold the entry animation while the lock screen is up — Recharts animates
  // on the main thread and starves the PIN keypad of input events.
  const inView = inViewRaw && unlocked

  const selectedStock = data?.perStock.find(s => s.isin === selectedIsin)
  const points = (selectedStock?.points ?? data?.cumulative ?? []).map(p => ({
    date: p.date,
    label: new Date(p.date + 'T00:00:00').toLocaleDateString('de-DE', { month: 'short' }).replace('.', ''),
    value: p.value,
  }))

  const maxVal = useMemo(() => Math.max(...points.map(p => p.value), 0), [points])
  const ticks = getNiceTicks(maxVal)
  const yMax = ticks[ticks.length - 1] || 1

  return (
    <GlassCard id="card-depot-chart" glow="purple" className="mx-4">
      <div className="flex items-center gap-2 mb-3">
        <LineChartIcon size={14} className="text-purple-400" />
        <h2 className="text-sm font-semibold text-white/70 flex-1 min-w-0 truncate">Depot-Verlauf</h2>
        <div className="flex gap-1">
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.days}
              onClick={() => setDays(opt.days)}
              className="px-1.5 py-0.5 rounded-pill text-[10px] font-medium transition-colors"
              style={{
                backgroundColor: days === opt.days ? 'rgba(var(--acc-rgb),0.2)' : 'rgba(255,255,255,0.04)',
                color: days === opt.days ? 'var(--acc-soft)' : 'rgba(255,255,255,0.4)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

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
              <LineChart data={points} margin={{ top: MARGIN_TOP, right: 8, left: 0, bottom: 0 }}>
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
                  isAnimationActive={inView} animationDuration={300}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </GlassCard>
  )
}
