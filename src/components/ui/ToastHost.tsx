import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Info, X } from 'lucide-react'
import { useToasts } from '@/utils/notify'

// Stacked, auto-dismissing toasts that slide in from the top. Glassy pill
// styling with a backdrop blur, matching the app's aesthetic. Mounted once.
export function ToastHost() {
  const { toasts, dismiss } = useToasts()
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-x-0 z-[300] flex flex-col items-center gap-2 px-4 pointer-events-none"
      style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <AnimatePresence initial={false}>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className={`pointer-events-auto w-full max-w-sm flex items-start gap-2.5 rounded-pill border px-4 py-2.5 shadow-lg backdrop-blur-xl ${
              t.kind === 'error'
                ? 'bg-red-500/15 border-red-500/30 text-red-100'
                : 'bg-white/10 border-white/15 text-white/90'
            }`}
          >
            <span className="shrink-0 mt-0.5">
              {t.kind === 'error' ? <AlertCircle size={15} /> : <Info size={15} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold leading-tight truncate">{t.title}</p>
              {t.detail && <p className="text-[11px] leading-snug text-current/70 mt-0.5 break-words">{t.detail}</p>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Schließen"
              className="shrink-0 -mr-1 text-current/60 hover:text-current transition-colors"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  )
}
