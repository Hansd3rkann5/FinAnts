import { useRef, useEffect } from 'react'
import { useInView } from 'framer-motion'
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import type { CategoryTrendPoint } from '@/utils/chartCompute'
import type { Category } from '@/types'
import { getNiceTicks, StickyYAxis } from './chartUtils'
import { formatEur } from '@/utils/format'


function ChartTooltip({ active, payload, label, allMap }: any) {
  if (!active || !payload?.length) return null
  const sorted = [...payload].sort((a, b) => (b.value as number) - (a.value as number))
  return (
    <div className="bg-[#12122a]/95 backdrop-blur border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl min-w-35">
      <p className="text-white/40 mb-1.5">{label}</p>
      {sorted.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{allMap[p.dataKey]?.label ?? p.dataKey}</span>
          <span className="text-white/70 font-medium">{formatEur(p.value, 0)}</span>
        </div>
      ))}
    </div>
  )
}

const H = 150
const MARGIN_TOP = 8
const X_AXIS_H = 20

interface Props {
  points: CategoryTrendPoint[]
  topCats: string[]
  allMap: Record<string, Category>
}

export function CategoryTrendChart({ points, topCats, allMap }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inView = useInView(containerRef, { once: true, amount: 0.3 })

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [points])

  const maxVal = Math.max(
    ...points.flatMap(p => topCats.map(c => (p[c] as number) || 0)),
    0,
  )
  const ticks  = getNiceTicks(maxVal)
  const yMax   = ticks[ticks.length - 1] || 1
  const minWidth = Math.max(280, points.length * 56)

  return (
    <div ref={containerRef} id="chart-category-trends" className="flex flex-col gap-3">
      <div className="flex items-start">
        <StickyYAxis id="chart-category-trends-yaxis" ticks={ticks} yMax={yMax} height={H} marginTop={MARGIN_TOP} xAxisHeight={X_AXIS_H} />
        <div ref={scrollRef} id="chart-category-trends-scroll" className="overflow-x-auto flex-1 min-w-0">
          <div id="chart-category-trends-inner" style={{ minWidth }}>
            <ResponsiveContainer width="100%" height={H}>
              <LineChart data={points} margin={{ top: MARGIN_TOP, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="month"
                  height={X_AXIS_H}
                  padding={{ left: 20, right: 12 }}
                  tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                />
                <YAxis domain={[0, yMax]} hide />
                <Tooltip content={<ChartTooltip allMap={allMap} />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
                {topCats.map(catId => (
                  <Line
                    key={catId}
                    dataKey={catId}
                    stroke={allMap[catId]?.color ?? '#888'}
                    strokeWidth={2}
                    dot={{ r: 2.5, fill: allMap[catId]?.color ?? '#888', strokeWidth: 0 }}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    isAnimationActive={inView}
                    animationDuration={500}
                    animationEasing="ease-out"
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {topCats.map(catId => {
          const cat = allMap[catId]
          if (!cat) return null
          return (
            <div key={catId} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
              <span className="text-[10px] text-white/50">{cat.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
