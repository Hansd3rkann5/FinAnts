import { useState } from 'react'
import { ShieldCheck, Trash2 } from 'lucide-react'
import { PillButton } from '@/components/ui/PillButton'
import { isSitePinEnabled, enableSitePin, disableSitePin, markSitePinUnlocked } from '@/utils/sitePin'
import { CollapsibleCard } from './shared'
import { notify } from '@/utils/notify'

export function SitePinSection() {
  const [enabled, setEnabled] = useState(isSitePinEnabled)
  const [pinInput, setPinInput] = useState('')

  async function handleEnable() {
    if (pinInput.length < 4) return
    await enableSitePin(pinInput)
    markSitePinUnlocked() // current session stays unlocked
    setEnabled(true)
    setPinInput('')
    notify('Zugangscode aktiviert', `${pinInput.length}-stelliger Code gesetzt`)
  }

  function handleDisable() {
    disableSitePin()
    setEnabled(false)
    notify('Zugangscode entfernt', '')
  }

  return (
    <CollapsibleCard
      icon={<ShieldCheck size={15} className="text-emerald-400 shrink-0" />}
      title="Zugangscode"
      statusText={enabled ? 'Aktiv · wird beim Öffnen abgefragt' : 'Aus'}
    >
      {!enabled ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-white/40">
            Beim Aufrufen der Seite in einem neuen Tab oder Browser wird ein PIN abgefragt — unabhängig von der In-App-Sperre.
          </p>
          <input
            type="password"
            inputMode="numeric"
            placeholder="PIN (4–8 Ziffern)"
            value={pinInput}
            onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
            onKeyDown={e => e.key === 'Enter' && handleEnable()}
            className="w-full rounded-card_sm bg-white/4 border border-white/8 px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-emerald-500/40 transition-colors text-center tracking-[0.3em]"
          />
          <PillButton size="sm" icon={<ShieldCheck size={13} />} onClick={handleEnable} disabled={pinInput.length < 4}>
            Aktivieren
          </PillButton>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-white/40">
            Zugangscode ist aktiv. Beim nächsten Öffnen in einem neuen Tab oder Browser wird er abgefragt.
          </p>
          <PillButton variant="danger" size="sm" icon={<Trash2 size={13} />} onClick={handleDisable}>
            Zugangscode entfernen
          </PillButton>
        </div>
      )}
    </CollapsibleCard>
  )
}
