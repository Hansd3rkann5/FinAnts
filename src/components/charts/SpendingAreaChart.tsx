import { useRef, useEffect, useMemo } from 'react'
import { useInView } from 'framer-motion'
import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'
import type { SpendingPoint } from '@/utils/chartCompute'
import { getFilterMode } from '@/utils/chartCompute'
import type { TimeFilter } from '@/types'
import { getNiceTicks, StickyYAxis } from './chartUtils'

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

function fmtEur(v: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

function isIsoMonth(s: string) { return /^\d{4}-\d{2}$/.test(s) }
function isoToMonth(s: string) { return MONTHS[parseInt(s.slice(5, 7), 10) - 1] ?? s }
function isoToShortYear(s: string) { return `'${s.slice(2, 4)}` }

function MonthTick(props: any) {
  const { x, y, payload, yearBoundaries } = props
  if (!payload?.value) return null
  const isYearStart = yearBoundaries?.has(payload.value)
  return (
    <g transform={`translate(${x},${y})`}>
      {isYearStart && (
        <text x={0} y={-14} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize={8} fontWeight="600">
          {isoToShortYear(payload.value)}
        </text>
      )}
      <text x={0} y={4} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={10}>
        {isoToMonth(payload.value)}
      </text>
    </g>
  )
}

function ChartTooltip({ active, payload, label, monthly }: any) {
  if (!active || !payload?.length) return null
  const exp = payload.find((p: any) => p.dataKey === 'expenses')
  const inc = payload.find((p: any) => p.dataKey === 'income')
  const displayLabel = monthly && isIsoMonth(label)
    ? `${isoToMonth(label)} ${isoToShortYear(label)}`
    : label
  return (
    <div className="bg-[#12122a]/95 backdrop-blur border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-white/40 mb-1">{displayLabel}</p>
      {inc?.value > 0 && <p className="text-emerald-400">↑ {fmtEur(inc.value)}</p>}
      {exp?.value > 0 && <p className="text-red-400">↓ {fmtEur(exp.value)}</p>}
    </div>
  )
}

interface Props {
  data: SpendingPoint[]
  timeFilter: TimeFilter
}

const X_AXIS_H = 20

export function SpendingAreaChart({ data, timeFilter }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inView = useInView(containerRef, { once: true, amount: 0.3 })
  const mode = getFilterMode(timeFilter)
  const isMonthly = mode === 'year' || mode === 'all'
  const hasIncome = data.some(d => d.income > 0)

  const yearBoundaries = useMemo(() => {
    if (!isMonthly) return new Set<string>()
    return new Set(data.filter((d, i) => i > 0 && d.label.endsWith('-01')).map(d => d.label))
  }, [data, isMonthly])

  const hasYearLabels = isMonthly && yearBoundaries.size > 0
  const MARGIN_TOP = hasYearLabels ? 22 : 8
  const H = hasYearLabels ? 170 : 155

  const maxVal = Math.max(...data.map(d => Math.max(d.expenses, d.income)), 0)
  const ticks  = getNiceTicks(maxVal)
  const yMax   = ticks[ticks.length - 1] || 1

  const minWidth = isMonthly
    ? Math.max(320, data.length * 44)
    : timeFilter === 'month'
    ? Math.max(300, data.length * 18)
    : undefined

  const tickInterval = mode === 'month' ? 6 : 0

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [data])

  const TooltipEl = (props: any) => <ChartTooltip {...props} monthly={isMonthly} />

  return (
    <div ref={containerRef} id="chart-spending-area" className="flex items-start">
      <StickyYAxis id="chart-spending-area-yaxis" ticks={ticks} yMax={yMax} height={H} marginTop={MARGIN_TOP} xAxisHeight={X_AXIS_H} />
      <div ref={scrollRef} id="chart-spending-area-scroll" className="overflow-x-auto flex-1 min-w-0">
        <div id="chart-spending-area-inner" style={minWidth ? { minWidth } : undefined}>
          <ResponsiveContainer width="100%" height={H}>
            <AreaChart data={data} margin={{ top: MARGIN_TOP, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f87171" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="label"
                height={X_AXIS_H}
                padding={{ left: 20, right: 12 }}
                tick={isMonthly
                  ? <MonthTick yearBoundaries={yearBoundaries} />
                  : { fontSize: 10, fill: 'rgba(255,255,255,0.35)' }
                }
                axisLine={false}
                tickLine={false}
                interval={isMonthly ? 0 : tickInterval}
              />
              <YAxis domain={[0, yMax]} hide />
              <Tooltip content={<TooltipEl />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />

              {[...yearBoundaries].map(key => (
                <ReferenceLine key={key} x={key} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="3 3" />
              ))}

              {hasIncome && (
                <Area dataKey="income" stroke="#34d399" strokeWidth={1.5} fill="url(#incomeGrad)"
                  dot={false} activeDot={{ r: 3, fill: '#34d399', strokeWidth: 0 }} isAnimationActive={inView} animationDuration={500} />
              )}
              <Area dataKey="expenses" stroke="#f87171" strokeWidth={2} fill="url(#spendGrad)"
                dot={false} activeDot={{ r: 3, fill: '#f87171', strokeWidth: 0 }} isAnimationActive={inView} animationDuration={500} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
