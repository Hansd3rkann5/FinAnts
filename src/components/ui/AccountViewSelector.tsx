import { useRef, useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Landmark, SlidersHorizontal } from 'lucide-react'
import type { Account } from '@/types'
import { AccountCard } from './AccountCard'
import { GlassCard } from './GlassCard'

const TYPE_LABELS: Record<Account['type'], string> = {
  giro: 'Girokonto',
  savings: 'Sparkonto',
  depot: 'Depot',
  loan: 'Kredit',
  other: 'Konto',
}

function formatEur(v: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits }).format(v)
}

interface Props {
  accounts: Account[]
  isAccountSelected: (iban: string) => boolean
  toggleAccount: (iban: string) => void
}

// Replaces the old static "Kontostand" card once real accounts are connected
// — same balance display, but now backed by whichever account(s) are toggled
// on below, summed together when more than one is selected. Independent of
// Account.included (that one only governs Gesamtvermögen).
export function AccountViewSelector({ accounts, isAccountSelected, toggleAccount }: Props) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState({ right: 0, top: 0 })

  useLayoutEffect(() => {
    if (!open) return
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setAnchor({ right: window.innerWidth - r.right, top: r.bottom + 6 })
  }, [open])

  const selected = accounts.filter(a => isAccountSelected(a.iban))
  const balance = selected.reduce((sum, a) => sum + a.balance, 0)

  const label =
    selected.length === 0 ? 'Keine Konten ausgewählt'
    : selected.length === 1 ? (selected[0].description || TYPE_LABELS[selected[0].type])
    : selected.length === accounts.length ? 'Alle Konten'
    : `${selected.length} Konten`

  return (
    <GlassCard id="card-account-view" glow="purple" className="mx-4">
      <div className="flex items-center gap-2 mb-1">
        <Landmark size={14} className="text-purple-400" />
        <p id="account-view-label" className="text-xs text-white/40 truncate flex-1 min-w-0">{label}</p>

        <button
          id="btn-account-view-toggle"
          ref={btnRef}
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-label="Konten auswählen"
          className={`w-6 h-6 flex items-center justify-center rounded-full shrink-0 transition-colors ${
            open ? 'text-white/70 bg-white/10' : 'text-white/30 hover:text-white/60 hover:bg-white/5'
          }`}
        >
          <SlidersHorizontal size={11} />
        </button>
      </div>

      <motion.p
        key={balance}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className={`text-3xl font-bold ${balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
      >
        {formatEur(balance)}
      </motion.p>

      {createPortal(
        <AnimatePresence>
          {open && (
            <>
              <div className="fixed inset-0 z-100" onClick={() => setOpen(false)} />
              <motion.div
                id="account-view-dropdown"
                initial={{ opacity: 0, scale: 0.88, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.88, y: -4 }}
                transition={{ duration: 0.14, ease: [0.4, 0, 0.2, 1] }}
                style={{
                  transformOrigin: 'top right',
                  backgroundColor: 'rgba(39, 0, 105, 0.59)',
                  right: anchor.right, top: anchor.top,
                  backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                }}
                className="fixed z-110 border border-white/10 rounded-xl shadow-xl overflow-hidden p-2 w-72 max-h-80 overflow-y-auto"
              >
                <div className="flex flex-col gap-2">
                  {accounts.map(a => (
                    <AccountCard
                      key={a.iban}
                      account={{ ...a, included: isAccountSelected(a.iban) }}
                      onToggle={toggleAccount}
                      showToggle
                    />
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </GlassCard>
  )
}
