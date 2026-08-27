import { useRef, useCallback } from 'react'

export function useLongPress(callback: () => void, ms = 500) {
  const timer = useRef<number | null>(null)
  const moved = useRef(false)

  const start = useCallback(() => {
    moved.current = false
    timer.current = window.setTimeout(() => {
      if (!moved.current) callback()
    }, ms)
  }, [callback, ms])

  const cancel = useCallback(() => {
    if (timer.current !== null) { clearTimeout(timer.current); timer.current = null }
  }, [])

  const onPointerMove = useCallback(() => {
    moved.current = true
    cancel()
  }, [cancel])

  return {
    onPointerDown: start,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onPointerMove,
  }
}
