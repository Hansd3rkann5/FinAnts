import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Pencil, Trash2, Plus } from 'lucide-react'
import type { Category } from '@/types'
import { CATEGORIES } from '@/data/categories'
import { useModalRegistration } from '@/hooks/useModalRegistration'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { useAllCategories } from '@/hooks/useAllCategories'
import { CategoryCreateModal } from './CategoryCreateModal'

interface Props {
  open: boolean
  onClose: () => void
}

export function CategoryManageModal({ open, onClose }: Props) {
  useModalRegistration(open)
  const { addCustomCategory, upsertCategory, deleteCustomCategory } = useTransactionsCtx()
  const { allList } = useAllCategories()
  const [editItem, setEditItem] = useState<Category | undefined>()
  const [createOpen, setCreateOpen] = useState(false)

  function openCreate() { setEditItem(undefined); setCreateOpen(true) }
  function openEdit(cat: Category) { setEditItem(cat); setCreateOpen(true) }

  return createPortal(
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              id="modal-catmgr-backdrop"
              key="catmgr-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md"
              onClick={onClose}
            />
            <motion.div
              id="modal-catmgr-sheet"
              key="catmgr-sheet"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 40 }}
              onClick={e => e.stopPropagation()}
              className="absolute bottom-0 left-0 right-0 z-51 rounded-t-4xl border-t border-white/10 flex flex-col max-h-[88svh]"
              style={{ background: 'linear-gradient(160deg, rgba(28,24,46,0.99) 0%, rgba(18,15,36,0.99) 100%)' }}
            >
              <div id="modal-catmgr-handle" className="w-10 h-1 rounded-full bg-white/15 mx-auto mt-3 mb-1 shrink-0" />

              <div id="modal-catmgr-scroll" className="overflow-y-auto flex-1 min-h-0 px-5 pt-3 pb-24">
                <div id="modal-catmgr-header" className="flex items-center justify-between mb-5">
                  <h3 id="modal-catmgr-title" className="text-sm font-semibold text-white/80">Kategorien</h3>
                  <button
                    id="btn-catmgr-close"
                    onClick={onClose}
                    className="w-8 h-8 rounded-full bg-white/6 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
                  >
                    <X id="icon-catmgr-close" size={15} />
                  </button>
                </div>

                <div id="catmgr-list" className="flex flex-col gap-2">
                  {allList.map(cat => {
                    const isBuiltIn = !!CATEGORIES[cat.id]
                    return (
                      <div
                        id={`catmgr-row-${cat.id}`}
                        key={cat.id}
                        className="flex items-center gap-3 rounded-card_sm px-3 py-2.5 bg-white/4 border border-white/6"
                      >
                        <div
                          id={`catmgr-icon-${cat.id}`}
                          className="w-8 h-8 rounded-card_sm flex items-center justify-center shrink-0 text-base"
                          style={{ backgroundColor: `${cat.color}22`, border: `1.5px solid ${cat.color}50` }}
                        >
                          {cat.icon.startsWith('data:') || cat.icon.startsWith('http')
                            ? <img id={`catmgr-img-${cat.id}`} src={cat.icon} alt="" className="w-full h-full object-cover rounded-card_sm" />
                            : cat.icon}
                        </div>
                        <span id={`catmgr-label-${cat.id}`} className="flex-1 text-sm text-white/80 truncate">{cat.label}</span>
                        <button
                          id={`btn-catmgr-edit-${cat.id}`}
                          onClick={() => openEdit(cat)}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white/30 hover:text-white/70 transition-colors"
                        >
                          <Pencil id={`icon-catmgr-edit-${cat.id}`} size={13} />
                        </button>
                        {!isBuiltIn && (
                          <button
                            id={`btn-catmgr-delete-${cat.id}`}
                            onClick={() => deleteCustomCategory(cat.id)}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white/30 hover:text-red-400 transition-colors"
                          >
                            <Trash2 id={`icon-catmgr-delete-${cat.id}`} size={13} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

              </div>

              <button
                id="btn-catmgr-new"
                onClick={openCreate}
                className="absolute bottom-4 left-4 right-4 flex items-center justify-center gap-2 py-4 rounded-card_sm border border-white/10 text-sm text-white/50 hover:text-white/70 transition-colors active:opacity-60"
                style={{
                  backdropFilter: 'blur(1px)',
                  WebkitBackdropFilter: 'blur(6px)',
                  background: 'rgba(30, 30, 30, 0.7)',
                  boxShadow: '0 40px 20px 20px rgba(10,10,10,0.7), 0 10px 20px 10px rgba(10,10,10,0.7)',
                }}
              >
                <Plus id="icon-catmgr-new" size={15} />
                Neue Kategorie
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <CategoryCreateModal
        open={createOpen}
        editItem={editItem}
        onClose={() => { setCreateOpen(false); setEditItem(undefined) }}
        onSave={cat => { addCustomCategory(cat); setCreateOpen(false) }}
        onUpdate={(id, patch) => { upsertCategory(id, patch); setCreateOpen(false); setEditItem(undefined) }}
      />
    </>,
    document.body
  )
}
