import { useRef, useState } from 'react'
import { Upload, Trash2, FileText, AlertCircle, CheckCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/ui/GlassCard'
import { PillButton } from '@/components/ui/PillButton'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { detectAndParse } from '@/utils/csvParser'

type ImportStatus = 'idle' | 'parsing' | 'success' | 'error'

export function Settings() {
  const { transactions, importTransactions, clearAll } = useTransactionsCtx()
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<ImportStatus>('idle')
  const [message, setMessage] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  async function handleFile(file: File) {
    setStatus('parsing')
    setMessage('')
    try {
      const text = await file.text()
      const parsed = detectAndParse(text)
      if (parsed.length === 0) {
        throw new Error('Keine Buchungen gefunden. Bitte prüfe das Dateiformat.')
      }
      importTransactions(parsed)
      setStatus('success')
      setMessage(`${parsed.length} Buchungen importiert`)
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Unbekannter Fehler')
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

  return (
    <div className="flex flex-col gap-4">
      {/* Import section */}
      <GlassCard>
        <h2 className="text-sm font-semibold text-white/80 mb-1">Buchungen importieren</h2>
        <p className="text-xs text-white/40 mb-4">
          Exportiere deine Buchungen aus dem Commerzbank OnlineBanking als CSV-Datei und lade sie hier hoch.
          Alle Daten werden ausschließlich lokal in deinem Browser gespeichert.
        </p>

        {/* Drop zone */}
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-white/[0.12] rounded-card hover:border-purple-500/40 hover:bg-purple-500/5 transition-all duration-200 cursor-pointer p-8 flex flex-col items-center gap-3 text-center active:scale-[0.99]"
        >
          <div className="w-12 h-12 rounded-card_sm bg-purple-500/15 flex items-center justify-center text-purple-400">
            <Upload size={22} />
          </div>
          <div>
            <p className="text-sm text-white/70 font-medium">CSV oder MT940 hochladen</p>
            <p className="text-xs text-white/30 mt-1">Tippe hier oder ziehe die Datei hinein</p>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt,.mt940,.sta" className="hidden" onChange={onFileChange} />
        </div>

        {/* Status feedback */}
        <AnimatePresence>
          {status !== 'idle' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={`mt-3 flex items-start gap-2 p-3 rounded-card_sm text-xs border ${
                status === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : status === 'error'
                  ? 'bg-red-500/10 border-red-500/20 text-red-400'
                  : 'bg-white/5 border-white/10 text-white/50'
              }`}
            >
              {status === 'success' && <CheckCircle size={14} className="shrink-0 mt-0.5" />}
              {status === 'error'   && <AlertCircle size={14} className="shrink-0 mt-0.5" />}
              {status === 'parsing' && <FileText size={14} className="shrink-0 mt-0.5 animate-pulse" />}
              <span>{status === 'parsing' ? 'Datei wird verarbeitet…' : message}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* Instructions */}
      <GlassCard>
        <h2 className="text-sm font-semibold text-white/80 mb-3">Commerzbank Export – Anleitung</h2>
        <ol className="flex flex-col gap-2 text-xs text-white/50">
          {[
            'Öffne die Commerzbank App oder banking.commerzbank.de',
            'Navigiere zu deinem Konto → Umsätze',
            'Wähle den Zeitraum und tippe auf „Exportieren"',
            'Wähle das Format CSV (Semikolon-getrennt)',
            'Lade die heruntergeladene Datei hier hoch',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-4 h-4 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-400 text-[10px] flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </GlassCard>

      {/* Data management */}
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
              <PillButton variant="danger" size="sm" onClick={() => { clearAll(); setShowConfirm(false); setStatus('idle') }}>
                Ja, löschen
              </PillButton>
              <PillButton variant="ghost" size="sm" onClick={() => setShowConfirm(false)}>
                Abbrechen
              </PillButton>
            </div>
          </motion.div>
        )}
      </GlassCard>

      {/* App info */}
      <GlassCard padding="sm">
        <p className="text-xs text-white/20 text-center">
          FinAnts · Deine Finanzen, lokal & privat
        </p>
      </GlassCard>
    </div>
  )
}
