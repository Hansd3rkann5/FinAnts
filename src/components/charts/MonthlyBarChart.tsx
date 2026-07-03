import { useRef, useEffect } from 'react'
import { useInView } from 'framer-motion'
import { useAppUnlocked } from '@/hooks/useAppUnlocked'
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import type { MonthPoint } from '@/utils/chartCompute'
import { getNiceTicks, fmtY, StickyYAxis } from './chartUtils'
import { formatEur } from '@/utils/format'


function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const income   = payload.find((p: any) => p.dataKey === 'income')
  const expenses = payload.find((p: any) => p.dataKey === 'expenses')
  const balance  = payload.find((p: any) => p.dataKey === 'balance')
  return (
    <div className="bg-[#12122a]/95 backdrop-blur border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-white/40 mb-1.5 font-medium">{label}</p>
      {income   && <p className="text-emerald-400">↑ {formatEur(income.value, 0)}</p>}
      {expenses && <p className="text-red-400">↓ {formatEur(expenses.value, 0)}</p>}
      {balance  && (
        <p className={`mt-1 font-semibold ${balance.value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          = {balance.value >= 0 ? '+' : ''}{formatEur(balance.value, 0)}
        </p>
      )}
    </div>
  )
}

const H = 160
const MARGIN_TOP = 8
const X_AXIS_H = 20

interface Props { data: MonthPoint[] }

export function MonthlyBarChart({ data }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const unlocked = useAppUnlocked()
  const inViewRaw = useInView(containerRef, { once: true, amount: 0.3 })
  // Hold the entry animation while the lock screen is up — Recharts animates
  // on the main thread and starves the PIN keypad of input events.
  const inView = inViewRaw && unlocked

  // Start scrolled to most recent (right edge)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [data])

  const maxVal = Math.max(...data.map(d => Math.max(d.income, d.expenses)), 0)
  const ticks  = getNiceTicks(maxVal)
  const yMax   = ticks[ticks.length - 1] || 1
  const minWidth = Math.max(320, data.length * 60)

  return (
    <div ref={containerRef} id="chart-monthly-bar" className="flex items-start">
      <StickyYAxis id="chart-monthly-bar-yaxis" ticks={ticks} yMax={yMax} height={H} marginTop={MARGIN_TOP} xAxisHeight={X_AXIS_H} />
      <div ref={scrollRef} id="chart-monthly-bar-scroll" className="overflow-x-auto flex-1 min-w-0">
        <div id="chart-monthly-bar-inner" style={{ minWidth }}>
          <ResponsiveContainer width="100%" height={H}>
            <ComposedChart
              data={data}
              margin={{ top: MARGIN_TOP, right: 8, left: 0, bottom: 0 }}
              barGap={2}
              barCategoryGap="30%"
            >
              <defs>
                <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0.4} />
                </linearGradient>
                <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f87171" stopOpacity={0.85} />
                  <stop offset="100%" stopColor="#f87171" stopOpacity={0.35} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="month"
                height={X_AXIS_H}
                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis domain={[0, yMax]} hide tickFormatter={fmtY} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="income"   fill="url(#incGrad)" radius={[3,3,0,0]} maxBarSize={22} isAnimationActive={inView} animationDuration={300} animationEasing="ease-out" />
              <Bar dataKey="expenses" fill="url(#expGrad)" radius={[3,3,0,0]} maxBarSize={22} isAnimationActive={inView} animationDuration={300} animationEasing="ease-out" />
              <Line
                dataKey="balance"
                stroke="rgba(255,255,255,0.35)"
                strokeWidth={1.5}
                dot={{ r: 2, fill: 'rgba(255,255,255,0.4)', strokeWidth: 0 }}
                activeDot={{ r: 4, fill: '#fff', strokeWidth: 0 }}
                isAnimationActive={inView}
                animationDuration={300}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
