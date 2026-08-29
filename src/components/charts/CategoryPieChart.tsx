import { useState, useRef, useMemo } from 'react'
import { motion, useInView } from 'framer-motion'
import { useAppUnlocked } from '@/hooks/useAppUnlocked'
import type { CategorySummary } from '@/types'
import { useAllCategories } from '@/hooks/useAllCategories'
import { formatEur } from '@/utils/format'

const CX = 110
const CY = 110
const INNER_R = 65
const OUTER_R = 90
const EXPLODE = 9
const GAP_DEG = 2

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * Math.PI / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function sectorPath(innerR: number, outerR: number, startAngle: number, endAngle: number): string {
  const p1 = polarToCartesian(CX, CY, outerR, startAngle)
  const p2 = polarToCartesian(CX, CY, outerR, endAngle)
  const p3 = polarToCartesian(CX, CY, innerR, endAngle)
  const p4 = polarToCartesian(CX, CY, innerR, startAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    'Z',
  ].join(' ')
}

interface Props {
  categories: CategorySummary[]
}

export function CategoryPieChart({ categories }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const { allMap } = useAllCategories()
  const containerRef = useRef<HTMLDivElement>(null)
  const unlocked = useAppUnlocked()
  const inViewRaw = useInView(containerRef, { once: true, amount: 0.3 })
  const inView = inViewRaw && unlocked

  const data = useMemo(
    () => categories
      .filter(c => allMap[c.categoryId])
      .map(c => ({
        ...c,
        name: allMap[c.categoryId].label,
        color: allMap[c.categoryId].color,
      })),
    [categories, allMap],
  )

  const sectors = useMemo(() => {
    const total = data.reduce((s, d) => s + d.total, 0)
    if (total === 0) return []
    return data.reduce<Array<typeof data[0] & { midAngle: number; endAngle: number; path: string }>>(
      (acc, d) => {
        const startAngle = acc.length === 0
          ? GAP_DEG / 2
          : acc[acc.length - 1].endAngle + GAP_DEG
        const sweep = (d.total / total) * (360 - GAP_DEG * data.length)
        const endAngle = startAngle + sweep
        const midAngle = (startAngle + endAngle) / 2
        acc.push({ ...d, midAngle, endAngle, path: sectorPath(INNER_R, OUTER_R, startAngle, endAngle) })
        return acc
      },
      [],
    )
  }, [data])

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
        <motion.svg
          width="100%"
          height="220"
          viewBox="0 0 220 220"
          style={{ display: 'block' }}
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          {sectors.map((s, i) => {
            const isActive = i === activeIndex
            const rad = (s.midAngle - 90) * Math.PI / 180
            const tx = isActive ? EXPLODE * Math.cos(rad) : 0
            const ty = isActive ? EXPLODE * Math.sin(rad) : 0
            return (
              <motion.g
                key={s.categoryId}
                animate={{ x: tx, y: ty }}
                transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                onClick={() => setActiveIndex(i)}
                onMouseEnter={() => setActiveIndex(i)}
                style={{ cursor: 'pointer' }}
              >
                <path
                  d={s.path}
                  fill={s.color}
                  style={{ opacity: isActive ? 1 : 0.55, transition: 'opacity 0.18s' }}
                />
              </motion.g>
            )
          })}
        </motion.svg>

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
              className="w-2 h-2 rounded-full shrink-0 transition-all duration-200"
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
