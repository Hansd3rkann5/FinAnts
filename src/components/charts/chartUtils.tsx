export function getNiceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0]
  const rawStep = max / count
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= rawStep) ?? rawStep
  const ticks: number[] = []
  for (let i = 0; i * step <= max * 1.1; i++) {
    ticks.push(Math.round(i * step * 100) / 100)
  }
  return ticks
}

export function fmtY(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`
  return String(Math.round(v))
}

interface Props {
  ticks: number[]
  yMax: number
  height: number
  marginTop?: number
  xAxisHeight?: number
  id?: string
}

/** Fixed-width Y-axis overlay — sits outside the scroll container. */
export function StickyYAxis({ ticks, yMax, height, marginTop = 8, xAxisHeight = 20, id }: Props) {
  const drawH = height - marginTop - xAxisHeight
  return (
    <div id={id} className="shrink-0 w-8 relative" style={{ height }}>
      {ticks.map(tick => {
        const top = marginTop + drawH * (1 - tick / yMax)
        return (
          <span
            key={tick}
            id={id ? `${id}-tick-${tick}` : undefined}
            className="absolute right-1 text-[9px] text-white/25 leading-none select-none"
            style={{ top, transform: 'translateY(-50%)' }}
          >
            {fmtY(tick)}
          </span>
        )
      })}
    </div>
  )
}
