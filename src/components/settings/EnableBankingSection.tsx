import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Link2 } from 'lucide-react'
import type { Account } from '@/types'
import { PillButton } from '@/components/ui/PillButton'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { useEnableBanking } from '@/hooks/useEnableBanking'
import { CollapsibleCard, StatusBanner, workerCfg, type OnLoader } from './shared'

export function EnableBankingSection({ isAuth, onLoader }: { isAuth: boolean; onLoader: OnLoader }) {
  const { applyServerTransactions, upsertAccount, markNew } = useTransactionsCtx()
  const [ebBank,    setEbBank]    = useState('Commerzbank')
  const [ebCountry, setEbCountry] = useState('DE')
  const [ebDays,    setEbDays]    = useState(30)

  const onEbAccounts = useCallback(
    (incoming: Omit<Account, 'included'>[]) => { for (const a of incoming) upsertAccount(a) },
    [upsertAccount],
  )
  const { start: ebStart, status: ebStatus, message: ebMessage, lastSync: ebLastSync } =
    useEnableBanking(applyServerTransactions, onEbAccounts, markNew)

  useEffect(() => {
    onLoader(
      ebStatus === 'syncing'  ? 'Buchungen werden abgerufen…'
      : ebStatus === 'starting' ? 'Verbindung wird aufgebaut…'
      : null,
    )
  }, [ebStatus, onLoader])

  return (
    <CollapsibleCard
      icon={<Link2 size={15} className="text-blue-400 shrink-0" />}
      title="Bankabfrage (PSD2)"
      glow="blue"
      badge={ebLastSync
        ? <span className="text-[10px] text-blue-400/70 border border-blue-500/20 bg-blue-500/10 rounded-pill px-2 py-0.5">Verbunden</span>
        : undefined}
      statusText={ebLastSync ? `Zuletzt: ${ebLastSync}` : 'Offizielle PSD2-Schnittstelle · Commerzbank'}
      defaultOpen={!ebLastSync}
    >
      <p className="text-xs text-white/40 mb-4">
        Verbindet dich direkt über die offizielle Bank-API. Du wirst zur Commerzbank weitergeleitet um die Verbindung zu autorisieren.
      </p>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">Bank</label>
            <input
              type="text"
              value={ebBank}
              onChange={e => setEbBank(e.target.value)}
              placeholder="Commerzbank"
              className="w-full rounded-card_sm bg-white/4 border border-white/8 px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-blue-500/40 transition-colors"
            />
          </div>
          <div className="w-16">
            <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">Land</label>
            <input
              type="text"
              value={ebCountry}
              onChange={e => setEbCountry(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="DE"
              className="w-full rounded-card_sm bg-white/4 border border-white/8 px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-blue-500/40 transition-colors text-center"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">
            Zeitraum: letzte {ebDays === 365 ? '365 Tage (1 Jahr)' : `${ebDays} Tage`}
          </label>
          <div className="flex gap-2">
            {[30, 60, 90, 180, 365].map(d => (
              <button
                key={d}
                onClick={() => setEbDays(d)}
                className="flex-1 py-1.5 rounded-pill text-xs border transition-all duration-150"
                style={{
                  backgroundColor: ebDays === d ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                  borderColor:     ebDays === d ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)',
                  color:           ebDays === d ? '#93c5fd' : 'rgba(255,255,255,0.4)',
                }}
              >
                {d === 365 ? '1J' : `${d}T`}
              </button>
            ))}
          </div>
        </div>
        <PillButton
          variant="primary"
          size="sm"
          disabled={!isAuth || ebStatus === 'starting' || ebStatus === 'syncing'}
          icon={<Link2 size={13} className={ebStatus === 'starting' || ebStatus === 'syncing' ? 'animate-pulse' : ''} />}
          onClick={() => ebStart(workerCfg, ebBank, ebCountry, ebDays)}
        >
          {!isAuth                         ? 'Zuerst einloggen'
           : ebStatus === 'starting'       ? 'Starte Verbindung…'
           : ebStatus === 'awaiting_auth'  ? 'Warte auf Bank…'
           : ebStatus === 'syncing'        ? 'Importiere…'
           : ebLastSync                    ? 'Erneut synchronisieren'
           : 'Mit Bank verbinden'}
        </PillButton>
        <AnimatePresence>
          {(ebStatus === 'success' || ebStatus === 'error') && (
            <StatusBanner status={ebStatus === 'success' ? 'success' : 'error'} message={ebMessage} />
          )}
        </AnimatePresence>
        {ebLastSync && (
          <p className="text-[10px] text-white/25 text-center">Zuletzt synchronisiert: {ebLastSync}</p>
        )}
      </div>
    </CollapsibleCard>
  )
}
