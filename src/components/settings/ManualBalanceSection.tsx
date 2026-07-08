import { useState, useRef, useEffect } from 'react'
import { Wallet } from 'lucide-react'
import { PillButton } from '@/components/ui/PillButton'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { useManualBalance } from '@/hooks/useManualBalance'
import { formatEur } from '@/utils/format'
import { CollapsibleCard, StatusBanner, type ImportStatus } from './shared'

export function ManualBalanceSection() {
  const { accounts, transactions } = useTransactionsCtx()
  const { baseBalance: manualBalance, updatedAt: balanceUpdatedAt, save: saveBalance } = useManualBalance()
  const [balanceInput, setBalanceInput] = useState(
    manualBalance !== null ? String(manualBalance).replace('.', ',') : ''
  )
  const [status, setStatus] = useState<ImportStatus>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const statusTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(statusTimer.current), [])

  function handleSaveBalance() {
    const parsed = parseFloat(balanceInput.replace(',', '.'))
    clearTimeout(statusTimer.current)
    if (isNaN(parsed)) {
      setStatus('error')
      setStatusMessage('Ungültiger Betrag – bitte eine Zahl wie 1234,56 eingeben.')
      return
    }
    // Booking dates have no time of day, so remember which of today's (and
    // later-dated) booked transactions are already reflected in this balance —
    // a later sync the same day then only applies the genuinely new ones.
    const dayStart = new Date().setHours(0, 0, 0, 0)
    const knownIds = transactions
      .filter(t => !t.isPending && t.date.getTime() >= dayStart)
      .map(t => t.id)
    saveBalance(parsed, knownIds)
    setStatus('success')
    setStatusMessage(`Kontostand ${formatEur(parsed)} gespeichert.`)
    statusTimer.current = setTimeout(() => setStatus('idle'), 4000)
  }

  return (
    <CollapsibleCard
      icon={<Wallet size={15} className="text-emerald-400 shrink-0" />}
      title="Kontostand"
      statusText={manualBalance !== null
        ? `${formatEur(manualBalance)} · Aktualisiert ${balanceUpdatedAt}`
        : 'Nicht gesetzt · Manuell eingetragen'}
      defaultOpen={manualBalance === null && accounts.length === 0}
    >
      <p className="text-xs text-white/40 mb-3">
        Aktueller Kontostand aus deiner Banking-App. Überschreibt den Giro-Kontostand, bis der nächste automatische Sync einen neueren Stand liefert.
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/40">€</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={balanceInput}
            onChange={e => setBalanceInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSaveBalance()}
            className="w-full rounded-card_sm bg-white/4 border border-white/8 pl-7 pr-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-emerald-500/40 transition-colors duration-200"
          />
        </div>
        <PillButton variant="secondary" size="sm" disabled={!balanceInput} onClick={handleSaveBalance}>
          Speichern
        </PillButton>
      </div>
      {status !== 'idle' && (
        <div className="mt-3">
          <StatusBanner status={status} message={statusMessage} />
        </div>
      )}
      {balanceUpdatedAt && (
        <p className="text-[10px] text-white/25 mt-2">Zuletzt aktualisiert: {balanceUpdatedAt}</p>
      )}
    </CollapsibleCard>
  )
}
