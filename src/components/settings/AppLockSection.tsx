import { useState } from 'react'
import { Lock, ScanFace, Trash2 } from 'lucide-react'
import { PillButton } from '@/components/ui/PillButton'
import { notify } from '@/utils/notify'
import {
  isLockEnabled, hasBiometric, webauthnSupported, enableLock, disableLock,
  lockTimeoutMinutes, setLockTimeoutMinutes,
} from '@/utils/appLock'
import { CollapsibleCard } from './shared'

export function AppLockSection() {
  const [lockEnabled, setLockEnabled] = useState(isLockEnabled())
  const [pinInput, setPinInput] = useState('')
  const [useFaceId, setUseFaceId] = useState(webauthnSupported())
  const [lockTimeout, setLockTimeout] = useState(lockTimeoutMinutes())

  function changeLockTimeout(minutes: number) {
    setLockTimeoutMinutes(minutes)
    setLockTimeout(minutes)
  }

  async function activateLock() {
    if (pinInput.length < 4) return
    try {
      const { biometric } = await enableLock(pinInput, useFaceId)
      setLockEnabled(true)
      setPinInput('')
      notify('App-Sperre aktiviert', biometric ? 'Face ID + PIN' : 'Nur PIN')
    } catch (e) {
      notify('Aktivierung fehlgeschlagen', e instanceof Error ? e.message : '')
    }
  }

  function deactivateLock() {
    disableLock()
    setLockEnabled(false)
  }

  return (
    <CollapsibleCard
      icon={<Lock size={15} className="text-white/40 shrink-0" />}
      title="App-Sperre"
      statusText={lockEnabled ? (hasBiometric() ? 'Face ID + PIN aktiv' : 'PIN aktiv') : 'Aus'}
    >
      {!lockEnabled ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-white/40">
            Beim Öffnen der App nach Face&nbsp;ID / Touch&nbsp;ID oder einer PIN fragen. Die PIN ist
            auch der Ersatz, falls die Biometrie nicht klappt.
          </p>
          <input
            type="password"
            inputMode="numeric"
            placeholder="PIN (4–8 Ziffern)"
            value={pinInput}
            onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
            className="w-full rounded-card_sm bg-white/4 border border-white/8 px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/40 transition-colors text-center tracking-[0.3em]"
          />
          {webauthnSupported() && (
            <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
              <input type="checkbox" checked={useFaceId} onChange={e => setUseFaceId(e.target.checked)} />
              <ScanFace size={14} className="text-purple-300/80" />
              Face&nbsp;ID / Touch&nbsp;ID verwenden
            </label>
          )}
          <PillButton size="sm" icon={<Lock size={13} />} onClick={activateLock} disabled={pinInput.length < 4}>
            Aktivieren
          </PillButton>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-white/40">
            {hasBiometric() ? 'Face ID / Touch ID + PIN aktiv.' : 'PIN aktiv.'} Wird beim nächsten Öffnen abgefragt.
          </p>
          <div>
            <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">
              Sperrt nach {lockTimeout} {lockTimeout === 1 ? 'Minute' : 'Minuten'} im Hintergrund
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 5, 10].map(m => (
                <button
                  key={m}
                  onClick={() => changeLockTimeout(m)}
                  className="flex-1 py-1.5 rounded-pill text-xs border transition-all duration-150"
                  style={{
                    backgroundColor: lockTimeout === m ? 'rgba(var(--acc-rgb),0.2)' : 'rgba(255,255,255,0.04)',
                    borderColor:     lockTimeout === m ? 'rgba(var(--acc-rgb),0.4)' : 'rgba(255,255,255,0.08)',
                    color:           lockTimeout === m ? 'var(--acc-soft)' : 'rgba(255,255,255,0.4)',
                  }}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>
          <PillButton variant="danger" size="sm" icon={<Trash2 size={13} />} onClick={deactivateLock}>
            Sperre deaktivieren
          </PillButton>
        </div>
      )}
    </CollapsibleCard>
  )
}
