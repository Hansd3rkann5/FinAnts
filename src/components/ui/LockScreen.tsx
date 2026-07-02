import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScanFace, Delete, Check, X } from 'lucide-react'
import { hasBiometric, verifyBiometric, verifyPin, pinLength } from '@/utils/appLock'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

// Dot pitch: w-3 (12px) dots + gap-3 (12px) → 24px between dot centers.
const DOT_PITCH = 24

// input → (4th dot visibly fills) → merge (dots slide together) → success/
// failure (single dot with check/X) → unlock, or expand back to empty dots.
type Phase = 'input' | 'merge' | 'success' | 'failure'

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const biometric = hasBiometric()
  const len = pinLength()
  const [pin, setPin] = useState('')
  const [phase, setPhase] = useState<Phase>('input')
  const [busy, setBusy] = useState(false)

  const tryBiometric = useCallback(async () => {
    if (!biometric || busy) return
    setBusy(true)
    const ok = await verifyBiometric()
    setBusy(false)
    if (ok) onUnlock()
  }, [biometric, busy, onUnlock])

  // Prompt Face ID automatically on open — deferred a tick so the effect body
  // doesn't set state synchronously (avoids a cascading re-render).
  useEffect(() => {
    if (!biometric) return
    const t = setTimeout(() => void tryBiometric(), 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Full PIN entered: let the last dot render, merge the dots, show the
  // verify result, then unlock (or reset). One linear sequence — effects
  // keyed on `phase` proved racy (their cleanup cancelled pending timers
  // whenever the phase they themselves set triggered a re-run).
  async function runVerify(fullPin: string) {
    const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
    await wait(180)               // let the 4th dot visibly fill
    setPhase('merge')
    const ok = await verifyPin(fullPin)
    await wait(300)               // merge animation
    setPhase(ok ? 'success' : 'failure')
    if (ok) {
      await wait(600)             // green check moment
      onUnlock()
    } else {
      await wait(900)             // red X + shake
      setPin('')
      setPhase('input')
    }
  }

  function press(k: string) {
    if (phase !== 'input') return
    if (k === 'del') { setPin(p => p.slice(0, -1)); return }
    if (!k || pin.length >= len) return
    const next = pin + k
    setPin(next)
    if (len > 0 && next.length === len) void runVerify(next)
  }

  const merged = phase !== 'input'
  const centerIdx = (len - 1) / 2

  return (
    <div className="fixed inset-0 z-250 flex flex-col items-center justify-center text-white px-8"
      style={{
        backgroundColor: 'rgba(26,26,40,0.6)',
        paddingTop: 'env(safe-area-inset-top)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}>
      <div className="flex flex-col items-center gap-6 w-full max-w-xs">
        <p className="text-center text-[30px] text-white/45 tracking-[0.2em] pl-2 uppercase">FinAnts</p>
        <p className="text-sm text-white/50">Gesperrt</p>

        {/* PIN dots */}
        <motion.div
          className="relative flex items-center justify-center gap-3 h-8"
          animate={phase === 'failure' ? { x: [-8, 8, -6, 6, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
          style={{ willChange: 'transform' }}
        >
          {Array.from({ length: len }).map((_, i) => (
            <motion.span
              key={i}
              className="w-3 h-3 rounded-full border"
              animate={{
                x: merged ? (centerIdx - i) * DOT_PITCH : 0,
                opacity: (phase === 'success' || phase === 'failure') ? 0 : 1,
                scale: merged ? 0.8 : 1,
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              style={{
                borderColor: 'rgba(255,255,255,0.3)',
                backgroundColor: i < pin.length ? 'rgba(167,139,250,0.9)' : 'transparent',
                // Own compositing layer — without this, WebKit leaves stale
                // pixel trails when transforming inside the backdrop-blurred
                // lock overlay.
                willChange: 'transform, opacity',
              }}
            />
          ))}

          {/* Result dot: grows out of the merged dots, then either unlocks or
              hands back to the expanding empty dots. */}
          <AnimatePresence>
            {(phase === 'success' || phase === 'failure') && (
              <motion.span
                key={phase}
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.3, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                className="absolute w-8 h-8 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: phase === 'success' ? 'rgba(52,211,153,0.9)' : 'rgba(248,113,113,0.9)',
                  willChange: 'transform, opacity',
                }}
              >
                {phase === 'success'
                  ? <Check size={18} strokeWidth={3} className="text-white" />
                  : <X size={18} strokeWidth={3} className="text-white" />}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {KEYS.map((k, i) => (
            <button
              key={i}
              onClick={() => press(k)}
              disabled={!k}
              style={
                { borderRadius: '999px', }
              }
              className={`h-16 flex items-center justify-center text-2xl font-light transition-colors ${k ? ' active:bg-white/15' : 'opacity-0 pointer-events-none'
                }`}
            >
              {k === 'del' ? <Delete size={22} className="text-white/60" /> : k}
            </button>
          ))}
        </div>

        {biometric && (
          <button
            onClick={tryBiometric}
            disabled={busy}
            className="flex items-center gap-2 text-sm text-purple-300/80 hover:text-purple-300 disabled:opacity-50 transition-colors"
          >
            <ScanFace size={18} />
            Mit Face ID entsperren
          </button>
        )}
      </div>
    </div>
  )
}
