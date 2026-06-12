import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { X, Pencil, Check, RotateCcw, Upload, Loader } from 'lucide-react'
import type { Transaction, CategoryId } from '@/types'
import { CATEGORIES, CATEGORY_LIST } from '@/data/categories'
import { MerchantLogo } from './MerchantLogo'
import { AmountDisplay } from '@/components/ui/AmountDisplay'
import { loadWorkerConfig } from '@/hooks/useWorkerSync'

async function resizeToWebP(file: File, maxPx = 192): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objUrl = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(maxPx / img.width, maxPx / img.height, 1)
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(objUrl)
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/webp', 0.88)
    }
    img.onerror = reject
    img.src = objUrl
  })
}

async function uploadIcon(blob: Blob, workerUrl: string, apiKey: string): Promise<string> {
  const res = await fetch(`${workerUrl.replace(/\/$/, '')}/upload-icon`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type, 'X-Api-Key': apiKey },
    body: blob,
  })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  const data = await res.json() as { url: string }
  return data.url
}

const EMOJI_PRESETS = [
  '🛒','🍕','🍔','🍣','🍜','🥐','☕','🍷','🥤',
  '👕','👗','💻','📱','🎮','📺','🎧','👟',
  '🚗','✈️','🚂','🛵','⛽','🚌',
  '💊','🏥','🏋️','💆','🦷',
  '🏠','💡','🔧','🧹','🛋️',
  '💳','💵','🏦','💰','📈',
  '🎬','🎵','🎭','⚽','🎾',
  '📚','🎓','✏️','🖥️',
  '⭐','❤️','🌟','🎁','🌿',
]

interface Props {
  transaction: Transaction | null
  onClose: () => void
  onUpdate: (id: string, patch: Partial<Pick<Transaction, 'categoryId' | 'customLabel' | 'customIcon'>>) => void
}

