import { useRef, useState, useEffect } from 'react'
import { DEV_VERSION } from 'virtual:dev-version'
import {
  Upload, Trash2, FileText, AlertCircle, CheckCircle, RefreshCw,
  Wifi, CloudUpload, CloudDownload, Cloud,
  ChevronDown, Wallet, Database, Link2, ShieldCheck, LogIn, Eye, Copy, Bug,
} from 'lucide-react'
import { useCloudSync, type CloudSyncStatus } from '@/hooks/useCloudState'
import { getApiKey, setApiKey } from '@/utils/cfAuth'
import { useEnableBanking } from '@/hooks/useEnableBanking'
import { useManualBalance } from '@/hooks/useManualBalance'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/ui/GlassCard'
import { PillButton } from '@/components/ui/PillButton'
import { AccountCard } from '@/components/ui/AccountCard'
import { PhotoTanModal } from '@/components/ui/PhotoTanModal'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { useAccounts } from '@/hooks/useAccounts'
import { detectAndParse } from '@/utils/csvParser'
import { useWorkerSync, type SyncStatus } from '@/hooks/useWorkerSync'
import { ChartLoader } from '@/components/ui/ChartLoader'
import { useErrorLog, notify } from '@/utils/notify'

const WORKER_URL = (import.meta.env.VITE_WORKER_URL ?? 'https://finants-proxy.simon-bader.workers.dev').replace(/\/$/, '')

function formatEur(v: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits }).format(v)
}

type ImportStatus = 'idle' | 'parsing' | 'success' | 'error'

