import { useEffect, useRef, type RefObject } from 'react'

const DECIDE = 10        // px before committing to horizontal vs vertical
const ANGLE = 1.2        // |dx| must exceed |dy| * ANGLE to count as horizontal
const EDGE_RESIST = 0.35 // rubber-band factor past the first/last page
const SNAP = 'transform 300ms cubic-bezier(0.22, 0.61, 0.36, 1)'

// Live, finger-following pager. The track's transform tracks the finger during a
// horizontal drag and snaps to a page on release. `goTo(index)` should change
// the route; the settle effect then animates to the new page.
export function usePagerSwipe(
  trackRef: RefObject<HTMLDivElement | null>,
  count: number,
  index: number,
  goTo: (i: number) => void,
) {
  const basePct = (i: number) => -i * (100 / count)
  const idxRef = useRef(index)
  idxRef.current = index
  const first = useRef(true)

  // Settle to the active page whenever it changes (navbar tap or swipe commit).
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    el.style.transition = first.current ? 'none' : SNAP
    el.style.transform = `translateX(${basePct(index)}%)`
    first.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, count])

  useEffect(() => {
    const el = trackRef.current
    const surface = el?.parentElement   // #app-main — the touch surface
    if (!el || !surface) return

    let startX = 0, startY = 0, dx = 0
    let dragging = false, decided = false, horizontal = false, allow = true

    function startsInHorizontalScroller(target: EventTarget | null): boolean {
      let node = target as HTMLElement | null
      while (node && node !== surface) {
        if (node.scrollWidth > node.clientWidth + 2) {
          const ox = getComputedStyle(node).overflowX
          if (ox === 'auto' || ox === 'scroll') return true
        }
        node = node.parentElement
      }
      return false
    }

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { allow = false; return }
      const t = e.touches[0]
      startX = t.clientX; startY = t.clientY; dx = 0
      dragging = true; decided = false; horizontal = false
      allow = !startsInHorizontalScroller(e.target)
    }

    const onMove = (e: TouchEvent) => {
      if (!dragging || !allow) return
      const t = e.touches[0]
      const mx = t.clientX - startX, my = t.clientY - startY
      if (!decided) {
        if (Math.abs(mx) < DECIDE && Math.abs(my) < DECIDE) return
        decided = true
        horizontal = Math.abs(mx) > Math.abs(my) * ANGLE
      }
      if (!horizontal) return
      e.preventDefault()   // stop vertical scroll while dragging horizontally
      dx = mx
      const i = idxRef.current
      // resist dragging past the first / last page
      const eff = ((i === 0 && dx > 0) || (i === count - 1 && dx < 0)) ? dx * EDGE_RESIST : dx
      el.style.transition = 'none'
      el.style.transform = `translateX(calc(${basePct(i)}% + ${eff}px))`
    }

    const onEnd = () => {
      if (!dragging) return
      dragging = false
      const i = idxRef.current
      if (!horizontal) return
      const w = surface.clientWidth || window.innerWidth || 1
      const passed = Math.abs(dx) > Math.min(80, w * 0.25)
      let target = i
      if (passed) {
        if (dx < 0 && i < count - 1) target = i + 1
        else if (dx > 0 && i > 0) target = i - 1
      }
      if (target !== i) {
        goTo(target)   // route change → settle effect animates to the target
      } else {
        el.style.transition = SNAP
        el.style.transform = `translateX(${basePct(i)}%)`   // snap back
      }
    }

    surface.addEventListener('touchstart', onStart, { passive: true })
    surface.addEventListener('touchmove', onMove, { passive: false })
    surface.addEventListener('touchend', onEnd, { passive: true })
    surface.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      surface.removeEventListener('touchstart', onStart)
      surface.removeEventListener('touchmove', onMove)
      surface.removeEventListener('touchend', onEnd)
      surface.removeEventListener('touchcancel', onEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackRef, count, goTo])
}
