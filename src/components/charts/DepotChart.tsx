import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppUnlocked } from '@/hooks/useAppUnlocked'
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { LineChart as LineChartIcon, TrendingUp, TrendingDown, ChevronDown } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { ChartHeader } from '@/components/ui/ChartHeader'
import { useDepotHistory } from '@/hooks/useDepotHistory'
import { useChartFilter } from '@/hooks/useChartFilter'
import { getFilterDateRange, type AvailablePeriods } from '@/utils/chartCompute'
import type { TimeFilter } from '@/types'
import type { DepotHistoryPoint, DepotPosition } from '@/utils/depotHistory'
import { getNiceBounds, StickyYAxis } from './chartUtils'
import { formatEur } from '@/utils/format'

const LOOKBACK_DAYS = 1825
const H = 140
const MARGIN_TOP = 8
const X_AXIS_H = 20

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

function buildPoints(raw: DepotHistoryPoint[], effectiveFilter: TimeFilter) {
  const { start, end } = getFilterDateRange(effectiveFilter)
  const windowed = effectiveFilter === 'all'
    ? raw
    : raw.filter(p => { const d = new Date(p.date + 'T00:00:00'); return d >= start && d <= end })
  const spanDays = windowed.length >= 2
    ? (new Date(windowed[windowed.length - 1].date).getTime() - new Date(windowed[0].date).getTime()) / 86_400_000
    : 0
  const dayLevel = spanDays <= 92
  return windowed.map(p => ({ date: p.date, label: labelForDate(p.date, dayLevel), value: p.value }))
}

interface ItemProps {
  itemKey: string
  isOpen: boolean
  onToggle: () => void
  onTogglePct: () => void
  label: string
  isin?: string
  shares?: number
  currentValue: number
  pnl: number
  pnlPct: number
  showPct: boolean
  rawPoints: DepotHistoryPoint[]
  effectiveFilter: TimeFilter
  unlocked: boolean
}

