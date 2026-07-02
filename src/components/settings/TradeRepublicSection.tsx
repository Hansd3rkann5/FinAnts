import { AnimatePresence } from 'framer-motion'
import { LineChart } from 'lucide-react'
import { PillButton } from '@/components/ui/PillButton'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { useTradeRepublic } from '@/hooks/useTradeRepublic'
import { TRADE_REPUBLIC_IBAN } from '@/utils/tradeRepublicParser'
import { CollapsibleCard, StatusBanner, workerCfg } from './shared'

export function TradeRepublicSection() {
  const { applyServerTransactions, upsertAccount } = useTransactionsCtx()

  // Creates/updates the depot's entry in the accounts list with the *live*
  // portfolio value the worker just fetched (cash + current market value of
  // holdings) — never derived from transaction history, which would just be
  // net cash flow.
  function handleTrPortfolioValue(value: number) {
    upsertAccount({
      iban: TRADE_REPUBLIC_IBAN, blz: '', accountNumber: '', owner: '',
      description: 'Trade Republic', type: 'depot', currency: 'EUR',
      balance: value, balanceDate: new Date().toISOString().slice(0, 10),
    })
  }

  const { start: trStart, status: trStatus, message: trMessage } = useTradeRepublic(applyServerTransactions, handleTrPortfolioValue)

  return (
    <CollapsibleCard
      icon={<LineChart size={15} className="text-emerald-400 shrink-0" />}
      title="Trade Republic"
      glow="purple"
      statusText={trStatus === 'success' ? 'Verbunden' : 'Depot-Sync (inoffizielle API)'}
    >
      <p className="text-xs text-white/40 mb-4">
        Verbindet sich direkt mit Trade Republic (kein offizieller API-Zugang —
        reverse-engineert, ähnlich wie pytr). Bestätigung per Push in der TR-App,
        keine SMS/Code nötig.
      </p>
      <div className="flex flex-col gap-3">
        <PillButton
          variant="primary"
          size="sm"
          disabled={trStatus === 'starting' || trStatus === 'awaiting_approval' || trStatus === 'syncing'}
          icon={<LineChart size={13} className={trStatus === 'starting' || trStatus === 'syncing' ? 'animate-pulse' : ''} />}
          onClick={() => trStart(workerCfg)}
        >
          {trStatus === 'starting'           ? 'Starte Verbindung…'
           : trStatus === 'awaiting_approval' ? 'Bestätige in der App…'
           : trStatus === 'syncing'           ? 'Synchronisiere…'
           : trStatus === 'success'           ? 'Erneut synchronisieren'
           : 'Mit Trade Republic verbinden'}
        </PillButton>
        <AnimatePresence>
          {(trStatus === 'success' || trStatus === 'error') && (
            <StatusBanner status={trStatus === 'success' ? 'success' : 'error'} message={trMessage} />
          )}
        </AnimatePresence>
      </div>
    </CollapsibleCard>
  )
}
