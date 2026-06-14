import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

// Brand palette from the app logo — consecutive lines cycle through these so
// each new chart line is a different colour from the one it replaces.
const COLORS = ['#7c5cff', '#a78bfa', '#6366f1', '#3b82f6', '#2563eb', '#8b5cf6']

// Normalised drawing surface. preserveAspectRatio="none" stretches it to fill
// the (padded) window; non-scaling strokes keep the lines crisp regardless.
const VB_W = 100
const VB_H = 60
const PAD_X = 3   // keep end points off the very edge
const PAD_Y = 9   // vertical breathing room for the random y-values
const POINTS = 5

// Lifecycle of a single line (seconds):
//   draw  → revealed left→right (ease-in-out)
//   hold  → fully drawn, held while its successor draws its first segment
//   erase → wiped left→right (ease-in-out)
// A new line spawns every LIFE/2 seconds, so the steady state always holds
// exactly two lines: the old one erasing left→right while the new one draws
// left→right. The draw:hold:erase = 2:1:2 ratio keeps the old line's erase
// front exactly one segment behind the new line's draw front — i.e. the two
// lines overlap by a single x-segment during the handoff.
const DRAW = 1.4
const HOLD = 0.7
const ERASE = 1.4
const LIFE = DRAW + HOLD + ERASE
const SPAWN = LIFE / 2

const rand = (min: number, max: number) => min + Math.random() * (max - min)

function makePath(): string {
  const span = VB_W - PAD_X * 2
  const pts = Array.from({ length: POINTS }, (_, i) => {
    const x = PAD_X + (i / (POINTS - 1)) * span
    const y = rand(PAD_Y, VB_H - PAD_Y)
    return `${x.toFixed(1)} ${y.toFixed(1)}`
  })
  return `M ${pts.join(' L ')}`
}

function ChartLine({ d, color, onDone }: { d: string; color: string; onDone: () => void }) {
  return (
    <motion.path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
      pathLength={1}
      strokeDasharray={1}
      initial={{ strokeDashoffset: 1 }}
      // 1→0 draws the line in from the left; 0→-1 wipes it away from the left.
      animate={{ strokeDashoffset: [1, 0, 0, -1] }}
      transition={{
        duration: LIFE,
        times: [0, DRAW / LIFE, (DRAW + HOLD) / LIFE, 1],
        ease: ['easeInOut', 'linear', 'easeInOut'],
      }}
      onAnimationComplete={onDone}
    />
  )
}

interface Line { id: number; d: string; color: string }

function ChartAnimation() {
  const [lines, setLines] = useState<Line[]>([])

  useEffect(() => {
    let id = 0
    let colorIdx = 0
    const spawn = () => {
      const line: Line = { id: id++, d: makePath(), color: COLORS[colorIdx++ % COLORS.length] }
      setLines(prev => [...prev, line])
    }
    spawn()
    const iv = setInterval(spawn, SPAWN * 1000)
    return () => clearInterval(iv)
  }, [])

  return (
    <div
      className="w-full h-full"
      style={{ filter: 'drop-shadow(0 0 8px rgba(124,92,255,0.35))' }}
    >
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" width="100%" height="100%">
        {lines.map(l => (
          <ChartLine
            key={l.id}
            d={l.d}
            color={l.color}
            onDone={() => setLines(prev => prev.filter(x => x.id !== l.id))}
          />
        ))}
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

  // Reset the dismiss flag whenever a fresh loading episode begins
  useEffect(() => { if (show) setDismissed(false) }, [show])

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
