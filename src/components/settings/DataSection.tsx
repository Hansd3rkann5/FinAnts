import { useState } from 'react'
import { motion } from 'framer-motion'
import { Database, Trash2 } from 'lucide-react'
import { PillButton } from '@/components/ui/PillButton'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { CollapsibleCard } from './shared'

export function DataSection() {
  const { transactions, clearAll } = useTransactionsCtx()
  const [showConfirm, setShowConfirm] = useState(false)

  return (
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
            <PillButton variant="danger" size="sm" onClick={() => { clearAll(); setShowConfirm(false) }}>
              Ja, löschen
            </PillButton>
            <PillButton variant="ghost" size="sm" onClick={() => setShowConfirm(false)}>
              Abbrechen
            </PillButton>
          </div>
        </motion.div>
      )}
    </CollapsibleCard>
  )
}
