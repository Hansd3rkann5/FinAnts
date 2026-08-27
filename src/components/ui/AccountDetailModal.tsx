import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Pencil, Upload, Calculator, ChevronRight, ChevronDown, TrendingUp, TrendingDown } from 'lucide-react'
import { useModalRegistration } from '@/hooks/useModalRegistration'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { formatEur } from '@/utils/format'
import type { Account, Transaction } from '@/types'

interface BalanceBreakdown {
  baseBalance: number
  savedAt: string
  deltaTransactions: Transaction[]
}

interface Props {
  open: boolean
  onClose: () => void
  account: Account
  breakdown?: BalanceBreakdown
}

function BreakdownSection({ breakdown, finalBalance }: { breakdown: BalanceBreakdown; finalBalance: number }) {
  const [expanded, setExpanded] = useState(false)
  const delta = breakdown.deltaTransactions.reduce((s, t) => s + t.amount, 0)
  const savedDate = new Date(breakdown.savedAt).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-3">
        <Calculator size={13} className="text-purple-400" />
        <p className="text-xs font-semibold text-white/70">Kontostand-Berechnung</p>
      </div>

      {/* Basis */}
      <div className="rounded-xl border border-white/8 bg-white/[0.03] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/6">
          <div>
            <p className="text-xs text-white/60">Basis-Kontostand</p>
            <p className="text-[10px] text-white/25 mt-0.5">gespeichert am {savedDate}</p>
          </div>
          <p className="text-sm font-semibold text-white/80">{formatEur(breakdown.baseBalance, 2)}</p>
        </div>

        {/* Delta toggle */}
        {breakdown.deltaTransactions.length > 0 && (
          <>
            <button
              onClick={() => setExpanded(e => !e)}
              className="w-full flex items-center justify-between px-4 py-3 border-b border-white/6 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-2">
                {expanded ? <ChevronDown size={12} className="text-white/30" /> : <ChevronRight size={12} className="text-white/30" />}
                <p className="text-xs text-white/50">
                  {breakdown.deltaTransactions.length} neue Buchung{breakdown.deltaTransactions.length !== 1 ? 'en' : ''}
                </p>
              </div>
              <p className={`text-xs font-medium ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {delta >= 0 ? '+' : ''}{formatEur(delta, 2)}
              </p>
            </button>

            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="border-b border-white/6">
                    {breakdown.deltaTransactions.map(t => (
                      <div key={t.id} className="flex items-center justify-between px-4 py-2.5 border-b border-white/4 last:border-0">
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="text-[11px] text-white/70 truncate">{t.customLabel ?? t.counterparty}</p>
                          <p className="text-[9px] text-white/25 mt-0.5">
                            {t.date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {t.amount >= 0
                            ? <TrendingUp size={9} className="text-emerald-400" />
                            : <TrendingDown size={9} className="text-red-400" />}
                          <p className={`text-xs font-medium tabular-nums ${t.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {t.amount >= 0 ? '+' : ''}{formatEur(t.amount, 2)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {/* Result */}
        <div className="flex items-center justify-between px-4 py-3 bg-purple-500/8">
          <p className="text-xs font-semibold text-white/60">Aktueller Stand</p>
          <p className={`text-base font-bold ${finalBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatEur(finalBalance, 2)}
          </p>
        </div>
      </div>
    </div>
  )
}

function EditSection({ account, onClose }: { account: Account; onClose: () => void }) {
  const { upsertAccount } = useTransactionsCtx()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(account.description ?? '')
  const [logo, setLogo] = useState<string | undefined>(account.customLogo)
  const [saving, setSaving] = useState(false)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setLogo(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  function handleSave() {
    setSaving(true)
    upsertAccount({ ...account, description: name.trim() || account.description, customLogo: logo })
    setTimeout(() => { setSaving(false); onClose() }, 200)
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Pencil size={13} className="text-purple-400" />
        <p className="text-xs font-semibold text-white/70">Konto bearbeiten</p>
      </div>

      <div className="flex flex-col gap-3">
        {/* Logo */}
        <div>
          <p className="text-[10px] text-white/35 mb-2 uppercase tracking-wider">Logo</p>
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl border border-white/10 bg-white/[0.04] flex items-center justify-center overflow-hidden shrink-0"
            >
              {logo
                ? <img src={logo} alt="Logo" className="w-full h-full object-contain" />
                : <span className="text-2xl">🏦</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/12 text-white/50 hover:text-white/80 hover:border-white/25 transition-colors"
              >
                <Upload size={11} />
                Bild wählen
              </button>
              {logo && (
                <button
                  onClick={() => setLogo(undefined)}
                  className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors text-left pl-1"
                >
                  Entfernen
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>
        </div>

        {/* Name */}
        <div>
          <p className="text-[10px] text-white/35 mb-2 uppercase tracking-wider">Anzeigename</p>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={account.description || 'Konto-Bezeichnung'}
            className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/40 transition-colors"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 rounded-xl bg-purple-600/80 hover:bg-purple-600 active:scale-98 transition-all text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Gespeichert ✓' : 'Speichern'}
        </button>
      </div>
    </div>
  )
}

export function AccountDetailModal({ open, onClose, account, breakdown }: Props) {
  useModalRegistration(open)

  // Compute final balance from breakdown
  const finalBalance = breakdown
    ? breakdown.baseBalance + breakdown.deltaTransactions.reduce((s, t) => s + t.amount, 0)
    : account.balance

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="acct-detail-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            key="acct-detail-sheet"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            onClick={e => e.stopPropagation()}
            className="absolute bottom-0 left-0 right-0 z-51 rounded-t-4xl border-t border-white/10 flex flex-col max-h-[88svh]"
            style={{
              background: 'linear-gradient(160deg, rgba(28,24,46,0.99) 0%, rgba(18,15,36,0.99) 100%)',
              backdropFilter: 'blur(var(--blur-modal))',
              WebkitBackdropFilter: 'blur(var(--blur-modal))',
            }}
          >
            <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mt-3 mb-1 shrink-0" />

            <div className="overflow-y-auto flex-1 min-h-0 px-5 pt-3 pb-8">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl border border-white/10 bg-white/[0.04] flex items-center justify-center overflow-hidden shrink-0">
                    {account.customLogo
                      ? <img src={account.customLogo} alt="Logo" className="w-full h-full object-contain" />
                      : <span className="text-xl">🏦</span>}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white/85">
                      {account.description || 'Konto'}
                    </h3>
                    <p className="text-[10px] text-white/30 font-mono mt-0.5">
                      {account.iban.replace(/(.{4})/g, '$1 ').trim()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-white/6 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Balance breakdown — only when breakdown data is provided (giro/Commerzbank) */}
              {breakdown && (
                <BreakdownSection breakdown={breakdown} finalBalance={finalBalance} />
              )}

              {/* Edit section */}
              <EditSection account={account} onClose={onClose} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.getElementById('app-shell') ?? document.body,
  )
}
