import { useState } from 'react'
import { useModalRegistration } from '@/hooks/useModalRegistration'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Smartphone, MessageSquare, Shield } from 'lucide-react'
import { PillButton } from './PillButton'
import type { TanChallenge } from '@/hooks/useWorkerSync'

interface Props {
  challenge: TanChallenge
  onSubmit: (tan: string) => void
  onDismiss: () => void
  loading?: boolean
}

const METHOD_LABEL: Record<TanChallenge['method'], string> = {
  photoTAN: 'PhotoTAN',
  pushTAN: 'pushTAN',
  smsTAN: 'smsTAN',
  other: 'TAN',
}

const METHOD_ICON: Record<TanChallenge['method'], React.ReactNode> = {
  photoTAN: <Shield size={18} />,
  pushTAN: <Smartphone size={18} />,
  smsTAN: <MessageSquare size={18} />,
  other: <Shield size={18} />,
}

export function PhotoTanModal({ challenge, onSubmit, onDismiss, loading = false }: Props) {
  useModalRegistration(true)
  const [tan, setTan] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (tan.trim()) onSubmit(tan.trim())
  }

  return (
    <AnimatePresence>
      <motion.div
        key="tan-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-end"
        style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(var(--blur-modal))' }}
        onClick={onDismiss}
      >
        <motion.div
          key="tan-sheet"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 380, damping: 40 }}
          onClick={e => e.stopPropagation()}
          className="w-full rounded-t-[2rem] border border-white/10 pb-safe"
          style={{
            background: 'linear-gradient(135deg, rgba(30,28,48,0.98) 0%, rgba(20,18,38,0.99) 100%)',
            paddingTop: '1.5rem',
            paddingLeft: '1.25rem',
            paddingRight: '1.25rem',
            paddingBottom: '2rem',
          }}
        >
          {/* Handle bar */}
          <div className="w-10 h-1 rounded-pill bg-white/15 mx-auto mb-6" />

          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-card_sm bg-purple-500/15 border border-purple-500/20 flex items-center justify-center text-purple-400">
              {METHOD_ICON[challenge.method]}
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-white">
                {METHOD_LABEL[challenge.method]} erforderlich
              </h2>
              <p className="text-xs text-white/40">Commerzbank-Authentifizierung</p>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="w-8 h-8 rounded-full bg-white/6 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          {/* PhotoTAN image */}
          {challenge.imageBase64 && (
            <div className="mb-5 rounded-card overflow-hidden border border-white/10 bg-white flex items-center justify-center">
              <img
                src={`data:image/png;base64,${challenge.imageBase64}`}
                alt="PhotoTAN"
                className="w-full max-w-[280px] mx-auto"
              />
            </div>
          )}

          {/* Hint text */}
          {challenge.method === 'pushTAN' && (
            <div className="mb-5 p-3 rounded-card_sm bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
              <p className="font-medium mb-1">pushTAN-App öffnen</p>
              <p className="text-blue-300/70">
                Bestätige den Auftrag in deiner Commerzbank pushTAN-App und gib dann die angezeigte TAN hier ein.
              </p>
            </div>
          )}

          {challenge.hint && (
            <p className="mb-4 text-xs text-white/50 text-center">{challenge.hint}</p>
          )}

          {/* TAN input */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">
                TAN eingeben
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="z.B. 123456"
                value={tan}
                onChange={e => setTan(e.target.value)}
                autoFocus
                className="w-full rounded-card_sm bg-white/6 border border-white/10 px-4 py-3 text-center text-xl font-mono tracking-[0.3em] text-white placeholder-white/20 outline-none focus:border-purple-500/50 transition-colors"
              />
            </div>

            <PillButton
              type="submit"
              variant="primary"
              size="lg"
              disabled={!tan.trim() || loading}
            >
              {loading ? 'Wird geprüft…' : 'Bestätigen'}
            </PillButton>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
