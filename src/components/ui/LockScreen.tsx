import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ScanFace, Delete } from 'lucide-react'
import { hasBiometric, verifyBiometric, verifyPin, pinLength } from '@/utils/appLock'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const biometric = hasBiometric()
  const len = pinLength()
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const tryBiometric = useCallback(async () => {
    if (!biometric || busy) return
    setBusy(true)
    const ok = await verifyBiometric()
    setBusy(false)
    if (ok) onUnlock()
  }, [biometric, busy, onUnlock])

  // Prompt Face ID automatically on open.
  useEffect(() => {
    if (biometric) void tryBiometric()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-submit once the PIN reaches the stored length.
  useEffect(() => {
    if (len > 0 && pin.length === len) {
      verifyPin(pin).then(ok => {
        if (ok) onUnlock()
        else { setError(true); setTimeout(() => { setError(false); setPin('') }, 500) }
      })
    }
  }, [pin, len, onUnlock])

  function press(k: string) {
    if (k === 'del') { setPin(p => p.slice(0, -1)); return }
    if (!k || error) return
    setPin(p => (p.length >= len ? p : p + k))
  }

  return (
    <div className="fixed inset-0 z-250 flex flex-col items-center justify-center bg-bg-base text-white px-8"
         style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex flex-col items-center gap-6 w-full max-w-xs">
        <div className="text-3xl">🐜</div>
        <p className="text-sm text-white/50">FinAnts ist gesperrt</p>

        {/* PIN dots */}
        <motion.div
          className="flex gap-3 h-4"
          animate={error ? { x: [-8, 8, -6, 6, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
        >
          {Array.from({ length: len }).map((_, i) => (
            <span
              key={i}
              className="w-3 h-3 rounded-full border transition-colors"
              style={{
                borderColor: error ? 'rgba(248,113,113,0.7)' : 'rgba(255,255,255,0.3)',
                backgroundColor: i < pin.length ? (error ? 'rgba(248,113,113,0.8)' : 'rgba(167,139,250,0.9)') : 'transparent',
              }}
            />
          ))}
        </motion.div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {KEYS.map((k, i) => (
            <button
              key={i}
              onClick={() => press(k)}
              disabled={!k}
              className={`h-16 rounded-card_sm flex items-center justify-center text-2xl font-light transition-colors ${
                k ? 'bg-white/6 border border-white/8 active:bg-white/15' : 'opacity-0 pointer-events-none'
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
