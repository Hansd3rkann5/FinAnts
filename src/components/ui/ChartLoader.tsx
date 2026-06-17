import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, type Transition, type TargetAndTransition } from 'framer-motion'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

// Brand palette from the app logo — the line fades from its current colour
// into the next one in this list every time it morphs.
const COLORS = ['#7c5cff', '#a78bfa', '#6366f1', '#3b82f6', '#2563eb', '#8b5cf6']

// Drawing surface (user units), scaled uniformly to fit the window.
const VB_W = 100
const VB_H = 60
const PAD_X = 3   // keep end points off the very edge
const PAD_Y = 9   // vertical breathing room for the random y-values
const POINTS = 5
const STROKE_W = 1.4

// x-positions never change — only y. Computed once at module scope since
// they're the same for every tick.
const XS = Array.from({ length: POINTS }, (_, i) => PAD_X + (i / (POINTS - 1)) * (VB_W - PAD_X * 2))

const rand = (min: number, max: number) => min + Math.random() * (max - min)

function pathFromYs(ys: number[]): string {
  return `M ${XS.map((x, i) => `${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' L ')}`
}

// The 5 points morph to fresh random y-values once per second (1Hz); the
// stroke colour fades to the next palette entry over the same beat, so shape
// and colour transitions land together.
const TICK_MS = 1000
const MORPH: Transition = { duration: TICK_MS / 1000, ease: 'easeInOut' }

type Target = Pick<TargetAndTransition, 'd' | 'stroke'>

function ChartAnimation() {
  // One persistent line — never replaced/remounted, just continuously
  // retargeted. Starts perfectly flat (all 5 points at the same y), then
  // morphs every tick. `target` IS the exact object passed to `animate`
  // (not wrapped in a fresh literal in JSX): Framer Motion treats a new
  // object reference as a new animation target and restarts the in-progress
  // transition, so this needs to stay the same object until the next tick
  // genuinely changes it via setTarget.
  const [target, setTarget] = useState<Target>(() => ({
    d: pathFromYs(Array(POINTS).fill(VB_H / 2)),
    stroke: COLORS[0],
  }))
  const colorRef = useRef(0)

  useEffect(() => {
    const iv = setInterval(() => {
      colorRef.current = (colorRef.current + 1) % COLORS.length
      setTarget({
        d: pathFromYs(XS.map(() => rand(PAD_Y, VB_H - PAD_Y))),
        stroke: COLORS[colorRef.current],
      })
    }, TICK_MS)
    return () => clearInterval(iv)
  }, [])

  return (
    <div
      className="w-full h-full"
      style={{ filter: 'drop-shadow(0 0 8px rgba(124,92,255,0.35))' }}
    >
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height="100%">
        <motion.path
          fill="none"
          strokeWidth={STROKE_W}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={target}
          animate={target}
          transition={MORPH}
        />
      </svg>
    </div>
  )
}

interface ChartLoaderProps {
  show: boolean
  message?: string
  onClose?: () => void
}

export function ChartLoader({ show, message, onClose }: ChartLoaderProps) {
  const [dismissed, setDismissed] = useState(false)
  const [prevShow, setPrevShow] = useState(show)

  // Reset the dismiss flag whenever a fresh loading episode begins.
  // Adjusting state *during render* (React's recommended pattern for "reset
  // state when a prop changes") avoids the "setState synchronously within an
  // effect" cascading-render warning. React restarts the render immediately, so
  // no extra commit/flicker happens.
  if (show !== prevShow) {
    setPrevShow(show)
    if (show) setDismissed(false)
  }

  if (typeof document === 'undefined') return null

  const visible = show && !dismissed
  const handleClose = () => {
    setDismissed(true)
    onClose?.()
  }

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-200"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Blurred backdrop */}
          <div className="absolute inset-0 backdrop-blur-2xl bg-black/60" />

          {/* Close button */}
          <button
            onClick={handleClose}
            aria-label="Schließen"
            className="absolute right-4 z-10 w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
            style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
          >
            <X size={18} />
          </button>

          {/* Chart animation — centred with 25% padding on each side */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div style={{ width: '50vw', height: '32vh' }}>
              <ChartAnimation />
            </div>
          </div>

          {/* Message */}
          {message && (
            <motion.p
              className="absolute bottom-16 left-0 right-0 text-center z-10 text-xs text-white/45 tracking-[0.2em] uppercase pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.3, 0.65, 0.3] }}
              transition={{ duration: 2.2, repeat: Infinity, delay: 0.4 }}
            >
              {message}
            </motion.p>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}