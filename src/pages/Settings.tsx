import { useRef, useState, useEffect } from 'react'
import { DEV_VERSION } from 'virtual:dev-version'
import {
  Upload, Trash2, FileText, AlertCircle, CheckCircle, RefreshCw,
  Wifi, Eye, EyeOff, CloudUpload, CloudDownload, Cloud,
  ChevronDown, Wallet, Database, Link2,
} from 'lucide-react'
import { useCloudSync, type CloudSyncStatus } from '@/hooks/useCloudState'
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
import {
  useWorkerSync,
  loadWorkerConfig,
  saveWorkerConfig,
  type SyncStatus,
} from '@/hooks/useWorkerSync'
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
          : status === 'syncing' ? 'Verbinde mit Commerzbank…'
          : message}
      </span>
    </motion.div>
  )
}

function CollapsibleCard({
  icon,
  title,
  badge,
  statusText,
  defaultOpen = false,
  glow,
  children,
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
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 text-left"
      >
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
            <div className="pt-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  )
}

export function Settings() {
  const { transactions, importTransactions, clearAll } = useTransactionsCtx()
  const { accounts, setAccounts, toggleIncluded } = useAccounts()
  const { baseBalance: manualBalance, updatedAt: balanceUpdatedAt, save: saveBalance } = useManualBalance()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle')
  const [importMessage, setImportMessage] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  const [workerUrl, setWorkerUrl] = useState(import.meta.env.VITE_WORKER_URL ?? '')
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_WORKER_API_KEY ?? '')
  const [showKey, setShowKey] = useState(false)
  const [syncDays, setSyncDays] = useState(90)
  const [configSaved, setConfigSaved] = useState(false)

  const [balanceInput, setBalanceInput] = useState(
    manualBalance !== null ? String(manualBalance).replace('.', ',') : ''
  )

  const {
    sync, submitTan, dismissChallenge,
    status: syncStatus, message: syncMessage, lastSync, challenge,
  } = useWorkerSync(importTransactions, setAccounts)

  const {
    push: cloudPush, pull: cloudPull,
    status: cloudStatus, message: cloudMessage, lastSync: cloudLastSync,
  } = useCloudSync()

  const [ebBank,    setEbBank]    = useState('Commerzbank')
  const [ebCountry, setEbCountry] = useState('DE')
  const [ebDays,    setEbDays]    = useState(90)
  const {
    start: ebStart,
    status: ebStatus,
    message: ebMessage,
    lastSync: ebLastSync,
  } = useEnableBanking(importTransactions, setAccounts)

  useEffect(() => {
    const cfg = loadWorkerConfig()
    if (cfg) {
      setWorkerUrl(cfg.workerUrl)
      setApiKey(cfg.apiKey)
      setConfigSaved(true)
    }
  }, [])

  // ── CSV Import ──────────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    setImportStatus('parsing')
    setImportMessage('')
    try {
      const text = await file.text()
      const parsed = detectAndParse(text)
      if (parsed.length === 0) throw new Error('Keine Buchungen gefunden. Bitte prüfe das Dateiformat.')
      importTransactions(parsed)
      setImportStatus('success')
      setImportMessage(`${parsed.length} Buchungen importiert`)
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

  // ── Worker sync ─────────────────────────────────────────────────────────────

  function saveConfig() {
    if (!workerUrl || !apiKey) return
    saveWorkerConfig({ workerUrl: workerUrl.trim(), apiKey: apiKey.trim() })
    setConfigSaved(true)
  }

  function handleSync() {
    if (!workerUrl || !apiKey) return
    sync({ workerUrl: workerUrl.trim(), apiKey: apiKey.trim() }, syncDays)
  }

  // ── Manual balance ──────────────────────────────────────────────────────────

  function handleSaveBalance() {
    const parsed = parseFloat(balanceInput.replace(',', '.'))
    if (!isNaN(parsed)) saveBalance(parsed)
  }

  return (
    <>
      {challenge && (
        <PhotoTanModal
          challenge={challenge}
          onSubmit={submitTan}
          onDismiss={dismissChallenge}
          loading={syncStatus === 'syncing'}
        />
      )}

      <div className="flex flex-col gap-3 px-4">

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
            <PillButton
              variant="secondary"
              size="sm"
              disabled={!balanceInput}
              onClick={handleSaveBalance}
            >
              Speichern
            </PillButton>
          </div>
          {balanceUpdatedAt && (
            <p className="text-[10px] text-white/25 mt-2">Zuletzt aktualisiert: {balanceUpdatedAt}</p>
          )}
        </CollapsibleCard>

        {/* ── Automatischer Sync ──────────────────────────────────────────── */}
        <CollapsibleCard
          icon={<Wifi size={15} className="text-purple-400 shrink-0" />}
          title="Automatischer Sync"
          glow="purple"
          badge={configSaved
            ? <span className="text-[10px] text-purple-400/70 border border-purple-500/20 bg-purple-500/10 rounded-pill px-2 py-0.5">Konfiguriert</span>
            : undefined}
          statusText={configSaved
            ? `Commerzbank · Zuletzt: ${lastSync ?? 'Noch nie'}`
            : 'Commerzbank via Cloudflare Worker'}
          defaultOpen={!configSaved}
        >
          <p className="text-xs text-white/40 mb-4">
            Verbinde deine Commerzbank-Konten über deinen Cloudflare Worker.
            Zugangsdaten werden nur lokal gespeichert.
          </p>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">Worker-URL</label>
              <input
                type="url"
                placeholder="https://finants-proxy.DEIN-ACCOUNT.workers.dev"
                value={workerUrl}
                onChange={e => { setWorkerUrl(e.target.value); setConfigSaved(false) }}
                className="w-full rounded-card_sm bg-white/4 border border-white/8 px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/40 transition-colors duration-200"
              />
            </div>
            <div>
              <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  placeholder="Dein geheimer API Key"
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setConfigSaved(false) }}
                  className="w-full rounded-card_sm bg-white/4 border border-white/8 pl-3 pr-10 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/40 transition-colors duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
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
                      borderColor: syncDays === d ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)',
                      color: syncDays === d ? '#a78bfa' : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    {d === 365 ? '1J' : `${d}T`}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 mt-1">
              {!configSaved && (
                <PillButton variant="secondary" size="sm" disabled={!workerUrl || !apiKey} onClick={saveConfig}>
                  Speichern
                </PillButton>
              )}
              <PillButton
                variant="primary"
                size="sm"
                disabled={!workerUrl || !apiKey || syncStatus === 'syncing'}
                icon={<RefreshCw size={13} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />}
                onClick={handleSync}
              >
                {syncStatus === 'syncing' ? 'Lädt…' : 'Jetzt synchronisieren'}
              </PillButton>
            </div>
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

        {/* ── EnableBanking (PSD2) ─────────────────────────────────────────── */}
        <CollapsibleCard
          icon={<Link2 size={15} className="text-blue-400 shrink-0" />}
          title="EnableBanking (PSD2)"
          badge={ebLastSync
            ? <span className="text-[10px] text-blue-400/70 border border-blue-500/20 bg-blue-500/10 rounded-pill px-2 py-0.5">Verbunden</span>
            : undefined}
          statusText={ebLastSync
            ? `PSD2 · Zuletzt: ${ebLastSync}`
            : 'Offizielle PSD2-Schnittstelle · Alternative zu FinTS'}
        >
          <p className="text-xs text-white/40 mb-4">
            Verbinde deine Bank über die offizielle PSD2-Schnittstelle. Sicherer als FinTS,
            direkt von der Bank unterstützt. Erfordert <span className="text-white/60">EB_APPLICATION_ID</span> und{' '}
            <span className="text-white/60">EB_PRIVATE_KEY</span> als Worker-Secrets.
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
                Zeitraum: letzte {ebDays} Tage
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
              disabled={!workerUrl || !apiKey || ebStatus === 'starting' || ebStatus === 'syncing'}
              icon={<Link2 size={13} className={ebStatus === 'starting' || ebStatus === 'syncing' ? 'animate-pulse' : ''} />}
              onClick={() => ebStart({ workerUrl: workerUrl.trim(), apiKey: apiKey.trim() }, ebBank, ebCountry, ebDays)}
            >
              {ebStatus === 'starting'      ? 'Starte Session…'
               : ebStatus === 'awaiting_auth' ? 'Warte auf Bank-Auth…'
               : ebStatus === 'syncing'       ? 'Importiere…'
               : ebLastSync                   ? 'Erneut synchronisieren'
               : 'Mit Bank verbinden'}
            </PillButton>

            <AnimatePresence>
              {(ebStatus === 'success' || ebStatus === 'error') && (
                <StatusBanner
                  status={ebStatus === 'success' ? 'success' : 'error'}
                  message={ebMessage}
                />
              )}
            </AnimatePresence>

            {ebLastSync && (
              <p className="text-[10px] text-white/25 text-center">Zuletzt synchronisiert: {ebLastSync}</p>
            )}
          </div>
        </CollapsibleCard>

        {/* ── Cloud-Backup ─────────────────────────────────────────────────── */}
        <CollapsibleCard
          icon={<Cloud size={15} className="text-blue-400 shrink-0" />}
          title="Cloud-Backup"
          statusText={cloudLastSync
            ? `Zuletzt: ${cloudLastSync}`
            : 'Kategorien & Profile geräteübergreifend sichern'}
        >
          <p className="text-xs text-white/40 mb-4">
            Kategorien, Händler-Profile und Icons geräteübergreifend sichern.
            Nutzt deinen konfigurierten Cloudflare Worker.
          </p>
          <div className="flex gap-2">
            <PillButton
              variant="secondary"
              size="sm"
              disabled={cloudStatus === 'pushing' || cloudStatus === 'pulling'}
              icon={<CloudUpload size={13} className={cloudStatus === 'pushing' ? 'animate-pulse' : ''} />}
              onClick={() => cloudPush(workerUrl && apiKey ? { workerUrl, apiKey } : undefined)}
            >
              {cloudStatus === 'pushing' ? 'Lädt…' : 'Hochladen'}
            </PillButton>
            <PillButton
              variant="secondary"
              size="sm"
              disabled={cloudStatus === 'pushing' || cloudStatus === 'pulling'}
              icon={<CloudDownload size={13} className={cloudStatus === 'pulling' ? 'animate-pulse' : ''} />}
              onClick={() => cloudPull(workerUrl && apiKey ? { workerUrl, apiKey } : undefined)}
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
          <p className="text-xs text-white/40 mb-4">
            CSV-Export aus dem Commerzbank OnlineBanking hochladen.
          </p>
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
          <p className="text-xs text-white/40 mb-3">
            Alle Daten verbleiben lokal auf deinem Gerät.
          </p>
          {!showConfirm ? (
            <PillButton
              variant="danger"
              size="sm"
              icon={<Trash2 size={13} />}
              onClick={() => setShowConfirm(true)}
            >
              Alle Daten löschen
            </PillButton>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-2"
            >
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
