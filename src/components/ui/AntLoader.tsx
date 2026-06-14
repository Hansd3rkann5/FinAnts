import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion, AnimatePresence, useAnimate } from 'framer-motion'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

// Limb motion: every leg and antenna shares one keyframe but supplies its own
// swing range (via the --lo/--hi CSS custom props) plus a slightly detuned
// duration and delay. The six legs therefore drift through a loose tripod gait
// instead of moving in lockstep — it reads as a live, scurrying insect rather
// than a rigid mechanism. The body bob is tuned to this base cadence.
const LEG_DUR = 0.9

const ANT_W = 126
const ANT_H = 90

const ANT_CSS = `
@keyframes ant-leg     { 0%,100%{transform:rotate(var(--lo))} 50%{transform:rotate(var(--hi))} }
@keyframes ant-antenna { 0%,100%{transform:rotate(var(--lo))} 50%{transform:rotate(var(--hi))} }
`

interface LimbAnim { dur: number; delay: number; lo: number; hi: number }

const limbStyle = (ox: number, oy: number, kf: 'leg' | 'antenna', a: LimbAnim): CSSProperties => ({
  transformOrigin: `${ox}px ${oy}px`,
  animation: `ant-${kf} ${a.dur}s ease-in-out ${a.delay}s infinite`,
  ['--lo' as string]: `${a.lo}deg`,
  ['--hi' as string]: `${a.hi}deg`,
} as CSSProperties)

function Leg({ d, ox, oy, ...a }: { d: string; ox: number; oy: number } & LimbAnim) {
  return (
    <path
      d={d} fill="none" stroke="url(#antLeg)" strokeWidth={2.4} strokeLinecap="round"
      style={limbStyle(ox, oy, 'leg', a)}
    />
  )
}

function Antenna({ d, ox, oy, tipX, tipY, ...a }: {
  d: string; ox: number; oy: number; tipX: number; tipY: number
} & LimbAnim) {
  return (
    <g style={limbStyle(ox, oy, 'antenna', a)}>
      <path d={d} fill="none" stroke="url(#antLeg)" strokeWidth={1.8} strokeLinecap="round" />
      <circle cx={tipX} cy={tipY} r={2.3} fill="#a78bfa" />
    </g>
  )
}

function AntSvg() {
  return (
    <>
      <style>{ANT_CSS}</style>
      {/* Default orientation: head points left (-x). The wander loop rotates the
          whole ant so the head leads the direction of travel.
          Top-down silhouette — round head, slim waist nodes, large pointed
          gaster, slender curved legs and elbowed antennae — tinted with the
          FinAnts purple→blue sheen and a soft brand glow so it reads on the
          dark overlay. */}
      <svg
        viewBox="0 0 126 90" width={ANT_W} height={ANT_H} aria-hidden
        style={{ filter: 'drop-shadow(0 0 7px rgba(139,92,246,0.55)) drop-shadow(0 0 14px rgba(59,130,246,0.35))' }}
      >
        <defs>
          {/* Dark glossy body with violet→blue rim sheen */}
          <linearGradient id="antBody" x1="0" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stopColor="#7c5cff" />
            <stop offset="38%" stopColor="#3b1d8f" />
            <stop offset="72%" stopColor="#1a1033" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
          <linearGradient id="antLeg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          {/* Top-down glossy highlight */}
          <linearGradient id="antGloss" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.7)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>

        {/* Legs — drawn before the body so it overlaps their roots. Each swings
            on its own detuned cycle; the delays group them into a loose,
            organic tripod (front-top/hind-top/mid-bot vs the opposite three). */}
        <Leg d="M42 40 C 35 31, 22 23, 13 13" ox={42} oy={40} dur={0.92} delay={0}     lo={-18} hi={9}  />
        <Leg d="M55 40 C 65 31, 77 22, 87 13" ox={55} oy={40} dur={0.88} delay={-0.05} lo={-15} hi={11} />
        <Leg d="M49 51 C 49 62, 47 73, 47 83" ox={49} oy={51} dur={0.95} delay={-0.02} lo={-13} hi={13} />
        <Leg d="M42 50 C 35 59, 22 67, 13 77" ox={42} oy={50} dur={0.90} delay={-0.46} lo={-9}  hi={17} />
        <Leg d="M55 50 C 65 59, 77 68, 87 77" ox={55} oy={50} dur={0.86} delay={-0.50} lo={-11} hi={15} />
        <Leg d="M49 39 C 49 28, 47 17, 47 7"  ox={49} oy={39} dur={0.93} delay={-0.47} lo={-13} hi={13} />

        {/* Body segments — pointed gaster, slim waist nodes, thorax, round head */}
        <path
          d="M118 45 C112 58 104 63 92 63 C78 63 70 56 70 45 C70 34 78 27 92 27 C104 27 112 32 118 45 Z"
          fill="url(#antBody)"
        />
        <circle cx="67" cy="45" r="4"   fill="url(#antBody)" />
        <circle cx="60" cy="45" r="3.3" fill="url(#antBody)" />
        <ellipse cx="47" cy="45" rx="9" ry="7" fill="url(#antBody)" />
        <circle cx="26" cy="45" r="11" fill="url(#antBody)" />

        {/* Glossy highlights along the top */}
        <ellipse cx="90" cy="35" rx="16" ry="4.5" fill="url(#antGloss)" opacity={0.55} />
        <ellipse cx="46" cy="40" rx="6"  ry="2.8" fill="url(#antGloss)" opacity={0.7} />
        <ellipse cx="24" cy="39" rx="7"  ry="3"   fill="url(#antGloss)" opacity={0.75} />

        {/* Antennae — each twitches on its own slower cycle */}
        <Antenna d="M20 39 Q 10 30, 3 22" ox={20} oy={39} tipX={3} tipY={22} dur={1.1}  delay={0}    lo={-7} hi={6}  />
        <Antenna d="M20 51 Q 10 60, 3 68" ox={20} oy={51} tipX={3} tipY={68} dur={1.35} delay={-0.4} lo={7}  hi={-5} />

        {/* Eye — bright reflective glint like the logo */}
        <circle cx="22" cy="42" r="3.2" fill="#0b0820" />
        <circle cx="21" cy="40.8" r="1.4" fill="rgba(255,255,255,0.95)" />
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
            animate={{ y: [0, -2, 0], rotate: [-1, 1, -1] }}
            transition={{ duration: LEG_DUR, repeat: Infinity, ease: 'easeInOut' }}
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
            className="absolute right-4 z-10 w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
            style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
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
