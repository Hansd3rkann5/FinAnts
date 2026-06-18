import { useEffect, useRef, type RefObject } from 'react'

const SNAP = 'transform 300ms cubic-bezier(0.22, 0.61, 0.36, 1)'

// Positions the filmstrip track on the active page (navbar tap) and keeps it
// aligned on resize. Touch-swipe-to-navigate was removed — it fought with
// iOS's native scroll-gesture recognizer on tall pages and got stuck mid-drag.
export function usePagerSwipe(
  trackRef: RefObject<HTMLDivElement | null>,
  count: number,
  index: number,
  _goTo: (i: number) => void,
) {
  const idxRef = useRef(index)
  idxRef.current = index
  const first = useRef(true)

  useEffect(() => {
    const el = trackRef.current
    const surface = el?.parentElement
    if (!el || !surface) return
    el.style.transition = first.current ? 'none' : SNAP
    el.style.transform = `translate3d(${Math.round(-index * surface.clientWidth)}px, 0, 0)`
    first.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, count])

  useEffect(() => {
    const el = trackRef.current
    const surface = el?.parentElement
    if (!el || !surface) return

    const onResize = () => {
      el.style.transition = 'none'
      el.style.transform = `translate3d(${Math.round(-idxRef.current * surface.clientWidth)}px, 0, 0)`
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [trackRef])
}
