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

// Like getNiceTicks but returns a *non-zero-based* range: nice min/max bracketing
// the actual data so a 240–260 € series fills the plot instead of hugging the top
// of a 0–300 axis. Only for value series (e.g. depot line) — bar/area charts that
// must be anchored at 0 keep using getNiceTicks.
export function getNiceBounds(min: number, max: number, count = 4): { ticks: number[]; min: number; max: number } {
  if (!isFinite(min) || !isFinite(max)) return { ticks: [0], min: 0, max: 1 }
  if (min === max) {
    // Flat series — pad symmetrically so it doesn't render as a single line
    // pinned to an edge.
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.05 : 1
    min -= pad
    max += pad
  }
  const rawStep = (max - min) / count
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= rawStep) ?? rawStep
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let t = niceMin; t <= niceMax + step * 0.001; t += step) {
    ticks.push(Math.round(t * 100) / 100)
  }
  return { ticks, min: niceMin, max: niceMax }
}

export function fmtY(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`
  return String(Math.round(v))
}

interface Props {
  ticks: number[]
  yMax: number
  yMin?: number
  height: number
  marginTop?: number
  xAxisHeight?: number
  id?: string
}

/** Fixed-width Y-axis overlay — sits outside the scroll container. */
export function StickyYAxis({ ticks, yMax, yMin = 0, height, marginTop = 8, xAxisHeight = 20, id }: Props) {
  const drawH = height - marginTop - xAxisHeight
  const span = yMax - yMin || 1
  return (
    <div id={id} className="shrink-0 w-8 relative" style={{ height }}>
      {ticks.map(tick => {
        const top = marginTop + drawH * (1 - (tick - yMin) / span)
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
