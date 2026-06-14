import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useAnimate } from 'framer-motion'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

// Leg cadence: one tripod touchdown every STEP seconds. The body bob is tuned
// to this so the legs visually "carry" the ant.
const STEP = 0.16

const ANT_W = 102
const ANT_H = 64

const ANT_CSS = `
@keyframes ant-a { 0%,100%{transform:rotate(-26deg)} 50%{transform:rotate(28deg)} }
@keyframes ant-b { 0%,100%{transform:rotate(28deg)}  50%{transform:rotate(-26deg)} }
@keyframes ant-antenna { 0%,100%{transform:rotate(0deg)} 50%{transform:rotate(-7deg)} }
`

const LEG_ANIM = `${STEP * 2}s ease-in-out infinite`

function Leg({
  x1, y1, x2, y2, kf,
}: {
  x1: number; y1: number; x2: number; y2: number; kf: 'a' | 'b'
}) {
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke="white" strokeWidth={2.4} strokeLinecap="round"
      style={{ transformOrigin: `${x1}px ${y1}px`, animation: `ant-${kf} ${LEG_ANIM}` }}
    />
  )
}

function AntSvg() {
  return (
    <>
      <style>{ANT_CSS}</style>
      {/* Default orientation: head points left (-x). The wander loop rotates the
          whole ant so the head leads the direction of travel. */}
      <svg viewBox="0 0 102 64" width={ANT_W} height={ANT_H} aria-hidden>
        {/* Legs — drawn before body so body overlaps them.
            Mirrored geometry + same kf on top/bottom = opposite-phase tripod gait. */}
        {/* Front pair */}
        <Leg x1={33} y1={25} x2={18} y2={14} kf="a" />
        <Leg x1={33} y1={38} x2={18} y2={49} kf="a" />
        {/* Mid pair (opposite phase) */}
        <Leg x1={41} y1={23} x2={41} y2={11} kf="b" />
        <Leg x1={41} y1={40} x2={41} y2={52} kf="b" />
        {/* Back pair */}
        <Leg x1={49} y1={25} x2={63} y2={14} kf="a" />
        <Leg x1={49} y1={38} x2={63} y2={49} kf="a" />

        {/* Body segments */}
        <ellipse cx="74" cy="32" rx="20" ry="15" fill="white" />
        <ellipse cx="53" cy="32" rx="5" ry="4" fill="white" />
        <ellipse cx="40" cy="31" rx="14" ry="11" fill="white" />
        <ellipse cx="22" cy="30" rx="11" ry="10" fill="white" />

        {/* Antennae — twitch slightly out of phase to feel alive */}
        <g style={{ transformOrigin: '17px 22px', animation: `ant-antenna ${STEP * 5}s ease-in-out infinite` }}>
          <line x1="17" y1="22" x2="7" y2="11" stroke="white" strokeWidth={1.8} strokeLinecap="round" />
          <circle cx="7" cy="11" r="2.2" fill="white" />
        </g>
        <g style={{ transformOrigin: '26px 21px', animation: `ant-antenna ${STEP * 5}s ease-in-out infinite`, animationDelay: `${STEP}s` }}>
          <line x1="26" y1="21" x2="20" y2="9" stroke="white" strokeWidth={1.8} strokeLinecap="round" />
          <circle cx="20" cy="9" r="2.2" fill="white" />
        </g>

        {/* Eye */}
        <circle cx="18" cy="28" r="3" fill="rgba(0,0,0,0.35)" />
        <circle cx="17" cy="27" r="1.2" fill="white" />
      </svg>
    </>
  )
}

const rand = (min: number, max: number) => min + Math.random() * (max - min)
const wait = (ms: number) => new Promise(res => setTimeout(res, ms))

function WanderingAnt() {
  const [posScope, animatePos] = useAnimate()    // 2D position (translate)
  const [headScope, animateHead] = useAnimate()  // facing direction (rotate)
  const init = useRef({
    x: (window.innerWidth - ANT_W) / 2,
    y: (window.innerHeight - ANT_H) / 2,
  })

  useEffect(() => {
    let active = true
    const margin = 28
    let cur = { ...init.current }
    let curRot = 0  // accumulated rotation so turns always take the short way round

    async function loop() {
      while (active) {
        // Pick a random destination anywhere on screen
        const target = {
          x: rand(margin, window.innerWidth - ANT_W - margin),
          y: rand(margin, window.innerHeight - ANT_H - margin),
        }
        const dx = target.x - cur.x
        const dy = target.y - cur.y
        const dist = Math.hypot(dx, dy)

        // Head leads travel. Default forward = 180° (head points -x).
        const desired = (Math.atan2(dy, dx) * 180) / Math.PI - 180
        const delta = ((desired - curRot + 540) % 360) - 180
        curRot += delta

        // Turn to face the destination
        await animateHead(headScope.current, { rotate: curRot }, { duration: 0.35, ease: 'easeInOut' })
        if (!active) break

        // Scurry there — speed scales with distance, with a sensible floor
        await animatePos(posScope.current, { x: target.x, y: target.y }, {
          duration: Math.max(0.45, dist / 260),
          ease: [0.45, 0, 0.55, 1],
        })
        if (!active) break
        cur = target

        // Settle, then itch/groom in place: rapid little jitters around heading.
        // (Legs keep cycling via CSS, so it reads as fidgeting.)
        await wait(rand(150, 350))
        if (!active) break
        await animateHead(headScope.current, {
          rotate: [curRot, curRot - 7, curRot + 6, curRot - 5, curRot + 4, curRot - 2, curRot],
        }, { duration: rand(0.5, 0.8), ease: 'easeInOut' })
        if (!active) break
        await wait(rand(120, 400))
      }
    }

    loop()
    return () => { active = false }
  }, [animatePos, animateHead, headScope, posScope])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        ref={posScope}
        className="absolute top-0 left-0"
        style={{ x: init.current.x, y: init.current.y }}
      >
        <motion.div ref={headScope}>
          {/* Step bob + slight body tilt, synced to leg touchdowns */}
          <motion.div
            animate={{ y: [0, -3, 0], rotate: [-1.2, 1.2, -1.2] }}
            transition={{ duration: STEP * 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <AntSvg />
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  )
}

interface AntLoaderProps {
  show: boolean
  message?: string
  onClose?: () => void
}

export function AntLoader({ show, message, onClose }: AntLoaderProps) {
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
            className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>

          {/* Wandering ant */}
          <WanderingAnt />

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
