import { useState, useEffect } from 'react'
import { ShieldCheck, LogIn } from 'lucide-react'
import { PillButton } from '@/components/ui/PillButton'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { getApiKey, setApiKey } from '@/utils/cfAuth'
import { notify, reportError } from '@/utils/notify'
import { CollapsibleCard, type OnLoader } from './shared'

interface Props {
  isAuth: boolean
  onAuthChange: (auth: boolean) => void
  onLoader: OnLoader
}

export function AccessSection({ isAuth, onAuthChange, onLoader }: Props) {
  const { refreshAll } = useTransactionsCtx()
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => getApiKey() ?? '')
  const [keySaving, setKeySaving] = useState(false)

  useEffect(() => {
    onLoader(keySaving ? 'Daten werden geladen…' : null)
  }, [keySaving, onLoader])

  async function handleSaveApiKey() {
    const trimmed = apiKeyInput.trim()
    if (!trimmed) return
    setApiKey(trimmed)
    onAuthChange(true)
    setKeySaving(true)
    try {
      await refreshAll()
      notify('Daten geladen', 'Buchungen, Kategorien und Muster synchronisiert')
    } catch (e) {
      reportError('Laden fehlgeschlagen', e)
    } finally {
      setKeySaving(false)
    }
  }

  return (
    <CollapsibleCard
      icon={<ShieldCheck size={15} className={isAuth ? 'text-emerald-400' : 'text-white/30'} />}
      title="Zugang"
      badge={isAuth
        ? <span className="text-[10px] text-emerald-400/70 border border-emerald-500/20 bg-emerald-500/10 rounded-pill px-2 py-0.5">Verbunden</span>
        : <span className="text-[10px] text-red-400/70 border border-red-500/20 bg-red-500/10 rounded-pill px-2 py-0.5">Kein Schlüssel</span>}
      statusText={isAuth ? 'API Key gesetzt · Worker authentifiziert' : 'API Key eingeben um Bankabfragen zu starten'}
      defaultOpen={!isAuth}
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-white/40">
          Der API Key ist dein Worker Secret. Einmalig eingeben, wird sicher im Browser gespeichert.
        </p>
        <input
          type="password"
          value={apiKeyInput}
          onChange={e => setApiKeyInput(e.target.value)}
          placeholder="API Key eingeben…"
          className="w-full bg-white/5 border border-white/10 rounded-card_sm px-3 py-2 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20"
        />
        <PillButton
          variant="primary"
          size="sm"
          icon={<LogIn size={13} />}
          onClick={handleSaveApiKey}
          disabled={keySaving || !apiKeyInput.trim()}
        >
          Speichern
        </PillButton>
      </div>
    </CollapsibleCard>
  )
}
