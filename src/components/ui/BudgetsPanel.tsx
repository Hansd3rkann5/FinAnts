import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { PiggyBank, Plus, Trash2, ChevronDown } from 'lucide-react'
import type { Transaction } from '@/types'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { useAllCategories } from '@/hooks/useAllCategories'
import { useModalRegistration } from '@/hooks/useModalRegistration'
import { isExcluded } from '@/data/categories'
import { categoryPortions } from '@/utils/chartCompute'
import { GlassCard } from './GlassCard'
import { CollapsibleHeader, CollapsibleBody } from './ChartHeader'
import { PillButton } from './PillButton'
import { CategoryPicker } from './CategoryPicker'
import { formatEur } from '@/utils/format'

// Per-category spending limits ("Budgets") checked against the current
// calendar month. Spend is split-aware (categoryPortions), so credit-card
// bucket breakdowns count under their real categories.
export function BudgetsPanel({ transactions }: { transactions: Transaction[] }) {
  const { budgets, setBudget, removeBudget } = useTransactionsCtx()
  const { allMap } = useAllCategories()

  const [collapsed, setCollapsed] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null)
  const [limitInput, setLimitInput] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  useModalRegistration(editorOpen)

  const monthLabel = new Date().toLocaleDateString('de-DE', { month: 'long' })

  // Current-month expenses per category, positive euros.
  const spentByCategory = useMemo(() => {
    const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const spent = new Map<string, number>()
    for (const t of transactions) {
      if (t.isPending || isExcluded(t) || t.date < start) continue
      for (const p of categoryPortions(t)) {
        if (p.amount < 0) spent.set(p.categoryId, (spent.get(p.categoryId) ?? 0) - p.amount)
      }
    }
    return spent
  }, [transactions])

  function openAdd() {
    setEditCategoryId(null)
    setLimitInput('')
    setEditorOpen(true)
  }

  function openEdit(categoryId: string, limit: number) {
    setEditCategoryId(categoryId)
    setLimitInput(String(limit).replace('.', ','))
    setEditorOpen(true)
  }

  function save() {
    const limit = parseFloat(limitInput.replace(',', '.'))
    if (!editCategoryId || isNaN(limit) || limit <= 0) return
    setBudget(editCategoryId, limit)
    setEditorOpen(false)
  }

  function remove() {
    if (editCategoryId) removeBudget(editCategoryId)
    setEditorOpen(false)
  }

  const editCategory = editCategoryId ? allMap[editCategoryId] : null
  const isNew = editCategoryId === null || !budgets.some(b => b.categoryId === editCategoryId)

  return (
    <GlassCard id="card-budgets" glow="purple" >
      <CollapsibleHeader
        className="mb-1"
        icon={<PiggyBank size={14} className="text-purple-400" />}
        title="Budgets"
        collapsed={collapsed}
        onToggle={() => setCollapsed(c => !c)}
        right={
          <>
            <span className="text-[10px] text-white/30">{monthLabel}</span>
            <button
              id="btn-budget-add"
              onClick={openAdd}
              aria-label="Budget hinzufügen"
              className="w-6 h-6 flex items-center justify-center rounded-full text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              <Plus size={13} />
            </button>
          </>
        }
      />

      <CollapsibleBody collapsed={collapsed}>
      {budgets.length === 0 ? (
        <button onClick={openAdd} className="w-full py-4 text-xs text-white/30 text-center">
          Noch keine Budgets — tippe hier um eins anzulegen
        </button>
      ) : (
        <div className="flex flex-col gap-2.5 mt-2">
          {budgets.map(b => {
            const cat = allMap[b.categoryId]
            const spent = spentByCategory.get(b.categoryId) ?? 0
            const ratio = b.limit > 0 ? spent / b.limit : 0
            const over = ratio > 1
            return (
              <button
                key={b.categoryId}
                onClick={() => openEdit(b.categoryId, b.limit)}
                className="w-full text-left active:opacity-70 transition-opacity"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm leading-none">{cat?.icon ?? '❓'}</span>
                  <span className="text-xs text-white/70 flex-1 min-w-0 truncate">{cat?.label ?? b.categoryId}</span>
                  <span className={`text-xs font-medium ${over ? 'text-red-400' : 'text-white/60'}`}>
                    {formatEur(spent, 0)}
                    <span className="text-white/30 font-normal"> / {formatEur(b.limit, 0)}</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-pill bg-white/6 overflow-hidden">
                  <motion.div
                    className="h-full rounded-pill"
                    initial={false}
                    animate={{ width: `${Math.min(100, ratio * 100)}%` }}
                    transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                    style={{ backgroundColor: over ? '#f87171' : (cat?.color ?? 'rgba(255,255,255,0.5)') }}
                  />
                </div>
                <p className={`text-[10px] mt-0.5 ${over ? 'text-red-400/80' : 'text-white/25'}`}>
                  {over
                    ? `${formatEur(spent - b.limit, 0)} über Budget`
                    : `${formatEur(b.limit - spent, 0)} übrig · ${Math.round(ratio * 100)}%`}
                </p>
              </button>
            )
          })}
        </div>
      )}
      </CollapsibleBody>

      {createPortal(
        <AnimatePresence>
          {editorOpen && (
            <>
              <motion.div
                key="budget-editor-backdrop"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md"
                onClick={() => setEditorOpen(false)}
              />
              <motion.div
                key="budget-editor"
                initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="fixed inset-0 z-51 flex items-center justify-center px-6 pointer-events-none"
              >
                <div
                  className="pointer-events-auto w-full max-w-xs rounded-2xl border border-white/10 overflow-hidden p-5"
                  style={{ background: 'linear-gradient(160deg, rgba(28,24,46,0.2) 0%, rgba(18,15,36,0.6) 100%)', backdropFilter: 'blur(var(--blur-modal))', WebkitBackdropFilter: 'blur(var(--blur-modal))' }}
                >
                  <p className="text-sm font-semibold text-white/90 mb-4">
                    {isNew ? 'Neues Budget' : 'Budget bearbeiten'}
                  </p>

                  <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">Kategorie</label>
                  <button
                    onClick={() => setPickerOpen(true)}
                    className="w-full flex items-center gap-2 rounded-card_sm bg-white/4 border border-white/8 px-3 py-2 mb-3 text-sm text-white/80"
                  >
                    {editCategory ? (
                      <>
                        <span>{editCategory.icon}</span>
                        <span className="flex-1 text-left truncate">{editCategory.label}</span>
                      </>
                    ) : (
                      <span className="flex-1 text-left text-white/30">Kategorie wählen…</span>
                    )}
                    <ChevronDown size={13} className="text-white/30" />
                  </button>

                  <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 block">Monatliches Limit</label>
                  <div className="relative mb-4">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/40">€</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="300"
                      value={limitInput}
                      onChange={e => setLimitInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && save()}
                      className="w-full rounded-card_sm bg-white/4 border border-white/8 pl-7 pr-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/40 transition-colors"
                    />
                  </div>

                  <div className="flex gap-2">
                    {!isNew && (
                      <PillButton variant="danger" size="sm" icon={<Trash2 size={13} />} onClick={remove}>
                        Löschen
                      </PillButton>
                    )}
                    <div className="flex-1" />
                    <PillButton variant="ghost" size="sm" onClick={() => setEditorOpen(false)}>
                      Abbrechen
                    </PillButton>
                    <PillButton
                      variant="primary"
                      size="sm"
                      onClick={save}
                      disabled={!editCategoryId || !limitInput.trim() || isNaN(parseFloat(limitInput.replace(',', '.')))}
                    >
                      Speichern
                    </PillButton>
                  </div>
                </div>
              </motion.div>

              <CategoryPicker
                open={pickerOpen}
                current={editCategoryId ?? ''}
                onSelect={id => { setEditCategoryId(id); setPickerOpen(false) }}
                onClose={() => setPickerOpen(false)}
              />
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </GlassCard>
  )
}
