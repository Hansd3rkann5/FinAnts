import { useState } from 'react'
import { Wallet } from 'lucide-react'
import { PillButton } from '@/components/ui/PillButton'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { useManualBalance } from '@/hooks/useManualBalance'
import { formatEur } from '@/utils/format'
import { CollapsibleCard } from './shared'

export function ManualBalanceSection() {
  const { accounts } = useTransactionsCtx()
  const { baseBalance: manualBalance, updatedAt: balanceUpdatedAt, save: saveBalance } = useManualBalance()
  const [balanceInput, setBalanceInput] = useState(
    manualBalance !== null ? String(manualBalance).replace('.', ',') : ''
  )

  function handleSaveBalance() {
    const parsed = parseFloat(balanceInput.replace(',', '.'))
    if (!isNaN(parsed)) saveBalance(parsed)
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
        Aktueller Kontostand aus deiner Banking-App. Wird angezeigt bis der automatische Sync aktiv ist.
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
      {balanceUpdatedAt && (
        <p className="text-[10px] text-white/25 mt-2">Zuletzt aktualisiert: {balanceUpdatedAt}</p>
      )}
    </CollapsibleCard>
  )
}
