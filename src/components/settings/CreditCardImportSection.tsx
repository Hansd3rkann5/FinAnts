import { useState, useRef, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { CreditCard, Upload } from 'lucide-react'
import type { Transaction } from '@/types'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { useAllCategories } from '@/hooks/useAllCategories'
import { parseMastercardCSV } from '@/utils/csvParser'
import { getApiKey } from '@/utils/cfAuth'
import { CollapsibleCard, StatusBanner, type ImportStatus, type OnLoader } from './shared'

// Settlement-row date vs the Giro booking date can differ by a few days.
const CC_DATE_TOL_DAYS = 6

export function CreditCardImportSection({ onLoader }: { onLoader: OnLoader }) {
  const { transactions, importTransactions, importLocalOnly, setSplit } = useTransactionsCtx()
  const { allList: allCategories } = useAllCategories()

  const ccFileInputRef = useRef<HTMLInputElement>(null)
  const [ccStatus, setCcStatus] = useState<ImportStatus>('idle')
  const [ccMessage, setCcMessage] = useState('')
  const [ccLastImport, setCcLastImport] = useState<string | null>(null)

  useEffect(() => {
    onLoader(ccStatus === 'parsing' ? 'Kreditkartenumsätze werden importiert…' : null)
  }, [ccStatus, onLoader])

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
        // Biggest spend first, same convention as computeCreditCardBucket / CategoryBreakdownModal.
        splits.sort((a, b) => a.amount - b.amount)
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

  return (
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
  )
}