function StatusBanner({ status, message }: { status: ImportStatus | SyncStatus | CloudSyncStatus; message: string }) {
  if (status === 'idle' || status === 'challenge') return null
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex items-start gap-2 p-3 rounded-card_sm text-xs border ${
        status === 'success'
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          : status === 'error'
          ? 'bg-red-500/10 border-red-500/20 text-red-400'
          : 'bg-white/5 border-white/10 text-white/50'
      }`}
    >
      {status === 'success' && <CheckCircle size={14} className="shrink-0 mt-0.5" />}
      {status === 'error'   && <AlertCircle size={14} className="shrink-0 mt-0.5" />}
      {(status === 'parsing' || status === 'syncing') && (
        <FileText size={14} className="shrink-0 mt-0.5 animate-pulse" />
      )}
      <span>
        {status === 'parsing' ? 'Datei wird verarbeitet…'
          : status === 'syncing' ? 'Verbinde mit Bank…'
          : message}
      </span>
    </motion.div>
  )
}

function CollapsibleCard({
  icon, title, badge, statusText, defaultOpen = false, glow, children,
}: {
  icon: React.ReactNode
  title: string
  badge?: React.ReactNode
  statusText?: string
  defaultOpen?: boolean
  glow?: 'purple' | 'blue'
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <GlassCard glow={glow}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-2 text-left">
        {icon}
        <span className="text-sm font-semibold text-white/90 flex-1">{title}</span>
        {badge}
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-white/30 shrink-0"
        >
          <ChevronDown size={14} />
        </motion.span>
      </button>
      {!open && statusText && (
        <p className="text-[10px] text-white/30 mt-1.5 ml-5.5">{statusText}</p>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  )
}

export function Settings() {
  const { transactions, importTransactions, applyServerTransactions, clearAll } = useTransactionsCtx()
  const { accounts, setAccounts, toggleIncluded } = useAccounts()
  const { baseBalance: manualBalance, updatedAt: balanceUpdatedAt, save: saveBalance } = useManualBalance()
  const { entries: errorLog, clear: clearErrorLog } = useErrorLog()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle')
  const [importMessage, setImportMessage] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [balanceInput, setBalanceInput] = useState(
    manualBalance !== null ? String(manualBalance).replace('.', ',') : ''
  )

  // API key auth state
  const [apiKey, setApiKeyState] = useState<string>(() => getApiKey() ?? '')
  const [apiKeyInput, setApiKeyInput] = useState('')

  useEffect(() => { setApiKeyInput(apiKey) }, [apiKey])

  const [syncDays, setSyncDays] = useState(90)
  const { sync, submitTan, dismissChallenge, status: syncStatus, message: syncMessage, lastSync, challenge } =
    useWorkerSync(applyServerTransactions, setAccounts)

  const { push: cloudPush, pull: cloudPull, status: cloudStatus, message: cloudMessage, lastSync: cloudLastSync } =
    useCloudSync()

  const [ebBank,    setEbBank]    = useState('Commerzbank')
  const [ebCountry, setEbCountry] = useState('DE')
  const [ebDays,    setEbDays]    = useState(365)
  const { start: ebStart, status: ebStatus, message: ebMessage, lastSync: ebLastSync } =
    useEnableBanking(applyServerTransactions, setAccounts)

  async function handleFile(file: File) {
    setImportStatus('parsing')
    setImportMessage('')
    try {
      const text = await file.text()
      const parsed = detectAndParse(text)
      if (parsed.length === 0) throw new Error('Keine Buchungen gefunden. Bitte prüfe das Dateiformat.')
      const meta = await importTransactions(parsed)
      setImportStatus('success')
      setImportMessage(`${meta.added} neu von ${parsed.length} · ${meta.total} gesamt`)
    } catch (e) {
      setImportStatus('error')
      setImportMessage(e instanceof Error ? e.message : 'Unbekannter Fehler')
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleSaveBalance() {
    const parsed = parseFloat(balanceInput.replace(',', '.'))
    if (!isNaN(parsed)) saveBalance(parsed)
  }

  const workerCfg = { workerUrl: WORKER_URL }
  const isAuth = !!apiKey

  const [previewLoader, setPreviewLoader] = useState(false)
  const showLoader = ebStatus === 'starting' || ebStatus === 'syncing' || syncStatus === 'syncing'
  const loaderMessage =
    previewLoader              ? 'Vorschau · Ladeanimation'
    : ebStatus === 'syncing'    ? 'Buchungen werden abgerufen…'
    : ebStatus === 'starting' ? 'Verbindung wird aufgebaut…'
    : syncStatus === 'syncing' ? 'FinTS Synchronisation…'
    : undefined

  return (
    <>
      <ChartLoader
        show={showLoader || previewLoader}
        message={loaderMessage}
        onClose={() => setPreviewLoader(false)}
      />

      {challenge && (
        <PhotoTanModal
          challenge={challenge}
          onSubmit={submitTan}
          onDismiss={dismissChallenge}
          loading={syncStatus === 'syncing'}
        />
      )}

      <div className="flex flex-col gap-3 px-4">

        {/* ── Zugang ──────────────────────────────────────────────────────── */}
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
              onClick={() => {
                const trimmed = apiKeyInput.trim()
                if (!trimmed) return
                setApiKey(trimmed)
                setApiKeyState(trimmed)
              }}
            >
              Speichern
            </PillButton>
          </div>
        </CollapsibleCard>

        {/* ── Kontostand ──────────────────────────────────────────────────── */}
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

        {/* ── PSD2 Bankabfrage ─────────────────────────────────────────────── */}
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

        {/* ── FinTS Sync ──────────────────────────────────────────────────── */}
        <CollapsibleCard
          icon={<Wifi size={15} className="text-purple-400 shrink-0" />}
          title="FinTS Sync"
          glow="purple"
          statusText={lastSync ? `Zuletzt: ${lastSync}` : 'Commerzbank via FinTS'}
        >
          <p className="text-xs text-white/40 mb-4">
            Direktverbindung zu Commerzbank via FinTS-Protokoll.
          </p>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">
                Zeitraum: letzte {syncDays} Tage
              </label>
              <div className="flex gap-2">
                {[30, 60, 90, 180, 365].map(d => (
                  <button
                    key={d}
                    onClick={() => setSyncDays(d)}
                    className="flex-1 py-1.5 rounded-pill text-xs border transition-all duration-150"
                    style={{
                      backgroundColor: syncDays === d ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                      borderColor:     syncDays === d ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)',
                      color:           syncDays === d ? '#a78bfa' : 'rgba(255,255,255,0.4)',
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
              disabled={!isAuth || syncStatus === 'syncing'}
              icon={<RefreshCw size={13} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />}
              onClick={() => sync(workerCfg, syncDays)}
            >
              {!isAuth ? 'Zuerst einloggen' : syncStatus === 'syncing' ? 'Lädt…' : 'Jetzt synchronisieren'}
            </PillButton>
            <AnimatePresence>
              {syncStatus !== 'idle' && syncStatus !== 'challenge' && (
                <StatusBanner status={syncStatus} message={syncMessage} />
              )}
            </AnimatePresence>
            {lastSync && (
              <p className="text-[10px] text-white/25 text-center">Zuletzt synchronisiert: {lastSync}</p>
            )}
          </div>
        </CollapsibleCard>

        {/* ── Cloud-Backup ─────────────────────────────────────────────────── */}
        <CollapsibleCard
          icon={<Cloud size={15} className="text-blue-400 shrink-0" />}
          title="Cloud-Backup"
          statusText={cloudLastSync ? `Zuletzt: ${cloudLastSync}` : 'Kategorien & Profile geräteübergreifend sichern'}
        >
          <p className="text-xs text-white/40 mb-4">
            Kategorien, Händler-Profile und Icons geräteübergreifend sichern.
          </p>
          <div className="flex gap-2">
            <PillButton
              variant="secondary"
              size="sm"
              disabled={!isAuth || cloudStatus === 'pushing' || cloudStatus === 'pulling'}
              icon={<CloudUpload size={13} className={cloudStatus === 'pushing' ? 'animate-pulse' : ''} />}
              onClick={() => cloudPush(workerCfg)}
            >
              {cloudStatus === 'pushing' ? 'Lädt…' : 'Hochladen'}
            </PillButton>
            <PillButton
              variant="secondary"
              size="sm"
              disabled={!isAuth || cloudStatus === 'pushing' || cloudStatus === 'pulling'}
              icon={<CloudDownload size={13} className={cloudStatus === 'pulling' ? 'animate-pulse' : ''} />}
              onClick={() => cloudPull(workerCfg)}
            >
              {cloudStatus === 'pulling' ? 'Lädt…' : 'Herunterladen'}
            </PillButton>
          </div>
          <AnimatePresence>
            {(cloudStatus === 'success' || cloudStatus === 'error') && (
              <div className="mt-3">
                <StatusBanner status={cloudStatus} message={cloudMessage} />
              </div>
            )}
          </AnimatePresence>
          {cloudLastSync && (
            <p className="text-[10px] text-white/25 text-center mt-2">Zuletzt: {cloudLastSync}</p>
          )}
        </CollapsibleCard>

        {/* ── Konten ───────────────────────────────────────────────────────── */}
        {accounts.length > 0 && (
          <CollapsibleCard
            icon={<Wallet size={15} className="text-white/40 shrink-0" />}
            title="Konten"
            statusText={`${accounts.length} Konto${accounts.length !== 1 ? 'en' : ''} · Wähle welche ins Gesamtvermögen einfließen`}
          >
            <div className="flex flex-col gap-2">
              {accounts.map(a => (
                <AccountCard key={a.iban} account={a} onToggle={toggleIncluded} showToggle />
              ))}
            </div>
          </CollapsibleCard>
        )}

        {/* ── CSV-Import ───────────────────────────────────────────────────── */}
        <CollapsibleCard
          icon={<Upload size={15} className="text-white/40 shrink-0" />}
          title="CSV-Import"
          statusText="Manueller Import via Commerzbank-Export"
        >
          <p className="text-xs text-white/40 mb-4">CSV-Export aus dem Commerzbank OnlineBanking hochladen.</p>
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-white/10 rounded-card hover:border-purple-500/40 hover:bg-purple-500/5 transition-all duration-200 cursor-pointer p-6 flex flex-col items-center gap-3 text-center active:scale-[0.99]"
          >
            <div className="w-10 h-10 rounded-card_sm bg-white/5 flex items-center justify-center text-white/40">
              <Upload size={18} />
            </div>
            <div>
              <p className="text-sm text-white/60 font-medium">CSV oder MT940 hochladen</p>
              <p className="text-xs text-white/25 mt-0.5">Tippe hier oder ziehe die Datei hinein</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.txt,.mt940,.sta" className="hidden" onChange={onFileChange} />
          </div>
          <AnimatePresence>
            {importStatus !== 'idle' && (
              <div className="mt-3">
                <StatusBanner status={importStatus} message={importMessage} />
              </div>
            )}
          </AnimatePresence>
        </CollapsibleCard>

        {/* ── Daten ────────────────────────────────────────────────────────── */}
        <CollapsibleCard
          icon={<Database size={15} className="text-white/40 shrink-0" />}
          title="Daten"
          statusText={`${transactions.length} Buchungen · Lokal gespeichert`}
        >
          <p className="text-xs text-white/40 mb-3">Alle Daten verbleiben lokal auf deinem Gerät.</p>
          {!showConfirm ? (
            <PillButton variant="danger" size="sm" icon={<Trash2 size={13} />} onClick={() => setShowConfirm(true)}>
              Alle Daten löschen
            </PillButton>
          ) : (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2">
              <p className="text-xs text-red-400/80">Wirklich alle Buchungen löschen? Dies kann nicht rückgängig gemacht werden.</p>
              <div className="flex gap-2">
                <PillButton variant="danger" size="sm" onClick={() => { clearAll(); setShowConfirm(false); setImportStatus('idle') }}>
                  Ja, löschen
                </PillButton>
                <PillButton variant="ghost" size="sm" onClick={() => setShowConfirm(false)}>
                  Abbrechen
                </PillButton>
              </div>
            </motion.div>
          )}
        </CollapsibleCard>

        {/* ── Fehlerprotokoll ──────────────────────────────────────────────── */}
        <CollapsibleCard
          icon={<Bug size={15} className="text-white/40 shrink-0" />}
          title="Fehlerprotokoll"
          statusText={errorLog.length ? `${errorLog.length} Fehler protokolliert` : 'Keine Fehler'}
        >
          {errorLog.length === 0 ? (
            <p className="text-xs text-white/40">Keine Fehler aufgezeichnet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                {[...errorLog].reverse().map(e => (
                  <div key={e.id} className="rounded-card_sm border border-white/8 bg-white/[0.03] p-2">
                    <p className="text-[11px] font-medium text-white/70">
                      {e.context}
                      <span className="text-white/30"> · {new Date(e.time).toLocaleString('de-DE')}</span>
                    </p>
                    <p className="text-[11px] text-white/45 break-words">{e.message}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <PillButton
                  variant="secondary"
                  size="sm"
                  icon={<Copy size={13} />}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(JSON.stringify(errorLog, null, 2))
                      notify('Fehlerprotokoll kopiert')
                    } catch { /* clipboard unavailable */ }
                  }}
                >
                  Kopieren
                </PillButton>
                <PillButton variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={clearErrorLog}>
                  Leeren
                </PillButton>
              </div>
            </div>
          )}
        </CollapsibleCard>

        <div className="flex justify-center">
          <PillButton variant="ghost" size="sm" icon={<Eye size={13} />} onClick={() => setPreviewLoader(true)}>
            Ladeanimation ansehen
          </PillButton>
        </div>

        <GlassCard padding="sm">
          <button
            onClick={() => window.location.reload()}
            className="w-full text-xs text-white/20 text-center active:opacity-50 transition-opacity"
          >
            FinAnts · Deine Finanzen, lokal & privat
            <span className="ml-2 text-white/10">
              {import.meta.env.DEV ? `V${DEV_VERSION}` : __APP_VERSION__}
            </span>
          </button>
        </GlassCard>

      </div>
    </>
  )
}
