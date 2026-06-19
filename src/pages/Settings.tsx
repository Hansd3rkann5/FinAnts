import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Transaction } from '@/types'
import { DEV_VERSION } from 'virtual:dev-version'
import {
  Upload, Trash2, FileText, AlertCircle, CheckCircle, RefreshCw,
  CreditCard, CloudUpload, CloudDownload, Cloud, Download,
  ChevronDown, Wallet, Database, Link2, ShieldCheck, LogIn, Copy, Bug, Lock, ScanFace,
} from 'lucide-react'
import { useCloudSync, type CloudSyncStatus } from '@/hooks/useCloudState'
import { getApiKey, setApiKey } from '@/utils/cfAuth'
import { useEnableBanking } from '@/hooks/useEnableBanking'
import { useManualBalance } from '@/hooks/useManualBalance'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/ui/GlassCard'
import { PillButton } from '@/components/ui/PillButton'
import { AccountCard } from '@/components/ui/AccountCard'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { useAccounts } from '@/hooks/useAccounts'
import { useAllCategories } from '@/hooks/useAllCategories'
import { detectAndParse, parseMastercardCSV } from '@/utils/csvParser'
import { ChartLoader } from '@/components/ui/ChartLoader'
import { useErrorLog, notify, reportError, fetchErrorLogRemote, clearErrorLogRemote, type RemoteLoggedError } from '@/utils/notify'
import { isLockEnabled, hasBiometric, webauthnSupported, enableLock, disableLock } from '@/utils/appLock'

const WORKER_URL = (import.meta.env.VITE_WORKER_URL ?? 'https://finants-proxy.simon-bader.workers.dev').replace(/\/$/, '')

// Settlement-row date vs the Giro booking date can differ by a few days.
const CC_DATE_TOL_DAYS = 6

function formatEur(v: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits }).format(v)
}

type ImportStatus = 'idle' | 'parsing' | 'success' | 'error'

function StatusBanner({ status, message }: { status: ImportStatus | CloudSyncStatus; message: string }) {
  if (status === 'idle') return null
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
      {status === 'parsing' && (
        <FileText size={14} className="shrink-0 mt-0.5 animate-pulse" />
      )}
      <span>
        {status === 'parsing' ? 'Datei wird verarbeitet…' : message}
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
      <AnimatePresence initial={false}>
        {!open && statusText && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="text-[10px] text-white/30 ml-5.5 overflow-hidden"
          >
            <span className="block mt-1.5">{statusText}</span>
          </motion.p>
        )}
      </AnimatePresence>
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

