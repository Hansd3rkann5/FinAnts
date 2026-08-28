import { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Delete, Check, X } from 'lucide-react'
import { verifySitePin, sitePinLength } from '@/utils/sitePin'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']
const DOT_PITCH = 24

type Phase = 'input' | 'merge' | 'success' | 'failure'

export function SitePinGate({ onUnlock }: { onUnlock: () => void }) {
  const len = sitePinLength()
  const [pin, setPin] = useState('')
  const [phase, setPhase] = useState<Phase>('input')

  const runVerify = useCallback(async (fullPin: string) => {
    const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
    await wait(180)
    setPhase('merge')
    const ok = await verifySitePin(fullPin)
    await wait(300)
    setPhase(ok ? 'success' : 'failure')
    if (ok) {
      await wait(500)
      onUnlock()
    } else {
      await wait(900)
      setPin('')
      setPhase('input')
    }
  }, [onUnlock])

  function press(k: string) {
    if (phase !== 'input') return
    if (k === 'del') { setPin(p => p.slice(0, -1)); return }
    if (!k || pin.length >= len) return
    const next = pin + k
    setPin(next)
    if (next.length === len) void runVerify(next)
  }

  const merged = phase !== 'input'
  const centerIdx = (len - 1) / 2

  return (
    <div
      className="fixed inset-0 z-250 flex flex-col items-center justify-center text-white px-8"
      style={{
        background: 'rgba(9,9,15,0.97)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="flex flex-col items-center gap-6 w-full max-w-xs">
        <p className="text-center text-[30px] text-white/45 tracking-[0.2em] pl-2 uppercase">FinAnts</p>
        <p className="text-sm text-white/40">Zugangscode eingeben</p>

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
                backgroundColor: i < pin.length ? 'rgba(var(--acc-dot-rgb),0.9)' : 'transparent',
                willChange: 'transform, opacity',
              }}
            />
          ))}

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
                  backgroundColor: phase === 'success' ? 'rgba(52,211,3,0.9)' : 'rgba(248,50,50,0.9)',
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
              style={{ borderRadius: '999px' }}
              className={`h-16 flex items-center justify-center text-2xl font-light transition-colors ${
                k ? 'active:bg-white/15' : 'opacity-0 pointer-events-none'
              }`}
            >
              {k === 'del' ? <Delete size={22} className="text-white/60" /> : k}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
