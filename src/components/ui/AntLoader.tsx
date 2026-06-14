import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'

const ANT_CSS = `
@keyframes ant-a { 0%,100%{transform:rotate(-24deg)} 50%{transform:rotate(24deg)} }
@keyframes ant-b { 0%,100%{transform:rotate(24deg)}  50%{transform:rotate(-24deg)} }
`

const T = '0.28s ease-in-out infinite'

function Leg({
  x1, y1, x2, y2, kf,
}: {
  x1: number; y1: number; x2: number; y2: number; kf: 'a' | 'b'
}) {
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke="white" strokeWidth={2.4} strokeLinecap="round"
      style={{ transformOrigin: `${x1}px ${y1}px`, animation: `ant-${kf} ${T}` }}
    />
  )
}

function AntSvg() {
  return (
    <>
      <style>{ANT_CSS}</style>
      <svg viewBox="0 0 102 64" width="102" height="64" aria-hidden>
        {/* Legs — drawn before body so body overlaps them.
            kf "a" starts at -24deg, "b" at +24deg. Due to mirrored leg geometry,
            same kf on top+bottom creates natural opposite-phase motion (tripod gait). */}
        {/* Front pair */}
        <Leg x1={33} y1={25} x2={18} y2={14} kf="a" />
        <Leg x1={33} y1={38} x2={18} y2={49} kf="a" />
        {/* Mid pair (opposite phase to front/back) */}
        <Leg x1={41} y1={23} x2={41} y2={11} kf="b" />
        <Leg x1={41} y1={40} x2={41} y2={52} kf="b" />
        {/* Back pair */}
        <Leg x1={49} y1={25} x2={63} y2={14} kf="a" />
        <Leg x1={49} y1={38} x2={63} y2={49} kf="a" />

        {/* Body segments */}
        {/* Gaster (abdomen) */}
        <ellipse cx="74" cy="32" rx="20" ry="15" fill="white" />
        {/* Petiole (waist) */}
        <ellipse cx="53" cy="32" rx="5" ry="4" fill="white" />
        {/* Mesosoma (thorax) */}
        <ellipse cx="40" cy="31" rx="14" ry="11" fill="white" />
        {/* Head */}
        <ellipse cx="22" cy="30" rx="11" ry="10" fill="white" />

        {/* Antennae */}
        <line x1="17" y1="22" x2="7" y2="11"
          stroke="white" strokeWidth={1.8} strokeLinecap="round" />
        <circle cx="7" cy="11" r="2.2" fill="white" />
        <line x1="26" y1="21" x2="20" y2="9"
          stroke="white" strokeWidth={1.8} strokeLinecap="round" />
        <circle cx="20" cy="9" r="2.2" fill="white" />

        {/* Eye */}
        <circle cx="18" cy="28" r="3" fill="rgba(0,0,0,0.35)" />
        <circle cx="17" cy="27" r="1.2" fill="white" />
      </svg>
    </>
  )
}

interface AntLoaderProps {
  show: boolean
  message?: string
}

export function AntLoader({ show, message }: AntLoaderProps) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-200 flex flex-col items-center justify-center gap-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Blurred backdrop */}
          <div className="absolute inset-0 backdrop-blur-2xl bg-black/60" />

          {/* Traversing ant */}
          <div className="relative z-10 w-full h-24 overflow-hidden">
            <motion.div
              className="absolute top-1/2 -translate-y-1/2"
              animate={{ x: [-120, (typeof window !== 'undefined' ? window.innerWidth : 400) + 120] }}
              transition={{ duration: 3.8, repeat: Infinity, ease: 'linear', repeatDelay: 0.2 }}
            >
              <AntSvg />
            </motion.div>
          </div>

          {/* Message */}
          {message && (
            <motion.p
              className="relative z-10 text-xs text-white/45 tracking-[0.2em] uppercase"
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
