import { useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import type { CategorySummary } from '@/types'
import { CATEGORIES } from '@/data/categories'

interface Props {
  categories: CategorySummary[]
}

function formatEur(v: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: CategorySummary }[] }) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  const cat = CATEGORIES[item.categoryId]
  return (
    <div className="bg-[#1c1c28]/95 backdrop-blur-sm border border-white/10 rounded-card_sm px-3 py-2 text-xs">
      <div className="flex items-center gap-1.5 mb-1">
        <span>{cat.icon}</span>
        <span className="font-medium text-white">{cat.label}</span>
      </div>
      <div className="text-white/60">{formatEur(item.total)} · {item.count} Buchungen</div>
    </div>
  )
}

export function CategoryPieChart({ categories }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)

  const data = categories.map(c => ({
    ...c,
    name: CATEGORIES[c.categoryId].label,
    color: CATEGORIES[c.categoryId].color,
  }))

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-white/30 text-sm">
        Keine Ausgaben im Zeitraum
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Center label overlaid via absolute positioning */}
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
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-sm font-semibold text-white/90 text-center px-2 leading-tight">
            {data[activeIndex]?.name ?? ''}
          </span>
          <span className="text-xs text-white/50 mt-0.5">
            {data[activeIndex] ? formatEur(data[activeIndex].total) : ''}
          </span>
          <span className="text-[10px] text-white/30 mt-0.5">
            {data[activeIndex] ? `${data[activeIndex].percentage.toFixed(0)}%` : ''}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-col gap-1.5">
        {data.slice(0, 7).map((item, i) => (
          <button
            key={item.categoryId}
            onClick={() => setActiveIndex(i)}
            className="flex items-center gap-2 w-full text-left transition-opacity duration-150 active:opacity-70"
          >
            <div
              className="w-2 h-2 rounded-full shrink-0 transition-transform duration-200"
              style={{
                backgroundColor: item.color,
                transform: i === activeIndex ? 'scale(1.5)' : 'scale(1)',
              }}
            />
            <span className={`text-xs flex-1 truncate transition-colors duration-150 ${i === activeIndex ? 'text-white/90 font-medium' : 'text-white/60'}`}>
              {item.name}
            </span>
            <span className="text-xs font-medium text-white/80">{formatEur(item.total)}</span>
            <span className="text-xs text-white/40 w-10 text-right">{item.percentage.toFixed(0)}%</span>
          </button>
        ))}
        {data.length > 7 && (
          <p className="text-xs text-white/30 pl-4">+{data.length - 7} weitere Kategorien</p>
        )}
      </div>
    </div>
  )
}
