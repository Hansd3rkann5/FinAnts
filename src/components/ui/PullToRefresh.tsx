import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { RefreshCw } from 'lucide-react'

const THRESHOLD = 70   // indicator height (px) that triggers a refresh
const MAX_PULL  = 110  // asymptotic cap the pull eases towards

interface Props {
  /** id of the scrollable page container (see AppShell's scrollId). */
  scrollId: string
  onRefresh: () => void | Promise<void>
  children: React.ReactNode
}

export function PullToRefresh({ scrollId, onRefresh, children }: Props) {
  const height = useMotionValue(0)
  const [armed, setArmed] = useState(false)
  // Ref so the gesture effect doesn't re-subscribe when the parent re-renders
  // with a fresh onRefresh closure.
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => { onRefreshRef.current = onRefresh }, [onRefresh])

  useEffect(() => {
    const scrollEl = document.getElementById(scrollId)
    if (!scrollEl) return

    let startY   = 0
    let tracking = false  // finger/button down, may become a pull
    let pulling  = false  // we own the gesture; scrolling is suppressed
    let busy     = false

    const update = (h: number) => {
      height.set(h)
      setArmed(h >= THRESHOLD)
    }
    const settle = () => { animate(height, 0, { type: 'spring', stiffness: 320, damping: 32 }) }

    const begin = (y: number) => {
      if (busy) return
      tracking = true
      pulling = false
      startY = y
    }

    const moveTo = (y: number, e?: Event) => {
      if (!tracking || busy) return
      if (!pulling) {
        // Decide here, not at gesture start: iOS reports fractional or
        // negative scrollTop around rubber-band bounces, so a strict
        // scrollTop === 0 check at touchstart made the pull never arm.
        if (scrollEl.scrollTop > 1) { startY = y; return }
        if (y - startY < 8) return
        pulling = true
        startY = y  // measure the pull from here so it grows from 0
      }
      e?.preventDefault()
      const delta = Math.max(0, y - startY)
      update(MAX_PULL * (1 - Math.exp(-delta / 130)))
    }

    const end = () => {
      if (!tracking) return
      tracking = false
      if (!pulling) return
      pulling = false
      const h = height.get()
      setArmed(false)
      settle()
      if (h >= THRESHOLD) {
        busy = true
        Promise.resolve(onRefreshRef.current())
          .catch(() => { /* errors surface via reportError in the handler */ })
          .finally(() => { busy = false })
      }
    }

    const onTouchStart = (e: TouchEvent) => begin(e.touches[0].clientY)
    const onTouchMove  = (e: TouchEvent) => moveTo(e.touches[0].clientY, e)
    const onMouseMove  = (e: MouseEvent) => moveTo(e.clientY)
    const onMouseUp    = () => {
      end()
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    const onMouseDown  = (e: MouseEvent) => {
      begin(e.clientY)
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    }

    scrollEl.addEventListener('touchstart', onTouchStart, { passive: true })
    scrollEl.addEventListener('touchmove', onTouchMove, { passive: false })
    scrollEl.addEventListener('touchend', end, { passive: true })
    scrollEl.addEventListener('touchcancel', end, { passive: true })
    scrollEl.addEventListener('mousedown', onMouseDown)
    return () => {
      scrollEl.removeEventListener('touchstart', onTouchStart)
      scrollEl.removeEventListener('touchmove', onTouchMove)
      scrollEl.removeEventListener('touchend', end)
      scrollEl.removeEventListener('touchcancel', end)
      scrollEl.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [scrollId, height])

  const progress      = useTransform(height, [0, THRESHOLD], [0, 1])
  const iconRotate    = useTransform(height, [0, MAX_PULL], [0, 320])
  const iconScale     = useTransform(height, [0, THRESHOLD], [0.7, 1])
  const bubbleOpacity = useTransform(height, [6, THRESHOLD * 0.5], [0, 1])

  return (
    <div>
      <motion.div style={{ height }} className="relative overflow-hidden">
        <div className="absolute inset-x-0 bottom-2 flex flex-col items-center gap-1.5">
          <motion.div
            style={{ opacity: bubbleOpacity, scale: iconScale }}
            className={`relative w-9 h-9 rounded-full flex items-center justify-center border transition-colors duration-200 ${
              armed
                ? 'bg-purple-500/20 border-purple-400/50 shadow-[0_0_16px_rgba(124,92,255,0.45)]'
                : 'bg-white/6 border-white/10'
            }`}
          >
            {/* Progress ring — fills clockwise as the pull approaches the threshold */}
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
              <motion.circle
                cx="18" cy="18" r="16.5" fill="none"
                stroke={armed ? 'rgba(167,139,250,0.9)' : 'rgba(255,255,255,0.35)'}
                strokeWidth="1.5" strokeLinecap="round"
                style={{ pathLength: progress }}
              />
            </svg>
            <motion.span
              style={{ rotate: iconRotate }}
              className={`flex ${armed ? 'text-purple-300' : 'text-white/50'}`}
            >
              <RefreshCw size={15} />
            </motion.span>
          </motion.div>
          <motion.p
            style={{ opacity: bubbleOpacity }}
            className="text-[9px] tracking-[0.15em] uppercase text-white/30"
          >
            {armed ? 'Loslassen zum Aktualisieren' : 'Ziehen zum Aktualisieren'}
          </motion.p>
        </div>
      </motion.div>
      {children}
    </div>
  )
}
