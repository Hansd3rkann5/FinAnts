import { useState } from 'react'
import { SlidersHorizontal, Trash2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { PillButton } from '@/components/ui/PillButton'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { CATEGORIES } from '@/data/categories'
import { CollapsibleCard } from './shared'

export function MerchantProfilesSection() {
  const { merchantProfiles, deleteProfile } = useTransactionsCtx()
  const [confirmClearAll, setConfirmClearAll] = useState(false)

  function handleDeleteAll() {
    for (const p of merchantProfiles) deleteProfile(p.id)
    setConfirmClearAll(false)
  }

  const count = merchantProfiles.length

  return (
    <CollapsibleCard
      icon={<SlidersHorizontal size={15} className="text-white/40 shrink-0" />}
      title="Bezeichnungsregeln"
      statusText={count === 0 ? 'Keine Regeln aktiv' : `${count} ${count === 1 ? 'Regel' : 'Regeln'} aktiv`}
    >
      {count === 0 ? (
        <p className="text-xs text-white/40">
          Keine Regeln vorhanden. Regeln entstehen, wenn du bei einer Buchung Bezeichnung, Symbol oder Kategorie anpasst.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-white/40 mb-1">
            Diese Regeln werden automatisch auf passende Buchungen angewendet. Lösche eine Regel, wenn sie falsch zuordnet.
          </p>

          <div className="flex flex-col gap-2">
            {merchantProfiles.map(p => {
              const cat = p.categoryId ? CATEGORIES[p.categoryId as keyof typeof CATEGORIES] : null
              return (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-start gap-2 p-2.5 rounded-card_sm border border-white/8 bg-white/[0.03]"
                >
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    {/* match strings */}
                    <div className="flex flex-wrap gap-1">
                      {p.matchStrings.map(s => (
                        <span
                          key={s}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/8 text-white/60 border border-white/10"
                        >
                          {p.matchMode === 'exact' ? `= "${s}"` : `"${s}"`}
                        </span>
                      ))}
                    </div>
                    {/* what gets applied */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {p.customIcon && (
                        <span className="text-sm leading-none">{p.customIcon}</span>
                      )}
                      {p.label && (
                        <span className="text-[11px] text-white/80 font-medium truncate max-w-[140px]">
                          {p.label}
                        </span>
                      )}
                      {cat && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full border"
                          style={{
                            color: cat.color,
                            borderColor: `${cat.color}40`,
                            backgroundColor: `${cat.color}18`,
                          }}
                        >
                          {cat.icon} {cat.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteProfile(p.id)}
                    className="shrink-0 mt-0.5 p-1 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </motion.div>
              )
            })}
          </div>

          <div className="pt-1">
            <AnimatePresence mode="wait">
              {!confirmClearAll ? (
                <motion.div key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <PillButton
                    variant="danger"
                    size="sm"
                    icon={<Trash2 size={13} />}
                    onClick={() => setConfirmClearAll(true)}
                  >
                    Alle löschen
                  </PillButton>
                </motion.div>
              ) : (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col gap-2"
                >
                  <p className="text-xs text-red-400/80">Alle {count} Regeln wirklich löschen?</p>
                  <div className="flex gap-2">
                    <PillButton variant="danger" size="sm" onClick={handleDeleteAll}>Ja, alle löschen</PillButton>
                    <PillButton variant="ghost" size="sm" onClick={() => setConfirmClearAll(false)}>Abbrechen</PillButton>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </CollapsibleCard>
  )
}
