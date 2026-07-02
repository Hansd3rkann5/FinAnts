import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, AlertCircle } from 'lucide-react'
import type { Transaction } from '@/types'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { detectAndParse } from '@/utils/csvParser'
import { getApiKey } from '@/utils/cfAuth'
import { CollapsibleCard, StatusBanner, type ImportStatus, type OnLoader } from './shared'

export function CsvImportSection({ onLoader }: { onLoader: OnLoader }) {
  const { importTransactions, importLocalOnly } = useTransactionsCtx()

  const fileRef = useRef<HTMLInputElement>(null)
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle')
  const [importMessage, setImportMessage] = useState('')
  const [importPhase, setImportPhase] = useState('')
  const [pendingParsed, setPendingParsed] = useState<Transaction[] | null>(null)
  const [localImportOpen, setLocalImportOpen] = useState(false)

  useEffect(() => {
    onLoader(importStatus === 'parsing' ? (importPhase || 'Buchungen werden importiert…') : null)
  }, [importStatus, importPhase, onLoader])

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

  return (
    <>
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
