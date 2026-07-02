import { useState, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useModalRegistration } from '@/hooks/useModalRegistration'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { X, Pencil, Check, RotateCcw, Upload, Loader, Plus, SplitSquareHorizontal } from 'lucide-react'
import type { Transaction } from '@/types'
import { CATEGORIES } from '@/data/categories'
import { useAllCategories } from '@/hooks/useAllCategories'
import { MerchantLogo } from './MerchantLogo'
import { findMerchant } from '@/utils/merchantLogos'
import { AmountDisplay } from '@/components/ui/AmountDisplay'
import { CategoryPicker } from '@/components/ui/CategoryPicker'
import { resolveWorkerUrl } from '@/utils/workerConfig'
import { getApiKey } from '@/utils/cfAuth'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { resolveProfile } from '@/hooks/useMerchantProfiles'
import { extractPaypalMerchant } from '@/utils/transactionsApi'
import { reportError } from '@/utils/notify'
import { formatEur } from '@/utils/format'


// 17 presets = 2 rows of 9, last slot is the + button
const EMOJI_PRESETS = [
  '🛒','🍕','🍔','🍣','🍜','🥐','☕','🍷','🥤',
  '👕','👗','💻','📱','🎮','📺','🎧','👟',
]

function extractChips(tx: Transaction): string[] {
  // Include the Bezeichnung (customLabel) so e.g. the PayPal merchant name —
  // which is the main display name but not in the Buchungstext — is selectable.
  const text = `${tx.customLabel ?? ''} ${tx.counterparty} ${tx.description}`
  const tokens = text.split(/[^a-zA-ZäöüÄÖÜß]+/)
    .filter(t => t.length >= 3 && !/^\d+$/.test(t))
  return [...new Set(tokens.map(t => t.toUpperCase()))].slice(0, 14)
}

async function resizeToWebP(file: File, maxPx = 192): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objUrl = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(maxPx / img.width, maxPx / img.height, 1)
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(objUrl)
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/webp', 0.88)
    }
    img.onerror = reject
    img.src = objUrl
  })
}

async function uploadIcon(blob: Blob, workerUrl: string): Promise<string> {
  const apiKey = getApiKey()
  const res = await fetch(`${workerUrl.replace(/\/$/, '')}/upload-icon`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type, ...(apiKey ? { 'X-Api-Key': apiKey } : {}) },
    body: blob,
  })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  const data = await res.json() as { url: string }
  return data.url
}

interface Props {
  transaction: Transaction | null
  onClose: () => void
  onUpdate: (id: string, patch: Partial<Pick<Transaction, 'categoryId' | 'customLabel' | 'customIcon'>>) => void
}