// A top-level group of related CollapsibleCards (e.g. every way to import
// data). The subtitle is a sibling *below* the icon/title row, never nested
// inside it — nesting it there (alongside the title, both centered via
// items-center) made the icon/chevron visibly jump on toggle, since that
// column's height — and therefore the whole row's centered height — changed
// the instant the subtitle was removed. Animating height/opacity here instead
// of an abrupt conditional render smooths out the remaining size change.
function SettingsGroup({
  icon, title, subtitle, defaultOpen = false, children,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <GlassCard padding="sm">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-2.5 text-left">
        <div className="w-8 h-8 rounded-card_sm bg-white/5 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <span className="text-sm font-semibold text-white/80 flex-1">{title}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-white/30 shrink-0"
        >
          <ChevronDown size={14} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {!open && subtitle && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="text-[10px] text-white/30 ml-[42px] overflow-hidden"
          >
            <span className="block mt-0.5">{subtitle}</span>
          </motion.p>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 pt-4 pl-3.5 ml-4 border-l border-white/8">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  )
}

export function Settings() {
  const {
    transactions, importTransactions, importLocalOnly, applyServerTransactions, clearAll, refreshAll,
    setSplit, markNew,
  } = useTransactionsCtx()
  const { accounts, setAccounts, toggleIncluded } = useAccounts()
  const { allList: allCategories } = useAllCategories()
  const { baseBalance: manualBalance, updatedAt: balanceUpdatedAt, save: saveBalance } = useManualBalance()
  const { entries: errorLog, clear: clearErrorLog } = useErrorLog()
  const [remoteErrors, setRemoteErrors] = useState<RemoteLoggedError[] | null>(null)
  const [remoteErrorsLoading, setRemoteErrorsLoading] = useState(false)
  const [lockEnabled, setLockEnabled] = useState(isLockEnabled())
  const [pinInput, setPinInput] = useState('')
  const [useFaceId, setUseFaceId] = useState(webauthnSupported())
  const fileRef = useRef<HTMLInputElement>(null)

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

  async function loadRemoteErrors() {
    setRemoteErrorsLoading(true)
    try {
      setRemoteErrors(await fetchErrorLogRemote())
    } catch (e) {
      notify('Globales Protokoll konnte nicht geladen werden', e instanceof Error ? e.message : '')
    } finally {
      setRemoteErrorsLoading(false)
    }
  }

  async function handleClearRemoteErrors() {
    try {
      await clearErrorLogRemote()
      setRemoteErrors([])
    } catch (e) {
      notify('Leeren fehlgeschlagen', e instanceof Error ? e.message : '')
    }
  }
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle')
  const [importMessage, setImportMessage] = useState('')
  const [importPhase, setImportPhase] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [balanceInput, setBalanceInput] = useState(
    manualBalance !== null ? String(manualBalance).replace('.', ',') : ''
  )

  // API key auth state
  const [apiKey, setApiKeyState] = useState<string>(() => getApiKey() ?? '')
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => getApiKey() ?? '')
  const [keySaving, setKeySaving] = useState(false)

  async function handleSaveApiKey() {
    const trimmed = apiKeyInput.trim()
    if (!trimmed) return
    setApiKey(trimmed)
    setApiKeyState(trimmed)
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

  const [pendingParsed, setPendingParsed] = useState<Transaction[] | null>(null)
  const [localImportOpen, setLocalImportOpen] = useState(false)

  const { push: cloudPush, pull: cloudPull, status: cloudStatus, message: cloudMessage, lastSync: cloudLastSync } =
    useCloudSync()

  const [ebBank,    setEbBank]    = useState('Commerzbank')
  const [ebCountry, setEbCountry] = useState('DE')
  const [ebDays,    setEbDays]    = useState(30)
  const { start: ebStart, status: ebStatus, message: ebMessage, lastSync: ebLastSync } =
    useEnableBanking(applyServerTransactions, setAccounts, markNew)

  async function handleFile(file: File) {
    setImportStatus('parsing')
    setImportMessage('')
    setImportPhase('Datei wird gelesen…')
    try {
      const text = await file.text()
      setImportPhase('Buchungen werden erkannt…')
      const parsed = detectAndParse(text)
      if (parsed.length === 0) throw new Error('Keine Buchungen gefunden. Bitte prüfe das Dateiformat.')
      if (!getApiKey()) {
        setPendingParsed(parsed)
        setLocalImportOpen(true)
        setImportStatus('idle')
        return
      }
      setImportPhase('Buchungen werden importiert…')
      const meta = await importTransactions(parsed)
      setImportStatus('success')
      setImportMessage(`${meta.added} neu von ${parsed.length} · ${meta.total} gesamt`)
    } catch (e) {
      setImportStatus('error')
      setImportMessage(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setImportPhase('')
    }
  }

  function handleConfirmLocal() {
    if (!pendingParsed) return
    const meta = importLocalOnly(pendingParsed)
    setPendingParsed(null)
    setLocalImportOpen(false)
    setImportStatus('success')
    setImportMessage(`${meta.added} neu von ${pendingParsed.length} · ${meta.total} gesamt (nur lokal)`)
  }

  function handleAbortLocal() {
    setPendingParsed(null)
    setLocalImportOpen(false)
    setImportStatus('idle')
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

  const ccFileInputRef = useRef<HTMLInputElement>(null)
  const [ccStatus, setCcStatus] = useState<ImportStatus>('idle')
  const [ccMessage, setCcMessage] = useState('')
  const [ccLastImport, setCcLastImport] = useState<string | null>(null)

  async function handleCcFile(file: File) {
    setCcStatus('parsing')
    setCcMessage('')
    try {
      const text = await file.text()
      const { purchases, settlements } = parseMastercardCSV(text)
      if (purchases.length === 0 && settlements.length === 0) {
        throw new Error('Keine Buchungen gefunden. Bitte prüfe das Dateiformat.')
      }

      const kreditkarteCategoryId = allCategories.find(c => c.label.trim().toLowerCase() === 'kreditkarte')?.id
      const candidates = kreditkarteCategoryId
        ? transactions.filter(t => t.categoryId === kreditkarteCategoryId)
        : []
      const dayNum = (d: Date) => Math.floor(d.getTime() / 86_400_000)

      // The statement closes on the 28th, but the bank collects payment a
      // few days into the *next* month (the settlement row's own date) — so
      // bucketing purchases by the settlement date itself shifts a few days'
      // worth into the wrong period and the sums never quite match. Re-derive
      // the actual closing date instead: 28th of the same month if the
      // settlement landed on/after the 28th, otherwise the previous month's.
      function closingDateFor(settlementDate: Date): Date {
        const day = settlementDate.getDate()
        const y = settlementDate.getFullYear()
        const m = settlementDate.getMonth()
        return day < 28 ? new Date(y, m - 1, 28) : new Date(y, m, 28)
      }

      // Each settlement closes out a ~monthly billing period (the statement's
      // "Lastschrifteinzug" row). For every period: find the Giro "Kreditkarte"
      // booking it was collected into (by amount + date proximity), link this
      // period's purchases to it as children (parentId), and replace its own
      // chart contribution with their category breakdown via `splits` — so
      // "Kreditkarte" itself is never counted, only what it was actually spent
      // on. If the file doesn't have full history for a period, the gap
      // between the known purchases and the real Giro amount is added as one
      // more split under Sonstiges ("Remaining"), so the chart total still
      // matches the real money even though the breakdown is partial.
      const sortedSettlements = [...settlements].sort((a, b) => a.date.getTime() - b.date.getTime())
      const claimed = new Set<string>()
      const unmatched: string[] = []
      let linked = 0
      let fullyExplained = 0

      sortedSettlements.forEach((s, i) => {
        const closing = closingDateFor(s.date)
        const periodStart = i > 0 ? closingDateFor(sortedSettlements[i - 1].date) : new Date(closing.getTime() - 31 * 86_400_000)
        const periodPurchases = purchases.filter(p => p.date > periodStart && p.date <= closing)
        const periodSum = periodPurchases.reduce((sum, p) => sum + p.amount, 0)

        let best: Transaction | null = null
        let bestDiff = Infinity
        for (const c of candidates) {
          if (claimed.has(c.id)) continue
          if (Math.round(c.amount * 100) !== Math.round(-s.amount * 100)) continue
          const diff = Math.abs(dayNum(c.date) - dayNum(s.date))
          if (diff <= CC_DATE_TOL_DAYS && diff < bestDiff) { best = c; bestDiff = diff }
        }
        if (!best) {
          unmatched.push(s.date.toLocaleDateString('de-DE'))
          return
        }
        claimed.add(best.id)
        linked++

        for (const p of periodPurchases) p.parentId = best.id

        const byCategory = new Map<string, number>()
        for (const p of periodPurchases) byCategory.set(p.categoryId, (byCategory.get(p.categoryId) ?? 0) + p.amount)
        const splits = [...byCategory.entries()].map(([categoryId, amount]) => ({ categoryId, amount }))

        const remaining = Math.round((best.amount - periodSum) * 100) / 100
        if (Math.abs(remaining) >= 0.01) {
          splits.push({ categoryId: 'other', amount: remaining })
        } else {
          fullyExplained++
        }
        setSplit(best.id, splits)
      })

      let meta = { added: 0, total: transactions.length }
      if (purchases.length) {
        meta = !getApiKey()
          ? importLocalOnly(purchases, 'creditcard')
          : await importTransactions(purchases, 'creditcard')
      }

      setCcStatus('success')
      setCcMessage(
        `${meta.added} Käufe importiert · ${linked}/${settlements.length} "Kreditkarte"-Buchungen verknüpft (${fullyExplained} davon vollständig aufgeschlüsselt)` +
        (unmatched.length ? ` · ohne Treffer: ${unmatched.join(', ')}` : ''),
      )
      setCcLastImport(new Date().toLocaleString('de-DE'))
    } catch (e) {
      setCcStatus('error')
      setCcMessage(e instanceof Error ? e.message : 'Unbekannter Fehler')
    }
  }

  function onCcFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleCcFile(file)
    e.target.value = ''
  }

  function onCcDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleCcFile(file)
  }

  function handleSaveBalance() {
    const parsed = parseFloat(balanceInput.replace(',', '.'))
    if (!isNaN(parsed)) saveBalance(parsed)
  }

  const workerCfg = { workerUrl: WORKER_URL }
  const isAuth = !!apiKey

  const [previewLoader, setPreviewLoader] = useState(false)
  const showLoader =
    ebStatus === 'starting' || ebStatus === 'syncing' || keySaving ||
    importStatus === 'parsing' || ccStatus === 'parsing'
  const loaderMessage =
    previewLoader              ? 'Vorschau · Ladeanimation'
    : keySaving                 ? 'Daten werden geladen…'
    : ebStatus === 'syncing'    ? 'Buchungen werden abgerufen…'
    : ebStatus === 'starting' ? 'Verbindung wird aufgebaut…'
    : importStatus === 'parsing' ? (importPhase || 'Buchungen werden importiert…')
    : ccStatus === 'parsing' ? 'Kreditkartenumsätze werden importiert…'
    : undefined

  return (
    <>
      <ChartLoader
        show={showLoader || previewLoader}
        message={loaderMessage}
        onClose={() => setPreviewLoader(false)}
      />

      <div className="flex flex-col min-h-full">
      <div className="flex-1 flex flex-col gap-3 px-4">
        <div
        id="dash-sticky-filter"
        className="sticky top-0 z-30 pt-2 mb-5"
        style={{
          backdropFilter: 'blur(5px)',
          paddingTop: '40px',
          WebkitBackdropFilter: 'blur(5px)',
          backgroundColor: 'rgba(10, 10, 20, 0.75)',
          boxShadow: '0 -4px 24px 10px rgba(10,10,10,0.8), 0 -1px 80px 10px rgba(10,10,10,0.8)',
        }}
      ></div>

        <p className="text-center text-[30px] text-white/45 tracking-[0.2em] uppercase pb-6">
          FinAnts
        </p>
        {/* ── Gruppe: Konten & Zugang ─────────────────────────────────────── */}
        <SettingsGroup
          icon={<Wallet size={15} className="text-white/50" />}
          title="Konten & Zugang"
          subtitle="Zugang, Kontostand, Konten, Cloud-Backup"
          defaultOpen={!isAuth}
        >
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
        </SettingsGroup>

        {/* ── Gruppe: Daten importieren ─────────────────────────────────────── */}
        <SettingsGroup
          icon={<Download size={15} className="text-white/50" />}
          title="Daten importieren"
          subtitle="Bankabfrage, Kreditkarte, CSV-Import"
        >
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

          <CollapsibleCard
            icon={<CreditCard size={15} className="text-purple-400 shrink-0" />}
            title="Kreditkarte importieren"
            glow="purple"
            statusText={ccLastImport ? `Zuletzt: ${ccLastImport}` : 'Mastercard-Abrechnung CSV'}
          >
            <p className="text-xs text-white/40 mb-4">
              Importiert die einzelnen Kreditkarten-Buchungen und blendet die
              zusammenfassende "Kreditkarte"-Buchung auf dem Girokonto aus, sobald
              ihre Summe mit den importierten Einzelbuchungen übereinstimmt.
            </p>
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={onCcDrop}
              onClick={() => ccFileInputRef.current?.click()}
              className="border-2 border-dashed border-white/10 rounded-card hover:border-purple-500/40 hover:bg-purple-500/5 transition-all duration-200 cursor-pointer p-6 flex flex-col items-center gap-3 text-center active:scale-[0.99]"
            >
              <div className="w-10 h-10 rounded-card_sm bg-white/5 flex items-center justify-center text-white/40">
                <Upload size={18} />
              </div>
              <div>
                <p className="text-sm text-white/60 font-medium">
                  {ccStatus === 'parsing' ? 'Verarbeite…' : 'Kreditkarten-CSV hochladen'}
                </p>
                <p className="text-xs text-white/25 mt-0.5">Tippe hier oder ziehe die Datei hinein</p>
              </div>
              <input ref={ccFileInputRef} type="file" accept=".csv" className="hidden" onChange={onCcFileChange} />
            </div>
            <AnimatePresence>
              {ccStatus !== 'idle' && (
                <div className="mt-3">
                  <StatusBanner status={ccStatus} message={ccMessage} />
                </div>
              )}
            </AnimatePresence>
          </CollapsibleCard>

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
        </SettingsGroup>

        {/* ── Gruppe: Sicherheit & Daten ───────────────────────────────────── */}
        <SettingsGroup
          icon={<Lock size={15} className="text-white/50" />}
          title="Sicherheit & Daten"
          subtitle="App-Sperre, Datenlöschung, Fehlerprotokoll"
        >
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
              <div className="flex flex-col gap-2">
                <p className="text-xs text-white/40">
                  {hasBiometric() ? 'Face ID / Touch ID + PIN aktiv.' : 'PIN aktiv.'} Wird beim nächsten Öffnen abgefragt.
                </p>
                <PillButton variant="danger" size="sm" icon={<Trash2 size={13} />} onClick={deactivateLock}>
                  Sperre deaktivieren
                </PillButton>
              </div>
            )}
          </CollapsibleCard>

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

            <div className="mt-4 pt-4 border-t border-white/8">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-white/60 uppercase tracking-wider">Geräteübergreifend (Server)</p>
                <PillButton
                  variant="secondary"
                  size="sm"
                  icon={<RefreshCw size={12} className={remoteErrorsLoading ? 'animate-spin' : ''} />}
                  onClick={loadRemoteErrors}
                  disabled={remoteErrorsLoading || !getApiKey()}
                >
                  {remoteErrors === null ? 'Laden' : 'Aktualisieren'}
                </PillButton>
              </div>
              {!getApiKey() ? (
                <p className="text-xs text-white/40">Kein API-Key hinterlegt — globales Protokoll nicht verfügbar.</p>
              ) : remoteErrors === null ? (
                <p className="text-xs text-white/40">Noch nicht geladen.</p>
              ) : remoteErrors.length === 0 ? (
                <p className="text-xs text-white/40">Keine Fehler aufgezeichnet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                    {remoteErrors.map(e => (
                      <div key={e.id} className="rounded-card_sm border border-white/8 bg-white/[0.03] p-2">
                        <p className="text-[11px] font-medium text-white/70">
                          {e.context}
                          <span className="text-white/30"> · {new Date(e.time).toLocaleString('de-DE')}</span>
                          {e.device && <span className="text-white/30"> · {e.device.slice(0, 40)}</span>}
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
                          await navigator.clipboard.writeText(JSON.stringify(remoteErrors, null, 2))
                          notify('Globales Protokoll kopiert')
                        } catch { /* clipboard unavailable */ }
                      }}
                    >
                      Kopieren
                    </PillButton>
                    <PillButton variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={handleClearRemoteErrors}>
                      Leeren
                    </PillButton>
                  </div>
                </div>
              )}
            </div>
          </CollapsibleCard>
        </SettingsGroup>

      </div>

      {/* Pinned footer — sticks to the bottom of the scrollable viewport.
          The page-scroll container's usual pb-28 clearance (see AppShell) is
          removed for this page and absorbed here as pb-28 instead, so the
          blurred background itself extends all the way down behind the nav
          rather than leaving a plain transparent gap below the footer. */}
      <div
        className="sticky bottom-0 left-0 right-0 flex flex-col"
        style={{
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          background: 'linear-gradient(to top, rgba(10,10,15,0.85) 60%, transparent)',
        }}
      >
        {/* <div className="flex justify-center">
          <PillButton variant="ghost" size="sm" icon={<Eye size={13} />} onClick={() => setPreviewLoader(true)}>
            Ladeanimation ansehen
          </PillButton>
        </div> */}

        <GlassCard padding="sm"
        style={{
          background: 'rgb(10,10,15,0.05)',
          border: 'none',
          paddingBottom: '98px',
          paddingTop: '5px',
        }}
        >
          <button
            onClick={() => window.location.reload()}
            className="w-full text-xs text-white/20 text-center active:opacity-50 transition-opacity">
            <span className="ml-2 text-white/80 tracking-widest uppercase">FinAnts  •</span><span className="ml-2 text-white/80">{import.meta.env.DEV ? `local V${DEV_VERSION}` : `git ${__APP_VERSION__}`}</span>
          </button>
        </GlassCard>
      </div>
      </div>

      {createPortal(
        <AnimatePresence>
          {localImportOpen && (
            <>
              <motion.div
                key="local-import-backdrop"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md"
                onClick={handleAbortLocal}
              />
              <motion.div
                key="local-import-dialog"
                initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="fixed inset-0 z-51 flex items-center justify-center px-6 pointer-events-none"
              >
                <div
                  className="pointer-events-auto w-full max-w-xs rounded-2xl border border-white/10 overflow-hidden"
                  style={{ background: 'linear-gradient(160deg, rgba(28,24,46,0.2) 0%, rgba(18,15,36,0.6) 100%)', backdropFilter: 'blur(var(--blur-modal))', WebkitBackdropFilter: 'blur(var(--blur-modal))' }}
                >
                  <div className="flex flex-col items-center gap-1 px-5 pt-6 pb-4 text-center">
                    <div className="w-11 h-11 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center mb-2">
                      <AlertCircle size={18} className="text-amber-400" />
                    </div>
                    <p className="text-sm font-semibold text-white/90">Kein API-Key hinterlegt</p>
                    <p className="text-xs text-white/50 mt-1 leading-relaxed">
                      Die CSV-Daten werden nur lokal im Browser gespeichert und nicht in die Datenbank hochgeladen.
                      Du kannst sie nach Eingabe des API-Keys jederzeit erneut importieren.
                    </p>
                  </div>
                  <div className="flex border-t border-white/8">
                    <button
                      onClick={handleAbortLocal}
                      className="flex-1 py-3.5 text-sm text-white/50 hover:text-white/80 transition-colors border-r border-white/8"
                    >
                      Abbrechen
                    </button>
                    <button
                      onClick={handleConfirmLocal}
                      className="flex-1 py-3.5 text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors"
                    >
                      Nur lokal speichern
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
