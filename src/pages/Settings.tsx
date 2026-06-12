import { useRef, useState, useEffect } from 'react'
import { DEV_VERSION } from 'virtual:dev-version'
import { Upload, Trash2, FileText, AlertCircle, CheckCircle, RefreshCw, Wifi, Eye, EyeOff } from 'lucide-react'
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

type ImportStatus = 'idle' | 'parsing' | 'success' | 'error'

function StatusBanner({ status, message }: { status: ImportStatus | SyncStatus; message: string }) {
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

export function Settings() {
  const { transactions, importTransactions, clearAll } = useTransactionsCtx()
  const { accounts, setAccounts, toggleIncluded } = useAccounts()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle')
  const [importMessage, setImportMessage] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  const [workerUrl, setWorkerUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [syncDays, setSyncDays] = useState(90)
  const [configSaved, setConfigSaved] = useState(false)

  const {
    sync,
    submitTan,
    dismissChallenge,
    status: syncStatus,
    message: syncMessage,
    lastSync,
    challenge,
  } = useWorkerSync(importTransactions, setAccounts)

  useEffect(() => {
    const cfg = loadWorkerConfig()
    if (cfg) {
      setWorkerUrl(cfg.workerUrl)
      setApiKey(cfg.apiKey)
      setConfigSaved(true)
    }
  }, [])

  // ── CSV Import ─────────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    setImportStatus('parsing')
    setImportMessage('')
    try {
      const text = await file.text()
      console.log('[Import] File:', file.name, '| size:', file.size, '| type:', file.type)
      console.log('[Import] First 300 chars:', JSON.stringify(text.slice(0, 300)))
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

  // ── Worker sync ────────────────────────────────────────────────────────────

  function saveConfig() {
    if (!workerUrl || !apiKey) return
    saveWorkerConfig({ workerUrl: workerUrl.trim(), apiKey: apiKey.trim() })
    setConfigSaved(true)
  }

  function handleSync() {
    if (!workerUrl || !apiKey) return
    sync({ workerUrl: workerUrl.trim(), apiKey: apiKey.trim() }, syncDays)
  }

  return (
    <>
      {/* PhotoTAN / pushTAN modal */}
      {challenge && (
        <PhotoTanModal
          challenge={challenge}
          onSubmit={submitTan}
          onDismiss={dismissChallenge}
          loading={syncStatus === 'syncing'}
        />
      )}

      <div className="flex flex-col gap-4">

        {/* ── Live-Sync via Cloudflare Worker ───────────────────────────────── */}
        <GlassCard glow="purple">
          <div className="flex items-center gap-2 mb-1">
            <Wifi size={15} className="text-purple-400" />
            <h2 className="text-sm font-semibold text-white/90">Automatischer Sync</h2>
            {configSaved && (
              <span className="ml-auto text-[10px] text-purple-400/70 border border-purple-500/20 bg-purple-500/10 rounded-pill px-2 py-0.5">
                Konfiguriert
              </span>
            )}
          </div>
          <p className="text-xs text-white/40 mb-4">
            Verbinde deine Commerzbank-Konten über deinen Cloudflare Worker.
            Zugangsdaten werden nur lokal gespeichert.
          </p>

          <div className="flex flex-col gap-3">
            {/* Worker URL */}
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

            {/* API Key */}
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

            {/* Days selector */}
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

            {/* Action buttons */}
            <div className="flex gap-2 mt-1">
              {!configSaved && (
                <PillButton
                  variant="secondary"
                  size="sm"
                  disabled={!workerUrl || !apiKey}
                  onClick={saveConfig}
                >
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
              <p className="text-[10px] text-white/25 text-center">
                Zuletzt synchronisiert: {lastSync}
              </p>
            )}
          </div>
        </GlassCard>

        {/* ── Konten & Gesamtvermögen ────────────────────────────────────── */}
        {accounts.length > 0 && (
          <GlassCard>
            <h2 className="text-sm font-semibold text-white/80 mb-1">Konten</h2>
            <p className="text-xs text-white/40 mb-3">
              Wähle, welche Konten ins Gesamtvermögen einfließen.
            </p>
            <div className="flex flex-col gap-2">
              {accounts.map(a => (
                <AccountCard
                  key={a.iban}
                  account={a}
                  onToggle={toggleIncluded}
                  showToggle
                />
              ))}
            </div>
          </GlassCard>
        )}

        {/* ── CSV-Import ─────────────────────────────────────────────────── */}
        <GlassCard>
          <h2 className="text-sm font-semibold text-white/80 mb-1">CSV-Import (manuell)</h2>
          <p className="text-xs text-white/40 mb-4">
            Alternativ: CSV-Export aus dem Commerzbank OnlineBanking hochladen.
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
        </GlassCard>

        {/* ── Daten ───────────────────────────────────────────────────────── */}
        <GlassCard>
          <h2 className="text-sm font-semibold text-white/80 mb-1">Daten</h2>
          <p className="text-xs text-white/40 mb-3">
            {transactions.length} Buchungen gespeichert · Alle Daten verbleiben lokal auf deinem Gerät
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
        </GlassCard>

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
