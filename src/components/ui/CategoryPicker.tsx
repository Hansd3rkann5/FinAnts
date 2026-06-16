import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useAllCategories } from '@/hooks/useAllCategories'
import { useModalRegistration } from '@/hooks/useModalRegistration'

interface Props {
  open: boolean
  current: string
  onSelect: (id: string) => void
  onClose: () => void
}

export function CategoryPicker({ open, current, onSelect, onClose }: Props) {
  useModalRegistration(open)
  const { allList } = useAllCategories()
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            id="modal-catpicker-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            id="modal-cat-picker"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="fixed mx-3 bottom-0 left-0 right-0 z-50 rounded-t-[28px] bg-[#1a1a288c] border-t border-white/10"
            style={{
              borderRadius: '28px 28px 0 0',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
            }}
          >
            <div id="cat-picker-header" className="p-4 border-b border-white/[0.06] flex items-center justify-between">
              <h3 id="cat-picker-title" className="text-white font-semibold">Kategorie wählen</h3>
              <button id="btn-catpicker-close" onClick={onClose} className="text-white/40 hover:text-white/80 p-1 rounded-full">
                <X size={18} />
              </button>
            </div>
            <div id="cat-picker-grid" className="p-4 grid grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto">
              {allList.map(cat => (
                <button
                  key={cat.id}
                  id={`btn-catpicker-cat-${cat.id}`}
                  onClick={() => { onSelect(cat.id); onClose() }}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-card_sm border transition-all duration-150 active:scale-95"
                  style={{
                    backgroundColor: cat.id === current ? `${cat.color}20` : 'rgba(255,255,255,0.04)',
                    borderColor: cat.id === current ? `${cat.color}50` : 'rgba(255,255,255,0.08)',
                  }}
                >
                  <span className="text-2xl">{cat.icon}</span>
                  <span className="text-xs text-white/70 text-center leading-tight">{cat.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
