import { useState, useRef } from 'react'
import { useInView } from 'framer-motion'
import { useAppUnlocked } from '@/hooks/useAppUnlocked'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import type { CategorySummary } from '@/types'
import { useAllCategories } from '@/hooks/useAllCategories'
import { formatEur } from '@/utils/format'

interface Props {
  categories: CategorySummary[]
}



export function CategoryPieChart({ categories }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const { allMap } = useAllCategories()
  const containerRef = useRef<HTMLDivElement>(null)
  const unlocked = useAppUnlocked()
  const inViewRaw = useInView(containerRef, { once: true, amount: 0.3 })
  // Hold the entry animation while the lock screen is up — Recharts animates
  // on the main thread and starves the PIN keypad of input events.
  const inView = inViewRaw && unlocked

  const data = categories
    .filter(c => allMap[c.categoryId])
    .map(c => ({
      ...c,
      name: allMap[c.categoryId].label,
      color: allMap[c.categoryId].color,
    }))

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-white/30 text-sm">
        Keine Ausgaben im Zeitraum
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      <div className="relative">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              dataKey="total"
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onClick={(_, index) => setActiveIndex(index)}
              paddingAngle={2}
              strokeWidth={0}
              isAnimationActive={inView}
              animationDuration={300}
              animationEasing="ease-out"
            >
              {data.map((entry, i) => (
                <Cell
                  key={entry.categoryId}
                  fill={entry.color}
                  opacity={i === activeIndex ? 1 : 0.55}
                  radius={i === activeIndex ? 6 : 0}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-sm font-semibold text-white/90 text-center px-2 leading-tight">
            {data[activeIndex]?.name ?? ''}
          </span>
          <span className="text-xs text-white/50 mt-0.5">
            {data[activeIndex] ? formatEur(data[activeIndex].total, 0) : ''}
          </span>
          <span className="text-[10px] text-white/30 mt-0.5">
            {data[activeIndex] ? `${data[activeIndex].percentage.toFixed(0)}%` : ''}
          </span>
        </div>
      </div>

      <div id="category-legend" className="flex flex-col gap-1.5" style={{ paddingBottom: '5px' }}>
        {data.slice(0, 7).map((item, i) => (
          <button
            key={item.categoryId}
            id={`category-legend-item-${item.categoryId}`}
            onClick={() => setActiveIndex(i)}
            className="flex items-center gap-2 w-full text-left transition-opacity duration-150 active:opacity-70"
          >
            <div
              className="w-2 h-2 rounded-full shrink-0 transition-transform duration-200"
              style={{
                backgroundColor: item.color,
                transform: i === activeIndex ? 'scale(1.5)' : 'scale(1)',
                marginLeft: i === activeIndex ? '4px' : '0',
              }}
            />
            <span className={`text-xs flex-1 truncate transition-colors duration-150 ${i === activeIndex ? 'text-white/90 font-medium' : 'text-white/60'}`}>
              {item.name}
            </span>
            <span className="text-xs font-medium text-white/80">{formatEur(item.total, 0)}</span>
            <span className="text-xs text-white/40 w-10 text-right">{item.percentage.toFixed(0)}%</span>
          </button>
        ))}
      </div>
    </div>
  )
}