function AccordionItem({
  itemKey, isOpen, onToggle, onTogglePct,
  label, isin, shares,
  currentValue, pnl, pnlPct, showPct,
  rawPoints, effectiveFilter, unlocked,
}: ItemProps) {
  const positive = pnl >= 0

  const points = useMemo(
    () => buildPoints(rawPoints, effectiveFilter),
    [rawPoints, effectiveFilter],
  )

  const { ticks, min: yMin, max: yMax } = useMemo(() => {
    const vals = points.map(p => p.value)
    if (!vals.length) return { ticks: [0], min: 0, max: 1 }
    return getNiceBounds(Math.min(...vals), Math.max(...vals))
  }, [points])

  return (
    <div className="border-b border-white/6 last:border-0">
      <div className="flex items-center gap-2">
        {/* Left — toggle accordion */}
        <button
          onClick={onToggle}
          className="flex-1 min-w-0 flex items-center gap-2 py-3 text-left"
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white/80 truncate">{label}</p>
            {isin && shares !== undefined && (
              <p className="text-[9px] text-white/25 font-mono mt-0.5">
                {isin} · {shares.toLocaleString('de-DE', { maximumFractionDigits: 6 })} Stk
              </p>
            )}
          </div>
        </button>

        {/* Right — toggle % ↔ € */}
        <button
          onClick={onTogglePct}
          className="text-right shrink-0 py-3 pl-2"
        >
          <p className="text-xs text-white/80">{formatEur(currentValue, 2)}</p>
          <p className={`text-[10px] font-medium mt-0.5 flex items-center justify-end gap-0.5 ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
            {positive ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
            {showPct
              ? `${positive ? '+' : ''}${pnlPct.toFixed(2)} %`
              : `${positive ? '+' : ''}${formatEur(pnl, 2)}`}
          </p>
        </button>
        <motion.span
          animate={{ rotate: isOpen ? 0 : -90 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="text-white/30 shrink-0"
        >
          <ChevronDown size={14} />
        </motion.span>
      </div>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key={`chart-${itemKey}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="pb-4">
              {points.length === 0 ? (
                <p className="text-xs text-white/25 text-center py-6">Keine Daten im Zeitraum</p>
              ) : (
                <div className="flex items-start">
                  <StickyYAxis ticks={ticks} yMin={yMin} yMax={yMax} height={H} marginTop={MARGIN_TOP} xAxisHeight={X_AXIS_H} />
                  <div key={`${itemKey}|${effectiveFilter}`} className="flex-1 min-w-0">
                    <ResponsiveContainer width="100%" height={H}>
                      <LineChart data={points} margin={{ top: MARGIN_TOP, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis
                          dataKey="label"
                          height={X_AXIS_H}
                          padding={{ left: 20, right: 12 }}
                          tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }}
                          axisLine={false}
                          tickLine={false}
                          interval={Math.max(0, Math.floor(points.length / 6))}
                        />
                        <YAxis domain={[yMin, yMax]} hide />
                        <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
                        <Line
                          dataKey="value" stroke="#c084fc" strokeWidth={2} dot={false}
                          activeDot={{ r: 3, fill: '#c084fc', strokeWidth: 0 }}
                          isAnimationActive={unlocked} animationDuration={550} animationEasing="ease-out"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface Props {
  globalFilter: TimeFilter
  periods: AvailablePeriods
}

export function DepotChart({ globalFilter, periods }: Props) {
  const { synced, effectiveFilter, setFilter, toggleSync } = useChartFilter(globalFilter)
  const [openKey, setOpenKey] = useState<string>('total')
  const [showPct, setShowPct] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const { data, loading, error, lastFetched } = useDepotHistory(LOOKBACK_DAYS)
  const unlocked = useAppUnlocked()

  function toggle(key: string) {
    setOpenKey(prev => prev === key ? '' : key)
  }

  const totalCost = data?.positions.reduce((s, p) => s + p.costBasis, 0) ?? 0
  const totalVal = data?.positions.reduce((s, p) => s + p.currentValue, 0) ?? 0
  const totalPnl = totalVal - totalCost
  const totalPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0

  const positionsByIsin = useMemo(() => {
    const map = new Map<string, DepotPosition>()
    for (const p of data?.positions ?? []) map.set(p.isin, p)
    return map
  }, [data?.positions])

  return (
    <GlassCard id="card-depot-chart" glow="purple">
      <ChartHeader
        chartId="depot"
        icon={<LineChartIcon size={14} className="text-purple-400" />}
        title="Depot-Verlauf"
        synced={synced}
        effectiveFilter={effectiveFilter}
        onSyncToggle={toggleSync}
        onFilterChange={setFilter}
        periods={periods}
        collapsible
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(c => !c)}
        extra={lastFetched && (
          <span className="text-[9px] text-white/25 shrink-0 tabular-nums">
            {lastFetched.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      />

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="depot-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            {loading && !data ? (
              <div className="flex items-center justify-center py-10 text-xs text-white/30">Lädt…</div>
            ) : error ? (
              <div className="flex items-center justify-center py-10 text-xs text-red-400/70">{error}</div>
            ) : (
              <>
                {/* Gesamt */}
                <AccordionItem
                  itemKey="total"
                  isOpen={openKey === 'total'}
                  onToggle={() => toggle('total')}
                  onTogglePct={() => setShowPct(p => !p)}
                  label="Depot Gesamt"
                  currentValue={totalVal}
                  pnl={totalPnl}
                  pnlPct={totalPct}
                  showPct={showPct}
                  rawPoints={data?.cumulative ?? []}
                  effectiveFilter={effectiveFilter}
                  unlocked={unlocked}
                />

                {/* Per-position */}
                {data?.perStock.map(stock => {
                  const pos = positionsByIsin.get(stock.isin)
                  if (!pos) return null
                  return (
                    <AccordionItem
                      key={stock.isin}
                      itemKey={stock.isin}
                      isOpen={openKey === stock.isin}
                      onToggle={() => toggle(stock.isin)}
                      onTogglePct={() => setShowPct(p => !p)}
                      label={pos.name}
                      isin={pos.isin}
                      shares={pos.shares}
                      currentValue={pos.currentValue}
                      pnl={pos.pnl}
                      pnlPct={pos.pnlPct}
                      showPct={showPct}
                      rawPoints={stock.points}
                      effectiveFilter={effectiveFilter}
                      unlocked={unlocked}
                    />
                  )
                })}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  )
}
