import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw } from 'lucide-react'

const THRESHOLD = 64
const MAX_HEIGHT = 56

interface Props {
  onRefresh: () => void | Promise<void>
  children: React.ReactNode
}

export function PullToRefresh({ onRefresh, children }: Props) {
  const [indicatorHeight, setIndicatorHeight] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const state = useRef({ startY: 0, pulling: false, refreshing: false, height: 0 })

  useEffect(() => {
    const scrollEl = document.getElementById('page-scroll-transactions')
    if (!scrollEl) return

    const onTouchStart = (e: TouchEvent) => {
      if (state.current.refreshing) return
      if (scrollEl.scrollTop === 0) {
        state.current.startY = e.touches[0].clientY
        state.current.pulling = true
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!state.current.pulling || state.current.refreshing) return
      if (scrollEl.scrollTop > 0) {
        state.current.pulling = false
        state.current.height = 0
        setIndicatorHeight(0)
        return
      }
      const delta = e.touches[0].clientY - state.current.startY
      if (delta > 0) {
        e.preventDefault()
        const h = Math.min(delta * 0.5, MAX_HEIGHT)
        state.current.height = h
        setIndicatorHeight(h)
      }
    }

    const onTouchEnd = () => {
      if (!state.current.pulling) return
      state.current.pulling = false
      if (state.current.height >= THRESHOLD) {
        state.current.refreshing = true
        state.current.height = 0
        setIndicatorHeight(MAX_HEIGHT)
        setRefreshing(true)
        setTimeout(async () => {
          try { await onRefresh() } catch { /* keep UI responsive */ }
          state.current.refreshing = false
          setRefreshing(false)
          setIndicatorHeight(0)
        }, 500)
      } else {
        state.current.height = 0
        setIndicatorHeight(0)
      }
    }

    scrollEl.addEventListener('touchstart', onTouchStart, { passive: true })
    scrollEl.addEventListener('touchmove', onTouchMove, { passive: false })
    scrollEl.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      scrollEl.removeEventListener('touchstart', onTouchStart)
      scrollEl.removeEventListener('touchmove', onTouchMove)
      scrollEl.removeEventListener('touchend', onTouchEnd)
    }
  }, [onRefresh])

  const progress = Math.min(indicatorHeight / THRESHOLD, 1)

  return (
    <div>
      <div
        style={{
          height: indicatorHeight,
          overflow: 'hidden',
          position: 'relative',
          transition: (!state.current.pulling || indicatorHeight === 0) ? 'height 0.3s ease' : 'none',
        }}
      >
        <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)' }}>
          <motion.div
            animate={refreshing ? { rotate: 360 } : { rotate: progress * 200 }}
            transition={refreshing
              ? { repeat: Infinity, duration: 0.7, ease: 'linear' }
              : { duration: 0 }
            }
            style={{ opacity: 0.3 + progress * 0.7 }}
          >
            <RefreshCw size={18} className="text-purple-400" />
          </motion.div>
        </div>
      </div>
      {children}
    </div>
  )
}