export function TransactionDetailModal({ transaction: tx, onClose, onUpdate }: Props) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState('')
  const [category, setCategory] = useState<CategoryId>('other')
  const [icon, setIcon] = useState<string | undefined>(undefined)
  const [iconTab, setIconTab] = useState<'emoji' | 'upload'>('emoji')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function openEdit() {
    if (!tx) return
    setLabel(tx.customLabel ?? tx.counterparty ?? '')
    setCategory(tx.categoryId)
    setIcon(tx.customIcon)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
  }

  function save() {
    if (!tx) return
    onUpdate(tx.id, {
      customLabel: label.trim() || undefined,
      categoryId: category,
      customIcon: icon,
    })
    setEditing(false)
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploadError('')
    setUploading(true)
    try {
      const blob = await resizeToWebP(file)
      const cfg = loadWorkerConfig()
      if (cfg?.workerUrl && cfg?.apiKey) {
        const url = await uploadIcon(blob, cfg.workerUrl, cfg.apiKey)
        setIcon(url)
      } else {
        // No worker configured — fall back to base64 in localStorage
        const reader = new FileReader()
        reader.onload = ev => setIcon(ev.target?.result as string)
        reader.readAsDataURL(blob)
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }

  const cat = tx ? CATEGORIES[tx.categoryId] : null

  return (
    <AnimatePresence>
      {tx && (
        <>
          {/* Backdrop */}
          <motion.div
            key="tx-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            key="tx-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            onClick={e => e.stopPropagation()}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-4xl border-t border-white/10 pb-safe flex flex-col max-h-[92dvh]"
            style={{ background: 'linear-gradient(160deg, rgba(28,24,46,0.99) 0%, rgba(18,15,36,0.99) 100%)' }}
          >
            {/* Handle */}
            <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mt-3 mb-1 shrink-0" />

            <div className="overflow-y-auto flex-1 px-5 pt-3 pb-6">
              {/* Header row */}
              <div className="flex items-center justify-between mb-5">
                <span className="text-xs text-white/30 uppercase tracking-wider">
                  {tx.isPending ? 'Ausstehend' : format(tx.date, 'EEEE, dd. MMMM yyyy', { locale: de })}
                </span>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-white/6 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Icon + amount */}
              <div className="flex flex-col items-center gap-3 mb-6">
                <MerchantLogo
                  merchantKey={tx.merchantKey}
                  categoryId={tx.categoryId}
                  customIcon={tx.customIcon}
                  size={64}
                />
                <AmountDisplay amount={tx.amount} size="lg" />
                <p className="text-base font-semibold text-white/90 text-center leading-snug">
                  {tx.customLabel || tx.counterparty || tx.description || '–'}
                </p>
                {tx.customLabel && tx.counterparty && tx.customLabel !== tx.counterparty && (
                  <p className="text-xs text-white/30 text-center">{tx.counterparty}</p>
                )}
              </div>

              {/* Detail rows */}
              <div className="flex flex-col gap-px rounded-card overflow-hidden mb-5">
                {[
                  { label: 'Kategorie', value: cat ? `${cat.icon} ${cat.label}` : '' },
                  tx.description ? { label: 'Buchungstext', value: tx.description } : null,
                  tx.iban ? { label: 'IBAN', value: tx.iban } : null,
                  tx.reference ? { label: 'Verwendungszweck', value: tx.reference } : null,
                  tx.isRecurring ? { label: 'Typ', value: '🔁 Wiederkehrend' } : null,
                ].filter(Boolean).map((row, i) => (
                  <div key={i} className="flex justify-between gap-4 bg-white/4 px-4 py-3">
                    <span className="text-xs text-white/40 shrink-0">{row!.label}</span>
                    <span className="text-xs text-white/80 text-right break-all">{row!.value}</span>
                  </div>
                ))}
              </div>

              {/* Edit button (view mode) */}
              {!editing && (
                <button
                  onClick={openEdit}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-card border border-white/10 bg-white/4 text-sm text-white/70 hover:text-white/90 hover:bg-white/[0.07] transition-colors active:scale-[0.98]"
                >
                  <Pencil size={14} />
                  Bearbeiten
                </button>
              )}

              {/* ── Edit form ── */}
              {editing && (
                <div className="flex flex-col gap-5">
                  {/* Label */}
                  <div>
                    <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1.5">
                      Bezeichnung
                    </label>
                    <input
                      type="text"
                      value={label}
                      onChange={e => setLabel(e.target.value)}
                      placeholder={tx.counterparty || 'Name…'}
                      className="w-full rounded-card_sm bg-white/6 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-purple-500/50 transition-colors"
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1.5">
                      Kategorie
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {CATEGORY_LIST.map(c => (
                        <button
                          key={c.id}
                          onClick={() => setCategory(c.id)}
                          className="flex flex-col items-center gap-1 p-2 rounded-card_sm border text-center transition-all duration-100 active:scale-95"
                          style={{
                            backgroundColor: c.id === category ? `${c.color}22` : 'rgba(255,255,255,0.03)',
                            borderColor: c.id === category ? `${c.color}55` : 'rgba(255,255,255,0.07)',
                          }}
                        >
                          <span className="text-lg leading-none">{c.icon}</span>
                          <span className="text-[9px] text-white/60 leading-tight">{c.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Icon */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] text-white/40 uppercase tracking-wider">Icon</label>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setIconTab('emoji')}
                          className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${iconTab === 'emoji' ? 'bg-purple-500/30 text-purple-300' : 'text-white/30 hover:text-white/60'}`}
                        >Emoji</button>
                        <button
                          onClick={() => setIconTab('upload')}
                          className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${iconTab === 'upload' ? 'bg-purple-500/30 text-purple-300' : 'text-white/30 hover:text-white/60'}`}
                        >Foto</button>
                        {icon && (
                          <button
                            onClick={() => setIcon(undefined)}
                            className="text-[10px] px-2 py-0.5 rounded-full text-white/30 hover:text-white/60 flex items-center gap-0.5 transition-colors"
                          >
                            <RotateCcw size={9} /> Standard
                          </button>
                        )}
                      </div>
                    </div>

                    {iconTab === 'emoji' && (
                      <div className="grid grid-cols-9 gap-1">
                        {EMOJI_PRESETS.map(e => (
                          <button
                            key={e}
                            onClick={() => setIcon(e)}
                            className={`aspect-square flex items-center justify-center text-xl rounded-md transition-all active:scale-90 ${icon === e ? 'bg-purple-500/30 ring-1 ring-purple-500/50' : 'bg-white/4 hover:bg-white/8'}`}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
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
                            <button
                              onClick={() => setIcon(undefined)}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/80 border border-white/20 flex items-center justify-center text-white/70"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => fileRef.current?.click()}
                            className="flex flex-col items-center gap-2 p-6 rounded-card border-2 border-dashed border-white/15 text-white/40 hover:text-white/60 hover:border-white/25 transition-colors w-full"
                          >
                            <Upload size={20} />
                            <span className="text-xs">Bild auswählen</span>
                          </button>
                        )}
                        {uploadError && (
                          <p className="text-xs text-red-400/80 text-center">{uploadError}</p>
                        )}
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={cancelEdit}
                      className="flex-1 py-2.5 rounded-card border border-white/10 text-sm text-white/50 hover:text-white/70 transition-colors"
                    >
                      Abbrechen
                    </button>
                    <button
                      onClick={save}
                      className="flex-1 py-2.5 rounded-card bg-purple-600/80 hover:bg-purple-600 text-sm text-white font-medium flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Check size={14} />
                      Speichern
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