export function TransactionDetailModal({ transaction: txProp, onClose, onUpdate }: Props) {
  useModalRegistration(txProp !== null)
  const { merchantProfiles, upsertProfile, transactions, setSplit, clearSplit } = useTransactionsCtx()
  // Resolve the live version from context so split/category changes applied during
  // this modal session are reflected immediately without the parent re-passing the prop.
  const tx = txProp ? (transactions.find(t => t.id === txProp.id) ?? txProp) : null
  const profile = tx ? resolveProfile(tx, merchantProfiles) : null

  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState('')
  const [category, setCategory] = useState<string>('other')
  const { allList, allMap } = useAllCategories()
  const [icon, setIcon] = useState<string | undefined>(undefined)
  const [iconTab, setIconTab] = useState<'emoji' | 'upload'>('emoji')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [matchStrings, setMatchStrings] = useState<string[]>([])
  const [matchMode, setMatchMode] = useState<'exact' | 'contains'>('exact')
  const [customInput, setCustomInput] = useState('')
  const [existingProfileId, setExistingProfileId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [emojiInputOpen, setEmojiInputOpen] = useState(false)

  function handleEmojiInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    if (!val) return
    try {
      const first = [...new Intl.Segmenter().segment(val)][0]?.segment
      if (first) { setIcon(first); setEmojiInputOpen(false) }
    } catch {
      const first = [...val][0]
      if (first) { setIcon(first); setEmojiInputOpen(false) }
    }
  }

  // ── Split (chart-only overlay) ──────────────────────────────────────────────
  const [splitting, setSplitting] = useState(false)
  const [splitCatA, setSplitCatA] = useState('other')
  const [splitCatB, setSplitCatB] = useState('other')
  const [splitAmtA, setSplitAmtA] = useState('')          // magnitude string, German decimals
  const [splitPickerFor, setSplitPickerFor] = useState<'A' | 'B' | null>(null)
  const [splitMatchStrings, setSplitMatchStrings] = useState<string[]>([])
  const [splitMatchMode, setSplitMatchMode] = useState<'exact' | 'contains'>('exact')

  const chips = useMemo(() => tx ? extractChips(tx) : [], [tx])

  const splitAffectedCount = useMemo(() => {
    if (!splitMatchStrings.length) return 0
    return transactions.filter(t => {
      const text = `${t.customLabel ?? ''} ${t.counterparty} ${t.description}`.toLowerCase()
      return splitMatchStrings.some(ms => {
        const m = ms.toLowerCase()
        return splitMatchMode === 'exact'
          ? (t.counterparty.toLowerCase() === m || (t.customLabel ?? '').toLowerCase() === m)
          : text.includes(m)
      })
    }).length
  }, [transactions, splitMatchStrings, splitMatchMode])

  function toggleSplitChip(chip: string) {
    setSplitMatchStrings(prev =>
      prev.includes(chip) ? prev.filter(s => s !== chip) : [...prev, chip]
    )
  }

  const affectedCount = useMemo(() => {
    if (!matchStrings.length) return 0
    return transactions.filter(t => {
      const text = `${t.customLabel ?? ''} ${t.counterparty} ${t.description}`.toLowerCase()
      return matchStrings.some(ms => {
        const m = ms.toLowerCase()
        return matchMode === 'exact'
          ? (t.counterparty.toLowerCase() === m || (t.customLabel ?? '').toLowerCase() === m)
          : text.includes(m)
      })
    }).length
  }, [transactions, matchStrings, matchMode])

  function toggleChip(chip: string) {
    setMatchStrings(prev =>
      prev.includes(chip) ? prev.filter(s => s !== chip) : [...prev, chip]
    )
  }

  function addCustom() {
    const s = customInput.trim()
    if (s && !matchStrings.includes(s)) setMatchStrings(prev => [...prev, s])
    setCustomInput('')
  }

  function openEdit() {
    if (!tx) return
    const p = resolveProfile(tx, merchantProfiles)
    setLabel(p?.label ?? tx.customLabel ?? tx.counterparty ?? '')
    setCategory(tx.categoryId)
    setIcon(p?.customIcon ?? tx.customIcon)
    // For PayPal rows the raw counterparty is the same boilerplate on every
    // payment ("PayPal Europe S.a.r.l. …") — seeding the pattern with it made
    // a rename of ONE PayPal payment relabel ALL of them. Use the extracted
    // real merchant instead.
    const defaultMatch = extractPaypalMerchant(tx.counterparty, tx.description) ?? tx.counterparty ?? ''
    setMatchStrings(p?.matchStrings ?? [defaultMatch].filter(Boolean))
    setMatchMode(p?.matchMode ?? 'exact')
    setExistingProfileId(p?.id ?? null)
    setEditing(true)
    setUploadError('')
    setCustomInput('')
  }

  function cancelEdit() { setEditing(false) }

  function handleClose() {
    setEditing(false)
    setSplitting(false)
    setSplitPickerFor(null)
    onClose()
  }

  function save() {
    if (!tx) return
    if (matchStrings.length > 0) {
      // Store label + icon + category on the pattern; it drives every matching
      // transaction (existing and future) live via enrichment. Clear any per-tx
      // override on this row so it falls back to the pattern.
      upsertProfile(existingProfileId, matchStrings, matchMode, {
        label: label.trim() || undefined,
        customIcon: icon,
        categoryId: category,
      })
      onUpdate(tx.id, { customLabel: undefined, customIcon: undefined, categoryId: undefined })
    } else {
      // No pattern → a one-off edit stored only on this transaction.
      onUpdate(tx.id, { customLabel: label.trim() || undefined, customIcon: icon, categoryId: category })
    }
    setEditing(false)
  }

  function openSplit() {
    if (!tx) return
    const existing = tx.splits
    if (existing && existing.length === 2) {
      setSplitCatA(existing[0].categoryId)
      setSplitAmtA(String(Math.abs(existing[0].amount)).replace('.', ','))
      setSplitCatB(existing[1].categoryId)
    } else {
      setSplitCatA(tx.categoryId)
      setSplitAmtA('')
      setSplitCatB('other')
    }
    setSplitMatchStrings([])
    setSplitMatchMode('exact')
    setSplitting(true)
  }

  function saveSplit() {
    if (!tx) return
    const total = tx.amount
    const aMag = parseFloat(splitAmtA.replace(',', '.'))
    if (!(aMag > 0 && aMag < Math.abs(total)) || splitCatA === splitCatB) return
    const ratioA = aMag / Math.abs(total)

    const targets = splitMatchStrings.length
      ? transactions.filter(t => {
          const text = `${t.customLabel ?? ''} ${t.counterparty} ${t.description}`.toLowerCase()
          return splitMatchStrings.some(ms => {
            const m = ms.toLowerCase()
            return splitMatchMode === 'exact'
              ? (t.counterparty.toLowerCase() === m || (t.customLabel ?? '').toLowerCase() === m)
              : text.includes(m)
          })
        })
      : [tx]

    for (const t of targets) {
      const sign = t.amount < 0 ? -1 : 1
      const a = +(sign * ratioA * Math.abs(t.amount)).toFixed(2)
      const b = +(t.amount - a).toFixed(2)
      setSplit(t.id, [
        { categoryId: splitCatA, amount: a },
        { categoryId: splitCatB, amount: b },
      ])
    }
    setSplitting(false)
  }

  function removeSplit() {
    if (tx) clearSplit(tx.id)
    setSplitting(false)
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploadError('')
    setUploading(true)
    try {
      // Always upload to R2 → the icon is stored as a small /icon/<id> URL.
      // (Embedding a base64 data URL here would bloat localStorage and matching
      // transactions, which previously blew the storage quota.)
      const blob = await resizeToWebP(file)
      setIcon(await uploadIcon(blob, resolveWorkerUrl()))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
      reportError('Icon-Upload', err)
    } finally {
      setUploading(false)
    }
  }

  const displayIcon  = tx?.customIcon  ?? profile?.customIcon
  const displayLabel = tx?.customLabel ?? profile?.label
  const merchantKey  = tx?.merchantKey ?? (tx ? findMerchant(`${tx.description ?? ''} ${tx.counterparty ?? ''}`)?.merchantKey : undefined)
  const cat = tx ? (allMap[tx.categoryId] ?? CATEGORIES['other']) : null

  return createPortal(
    <AnimatePresence>
      {tx && (
        <>
          <motion.div
            key="tx-backdrop"
            id="modal-tx-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-40 bg-black/60 backdrop-blur-md"
            onClick={handleClose}
          />
          <motion.div
            key="tx-sheet"
            id="modal-tx-sheet"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            onClick={e => e.stopPropagation()}
            className="absolute bottom-0 left-0 right-0 z-50 rounded-t-4xl border-t border-white/10 flex flex-col max-h-[92svh]"
            style={{ background: 'linear-gradient(160deg, rgba(28,24,46,0.2) 0%, rgba(18,15,36,0.6) 100%)', backdropFilter: 'blur(var(--blur-modal))', WebkitBackdropFilter: 'blur(var(--blur-modal))' }}
          >
            <div id="modal-tx-handle" className="w-10 h-1 rounded-full bg-white/15 mx-auto mt-3 mb-0 shrink-0" />

            <div id="modal-tx-scroll" className="overflow-y-auto flex-1 min-h-0 px-5 pt-3 pb-6">
              <div id="modal-tx-header" className="flex items-center justify-between mb-5">
                <span id="modal-tx-date" className="text-xs text-white/30 uppercase tracking-wider">
                  {tx.isPending ? 'Ausstehend' : format(tx.date, 'EEEE, dd. MMMM yyyy', { locale: de })}
                </span>
                <button id="btn-tx-close" onClick={handleClose} className="w-8 h-8 rounded-full bg-white/6 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors">
                  <X size={15} />
                </button>
              </div>

              <div id="modal-tx-hero" className="flex flex-col items-center gap-3 mb-6">
                <MerchantLogo merchantKey={merchantKey} categoryId={tx.categoryId} customIcon={displayIcon} size={64} />
                <AmountDisplay amount={tx.amount} size="lg" />
                <p id="modal-tx-label" className="text-base font-semibold text-white/90 text-center leading-snug">
                  {displayLabel || tx.counterparty || tx.description || '–'}
                </p>
                {displayLabel && tx.counterparty && displayLabel !== tx.counterparty && (
                  <p id="modal-tx-counterparty" className="text-xs text-white/30 text-center">{tx.counterparty}</p>
                )}
              </div>

              <div id="modal-tx-details" className="flex flex-col gap-px rounded-card overflow-hidden mb-5">
                {[
                  tx.splits && tx.splits.length
                    ? {
                        label: 'Aufgeteilt',
                        value: tx.splits
                          .map(s => `${(allMap[s.categoryId] ?? CATEGORIES['other']).label}: ${formatEur(s.amount)}`)
                          .join('  ·  '),
                      }
                    : { label: 'Kategorie', value: cat ? `${cat.icon} ${cat.label}` : '' },
                  tx.description ? { label: 'Buchungstext', value: tx.description } : null,
                  tx.iban ? { label: 'IBAN', value: tx.iban } : null,
                  tx.reference ? { label: 'Verwendungszweck', value: tx.reference } : null,
                  tx.isRecurring ? { label: 'Typ', value: '🔁 Wiederkehrend' } : null,
                  profile ? {
                    label: 'Profil',
                    value: `${profile.matchMode === 'exact' ? '=' : '~'} ${profile.matchStrings.map(s => `„${s}"`).join(', ')}`,
                  } : null,
                ].filter(Boolean).map((row, i) => (
                  <div key={i} className="flex justify-between gap-4 bg-white/4 px-4 py-3">
                    <span className="text-xs text-white/40 shrink-0">{row!.label}</span>
                    <span className="text-xs text-white/80 text-right break-all">{row!.value}</span>
                  </div>
                ))}
              </div>

              {/* Edit button */}
              <AnimatePresence initial={false}>
                {!editing && (
                  <motion.button
                    key="edit-btn"
                    id="btn-tx-edit"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={openEdit}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-card border border-white/10 bg-white/4 text-sm text-white/70 hover:text-white/90 hover:bg-white/[0.07] active:scale-[0.98]"
                  >
                    <Pencil size={14} />
                    Bearbeiten
                  </motion.button>
                )}
              </AnimatePresence>

              {/* ── Split (low-profile chart-only overlay) ── */}
              {!editing && (
                <AnimatePresence initial={false} mode="wait">
                  {!splitting ? (
                    <motion.button
                      key="split-trigger"
                      id="btn-tx-split-trigger"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      onClick={openSplit}
                      className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 text-xs text-white/35 hover:text-white/60 transition-colors"
                    >
                      <SplitSquareHorizontal size={13} />
                      {tx.splits?.length ? 'Aufteilung bearbeiten' : 'Betrag aufteilen'}
                    </motion.button>
                  ) : (
                    <motion.div
                      key="split-editor"
                      id="modal-tx-split-editor"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                      className="overflow-hidden"
                    >
                      {(() => {
                        const total = tx.amount
                        const aMag = parseFloat(splitAmtA.replace(',', '.')) || 0
                        const bMag = Math.max(0, Math.abs(total) - aMag)
                        const sign = total < 0 ? -1 : 1
                        const catA = allMap[splitCatA] ?? CATEGORIES['other']
                        const catB = allMap[splitCatB] ?? CATEGORIES['other']
                        return (
                          <div className="mt-2 flex flex-col gap-2.5 rounded-card border border-white/20 bg-white/[0.07] p-3">
                            <p className="text-[10px] text-white/60 uppercase tracking-wider">
                              Betrag aufteilen ({formatEur(total)})
                            </p>
                            <div id="split-row-a" className="flex items-center gap-2">
                              <button id="btn-split-cat-a" onClick={() => setSplitPickerFor('A')}
                                className="flex-1 min-w-0 flex items-center gap-2 rounded-card_sm bg-white/10 border border-white/20 px-3 py-2 text-left active:scale-[0.98] transition-transform"
                              >
                                <span className="text-base leading-none shrink-0">{catA.icon}</span>
                                <span className="text-sm text-white/80 truncate">{catA.label}</span>
                              </button>
                              <input
                                id="input-split-amt-a"
                                type="text" inputMode="decimal" value={splitAmtA}
                                onChange={e => setSplitAmtA(e.target.value)}
                                placeholder="0,00"
                                className="w-24 shrink-0 rounded-card_sm bg-white/10 border border-white/20 px-3 py-2 text-sm text-white text-right placeholder-white/40 outline-none focus:border-purple-500/50 transition-colors"
                              />
                            </div>
                            <div id="split-row-b" className="flex items-center gap-2">
                              <button id="btn-split-cat-b" onClick={() => setSplitPickerFor('B')}
                                className="flex-1 min-w-0 flex items-center gap-2 rounded-card_sm bg-white/10 border border-white/20 px-3 py-2 text-left active:scale-[0.98] transition-transform"
                              >
                                <span className="text-base leading-none shrink-0">{catB.icon}</span>
                                <span className="text-sm text-white/80 truncate">{catB.label}</span>
                              </button>
                              <span id="split-amt-b-display" className="w-24 shrink-0 text-right text-sm text-white/50 px-3 py-2">
                                {formatEur(sign * bMag)}
                              </span>
                            </div>
                            <div id="split-gilt-fuer" className="border-t border-white/8 pt-2.5">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] text-white/40 uppercase tracking-wider">Gilt für</span>
                                <div className="flex rounded-card_sm overflow-hidden border border-white/20 ml-auto shrink-0">
                                  {(['exact', 'contains'] as const).map(m => (
                                    <button key={m} onClick={() => setSplitMatchMode(m)}
                                      className={`text-[10px] px-2.5 py-1 transition-colors ${splitMatchMode === m ? 'bg-purple-500/30 text-purple-300' : 'text-white/50 hover:text-white/70'}`}
                                    >{m === 'exact' ? 'Exakt' : 'Enthält'}</button>
                                  ))}
                                </div>
                              </div>
                              {splitMatchStrings.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                  {splitMatchStrings.map(s => (
                                    <button key={s} onClick={() => toggleSplitChip(s)}
                                      className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-purple-500/25 border border-purple-500/40 text-purple-300 active:scale-95 transition-all"
                                    >{s}<X size={9} className="opacity-70" /></button>
                                  ))}
                                </div>
                              )}
                              <div className="flex flex-wrap gap-1.5">
                                {chips.filter(c => !splitMatchStrings.includes(c)).map(chip => (
                                  <button key={chip} onClick={() => toggleSplitChip(chip)}
                                    className="text-[11px] px-2 py-0.5 rounded-full border bg-white/8 border-white/20 text-white/70 hover:text-white/90 hover:border-white/35 transition-all active:scale-95"
                                  >{chip}</button>
                                ))}
                              </div>
                              {splitAffectedCount > 0 && (
                                <p className="text-[10px] text-white/30 mt-1.5">
                                  {splitAffectedCount} Buchung{splitAffectedCount !== 1 ? 'en' : ''} betroffen
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      })()}
                    </motion.div>
                  )}
                </AnimatePresence>
              )}

              {/* ── Edit form ── */}
              <AnimatePresence initial={false}>
              {editing && (
                <motion.div
                  key="edit-form"
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: 0 }}
                  transition={{ duration: 0.68, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="overflow-hidden"
                >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.45, delay: 0.15 }}
                >
                <div id="edit-form-body" className="flex flex-col gap-5">
                  <div id="edit-section-label">
                    <label className="text-[10px] text-white/60 uppercase tracking-wider block mb-1.5">Bezeichnung</label>
                    <input
                      id="input-edit-label"
                      type="text"
                      value={label}
                      onChange={e => setLabel(e.target.value)}
                      placeholder={tx.counterparty || 'Name…'}
                      className="w-full rounded-card_sm bg-white/10 border border-white/20 px-3 py-2.5 text-sm text-white placeholder-white/40 outline-none focus:border-purple-500/50 transition-colors"
                    />
                  </div>

                  <div id="edit-section-category">
                    <label className="text-[10px] text-white/60 uppercase tracking-wider block mb-1.5">Kategorie</label>
                    <div id="edit-category-grid" className="grid grid-cols-4 gap-1.5">
                      {allList.map(c => (
                        <button key={c.id} onClick={() => setCategory(c.id)}
                          className="flex flex-col items-center gap-1 p-2 rounded-card_sm border text-center transition-all duration-100 active:scale-95"
                          style={{
                            backgroundColor: c.id === category ? `${c.color}52` : 'rgba(20,20,20,0.12)',
                            borderColor: c.id === category ? `${c.color}95` : 'rgba(255,255,255,0.12)',
                          }}
                        >
                          <span className="text-lg leading-none">{c.icon}</span>
                          <span className="text-[9px] text-white/70 leading-tight">{c.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div id="edit-section-icon">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] text-white/60 uppercase tracking-wider">Icon</label>
                      <div className="flex gap-1">
                        {(['emoji', 'upload'] as const).map(t => (
                          <button key={t} onClick={() => setIconTab(t)}
                            className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${iconTab === t ? 'bg-purple-500/30 text-purple-300' : 'text-white/50 hover:text-white/70'}`}
                          >{t === 'emoji' ? 'Emoji' : 'Foto'}</button>
                        ))}
                        {icon && (
                          <button onClick={() => setIcon(undefined)}
                            className="text-[10px] px-2 py-0.5 rounded-full text-white/50 hover:text-white/70 flex items-center gap-0.5 transition-colors"
                          >
                            <RotateCcw size={9} /> Standard
                          </button>
                        )}
                      </div>
                    </div>

                    {iconTab === 'emoji' && (
                      <>
                        <div className="grid grid-cols-9 gap-1">
                          {EMOJI_PRESETS.map(e => (
                            <button key={e} onClick={() => setIcon(e)}
                              className={`aspect-square flex items-center justify-center text-xl rounded-md transition-all active:scale-90 ${icon === e ? 'bg-purple-500/30 ring-1 ring-purple-500/50' : 'bg-white/8 hover:bg-white/14'}`}
                            >{e}</button>
                          ))}
                          {icon && !EMOJI_PRESETS.includes(icon) && !(icon.startsWith('data:') || icon.startsWith('http')) && (
                            <button className="aspect-square flex items-center justify-center text-xl rounded-md bg-purple-500/30 ring-1 ring-purple-500/50">
                              {icon}
                            </button>
                          )}
                          <button
                            onClick={() => setEmojiInputOpen(true)}
                            className="aspect-square flex items-center justify-center rounded-md bg-white/8 hover:bg-white/14 text-white/50 hover:text-white/80 transition-all active:scale-90"
                          ><Plus size={16} /></button>
                        </div>
                        {emojiInputOpen && (
                          <input
                            type="text"
                            autoFocus
                            onChange={handleEmojiInput}
                            onBlur={() => setEmojiInputOpen(false)}
                            className="mt-1 w-full rounded-card_sm bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-purple-500/50"
                            placeholder="Emoji eingeben…"
                            autoComplete="off"
                            autoCorrect="off"
                          />
                        )}
                      </>
                    )}

                    {iconTab === 'upload' && (
                      <div className="flex flex-col items-center gap-3">
                        {uploading ? (
                          <div className="flex flex-col items-center gap-2 p-6 text-white/40">
                            <Loader size={20} className="animate-spin" />
                            <span className="text-xs">Wird hochgeladen…</span>
                          </div>
                        ) : (icon?.startsWith('data:') || icon?.startsWith('http')) ? (
                          <div className="relative">
                            <img src={icon} alt="" className="w-20 h-20 rounded-card object-cover" />
                            <button onClick={() => setIcon(undefined)}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/80 border border-white/20 flex items-center justify-center text-white/70"
                            ><X size={10} /></button>
                          </div>
                        ) : (
                          <button onClick={() => fileRef.current?.click()}
                            className="flex flex-col items-center gap-2 p-6 rounded-card border-2 border-dashed border-white/25 text-white/60 hover:text-white/80 hover:border-white/40 transition-colors w-full"
                          >
                            <Upload size={20} />
                            <span className="text-xs">Bild auswählen</span>
                          </button>
                        )}
                        {uploadError && <p className="text-xs text-red-400/80 text-center">{uploadError}</p>}
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                      </div>
                    )}
                  </div>

                  <div id="edit-section-giltfuer">
                    <div className="flex items-center gap-2 mb-2">
                      <label className="text-[10px] text-white/60 uppercase tracking-wider">Gilt für</label>
                      {/* Mode toggle */}
                      <div className="flex rounded-card_sm overflow-hidden border border-white/20 ml-auto shrink-0">
                        {(['exact', 'contains'] as const).map(m => (
                          <button key={m} onClick={() => setMatchMode(m)}
                            className={`text-[10px] px-2.5 py-1 transition-colors ${matchMode === m ? 'bg-purple-500/30 text-purple-300' : 'text-white/50 hover:text-white/70'}`}
                          >{m === 'exact' ? 'Exakt' : 'Enthält'}</button>
                        ))}
                      </div>
                    </div>

                    {/* Selected strings */}
                    {matchStrings.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2.5">
                        {matchStrings.map(s => (
                          <button
                            key={s}
                            onClick={() => toggleChip(s)}
                            className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-purple-500/25 border border-purple-500/40 text-purple-300 transition-all active:scale-95"
                          >
                            {s}
                            <X size={9} className="opacity-70" />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Word chips from transaction text */}
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                      {chips.filter(c => !matchStrings.includes(c)).map(chip => (
                        <button key={chip} onClick={() => toggleChip(chip)}
                          className="text-[11px] px-2 py-0.5 rounded-full border bg-white/8 border-white/20 text-white/70 hover:text-white/90 hover:border-white/35 transition-all active:scale-95"
                        >{chip}</button>
                      ))}
                    </div>

                    <div id="edit-custom-input-row" className="flex gap-2">
                      <input
                        id="input-edit-custom-match"
                        type="text"
                        value={customInput}
                        onChange={e => setCustomInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addCustom()}
                        placeholder="Eigener Begriff…"
                        className="flex-1 min-w-0 rounded-card_sm bg-white/10 border border-white/20 px-3 py-1.5 text-sm text-white placeholder-white/40 outline-none focus:border-purple-500/50 transition-colors"
                      />
                      <button
                        onClick={addCustom}
                        disabled={!customInput.trim()}
                        className="w-8 h-8 shrink-0 rounded-card_sm bg-white/10 border border-white/20 flex items-center justify-center text-white/60 hover:text-white/90 disabled:opacity-30 transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    {affectedCount > 0 && (
                      <p className="text-[10px] text-white/30 mt-2">
                        {affectedCount} Buchung{affectedCount !== 1 ? 'en' : ''} betroffen
                      </p>
                    )}
                  </div>

                </div>
                </motion.div>
                </motion.div>
              )}
              </AnimatePresence>
            </div>

            {/* ── Sticky action footer — Speichern/Abbrechen (and Entfernen for
                a split) always stay reachable instead of requiring a scroll
                through the category grid / icon picker / chip list above. ── */}
            <AnimatePresence initial={false}>
              {(editing || splitting) && (
                <motion.div
                  key="tx-actions-footer"
                  id="modal-tx-actions-footer"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                  className="overflow-hidden shrink-0 border-t border-white/8"
                  style={{ background: 'rgba(18,15,36,0.05)', backdropFilter: 'blur(var(--blur-modal))', WebkitBackdropFilter: 'blur(var(--blur-modal))' }}
                >
                  {editing && (
                    <div id="edit-actions" className="flex gap-2 px-5 py-3">
                      <button id="btn-edit-cancel" onClick={cancelEdit}
                        className="flex-1 py-2.5 rounded-card border border-white/20 text-sm text-white/70 hover:text-white/90 transition-colors"
                      >Abbrechen</button>
                      <button id="btn-edit-save" onClick={save}
                        className="flex-1 py-2.5 rounded-card bg-purple-600/80 hover:bg-purple-600 text-sm text-white font-medium flex items-center justify-center gap-1.5 transition-colors"
                      ><Check size={14} />Speichern</button>
                    </div>
                  )}
                  {splitting && (() => {
                    const aMag = parseFloat(splitAmtA.replace(',', '.')) || 0
                    const valid = aMag > 0 && aMag < Math.abs(tx.amount) && splitCatA !== splitCatB
                    return (
                      <div id="split-actions" className="flex gap-2 px-5 py-3">
                        <button id="btn-split-cancel" onClick={() => setSplitting(false)}
                          className="flex-1 py-2.5 rounded-card border border-white/20 text-sm text-white/70 hover:text-white/90 transition-colors"
                        >Abbrechen</button>
                        {tx.splits?.length ? (
                          <button id="btn-split-remove" onClick={removeSplit}
                            className="flex-1 py-2.5 rounded-card border border-white/20 text-sm text-red-400/80 hover:text-red-400 transition-colors"
                          >Entfernen</button>
                        ) : null}
                        <button id="btn-split-save" onClick={saveSplit} disabled={!valid}
                          className="flex-1 py-2.5 rounded-card bg-purple-600/80 hover:bg-purple-600 disabled:opacity-30 disabled:hover:bg-purple-600/80 text-sm text-white font-medium transition-colors"
                        >Speichern</button>
                      </div>
                    )
                  })()}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <CategoryPicker
            open={splitPickerFor !== null}
            current={splitPickerFor === 'A' ? splitCatA : splitCatB}
            onSelect={id => (splitPickerFor === 'A' ? setSplitCatA(id) : setSplitCatB(id))}
            onClose={() => setSplitPickerFor(null)}
          />
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
