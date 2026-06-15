import { useEffect } from 'react'

interface Options {
  onPrev: () => void   // swipe right (finger →)
  onNext: () => void   // swipe left  (finger ←)
}

const DISTANCE = 60    // px a horizontal swipe must travel to switch tabs
const DECIDE = 10      // px before we commit to horizontal vs vertical
const ANGLE = 1.2      // |dx| must exceed |dy| * ANGLE to count as horizontal

// Attach a horizontal swipe-to-navigate gesture to the element with `elId`.
// Passive (never preventDefault) so vertical scrolling and pull-to-refresh keep
// working; a swipe that starts inside a horizontally-scrollable element is
// ignored so it scrolls that element instead.
export function useSwipeNavigation(elId: string, { onPrev, onNext }: Options) {
  useEffect(() => {
    const el = document.getElementById(elId)
    if (!el) return

    let startX = 0, startY = 0
    let dragging = false, decided = false, horizontal = false, allow = true

    function startsInHorizontalScroller(target: EventTarget | null): boolean {
      let node = target as HTMLElement | null
      while (node && node !== el) {
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
      startX = t.clientX; startY = t.clientY
      dragging = true; decided = false; horizontal = false
      allow = !startsInHorizontalScroller(e.target)
    }
    const onMove = (e: TouchEvent) => {
      if (!dragging || !allow || decided) return
      const t = e.touches[0]
      const dx = t.clientX - startX, dy = t.clientY - startY
      if (Math.abs(dx) > DECIDE || Math.abs(dy) > DECIDE) {
        decided = true
        horizontal = Math.abs(dx) > Math.abs(dy) * ANGLE
      }
    }
    const onEnd = (e: TouchEvent) => {
      if (!dragging) return
      dragging = false
      if (!allow || !horizontal) return
      const dx = e.changedTouches[0].clientX - startX
      if (dx <= -DISTANCE) onNext()
      else if (dx >= DISTANCE) onPrev()
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [elId, onPrev, onNext])
}
