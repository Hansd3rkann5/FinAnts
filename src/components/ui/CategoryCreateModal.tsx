import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useModalRegistration } from '@/hooks/useModalRegistration'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, RotateCcw, Upload, Loader, Pipette } from 'lucide-react'
import type { Category } from '@/types'

const COLOR_PRESETS = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#34d399', '#22d3ee', '#60a5fa', '#a78bfa',
  '#f472b6', '#94a3b8', '#e879f9', '#2dd4bf', '#818cf8', '#fcd34d', '#f43f5e',
]

const EMOJI_PRESETS = [
  '🏷️','⭐','🔖','🎯','💎','🌟','🔥','💡','🎁','🌈',
  '🛒','🍕','🍔','🍣','🥐','☕','🍷','🍜',
  '👕','💻','📱','🎮','👟','🎧',
  '🚗','✈️','⛽','🚌',
  '💊','🏥','🏋️','💆',
  '🏠','💡','🔧','🛋️',
  '💳','💵','🏦','💰','📈',
  '🎬','🎵','⚽','🎾','📚','✏️',
  '🚴','🏃','🧗','🌲','🌳','🏕️','🌊',
]

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

interface Props {
  open: boolean
  onClose: () => void
  onSave: (cat: Omit<Category, 'id'>) => void
  editItem?: Category
  onUpdate?: (id: string, patch: Omit<Category, 'id'>) => void
}

export function CategoryCreateModal({ open, onClose, onSave, editItem, onUpdate }: Props) {
  useModalRegistration(open)
  const [label, setLabel] = useState('')
  const [color, setColor] = useState(COLOR_PRESETS[6])
  const [icon, setIcon] = useState<string>('🏷️')
  const [iconTab, setIconTab] = useState<'emoji' | 'upload'>('emoji')

  useEffect(() => {
    if (open && editItem) {
      setLabel(editItem.label)
      setColor(editItem.color)
      setIcon(editItem.icon)
      setIconTab(editItem.icon.startsWith('data:') || editItem.icon.startsWith('http') ? 'upload' : 'emoji')
      setUploadError('')
    }
  }, [open, editItem])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const isCustomColor = !COLOR_PRESETS.includes(color)

  function reset() {
    setLabel('')
    setColor(COLOR_PRESETS[6])
    setIcon('🏷️')
    setIconTab('emoji')
    setUploadError('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleSave() {
    const name = label.trim()
    if (!name) return
    if (editItem && onUpdate) {
      onUpdate(editItem.id, { label: name, icon, color })
    } else {
      onSave({ label: name, icon, color })
    }
    reset()
    onClose()
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploadError('')
    setUploading(true)
    try {
      const blob = await resizeToWebP(file)
      const reader = new FileReader()
      reader.onload = ev => setIcon(ev.target?.result as string)
      reader.readAsDataURL(blob)
    } catch {
      setUploadError('Bild konnte nicht geladen werden')
    } finally {
      setUploading(false)
    }
  }

  const isPhoto = icon.startsWith('data:') || icon.startsWith('http')

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="cat-backdrop"
            id="modal-cat-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md"
            onClick={handleClose}
          />
          <motion.div
            key="cat-sheet"
            id="modal-cat-sheet"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            onClick={e => e.stopPropagation()}
            className="absolute bottom-0 left-0 right-0 z-51 rounded-t-4xl border-t border-white/10 pb-safe flex flex-col max-h-[88svh]"
            style={{ background: 'linear-gradient(160deg, rgba(28,24,46,0.99) 0%, rgba(18,15,36,0.99) 100%)' }}
          >
            <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mt-3 mb-1 shrink-0" />

            <div className="overflow-y-auto flex-1 min-h-0 px-5 pt-3 pb-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-semibold text-white/80">{editItem ? 'Kategorie bearbeiten' : 'Neue Kategorie'}</h3>
                <button onClick={handleClose} className="w-8 h-8 rounded-full bg-white/6 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors">
                  <X size={15} />
                </button>
              </div>

              {/* Preview */}
              <div className="flex flex-col items-center gap-2 mb-6">
                <div
                  className="w-16 h-16 rounded-card flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${color}22`, border: `1.5px solid ${color}50`, fontSize: isPhoto ? undefined : 30 }}
                >
                  {isPhoto
                    ? <img src={icon} alt="" className="w-full h-full object-cover rounded-card" />
                    : icon}
                </div>
                <p className="text-sm font-medium text-white/80">{label || 'Neue Kategorie'}</p>
              </div>

              <div className="flex flex-col gap-5">
                {/* Name */}
                <div>
                  <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1.5">Name</label>
                  <input
                    type="text"
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    placeholder="z.B. Haustier, Hobbys…"
                    autoFocus
                    className="w-full rounded-card_sm bg-white/6 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-purple-500/50 transition-colors"
                  />
                </div>

                {/* Color */}
                <div>
                  <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-2">Farbe</label>
                  <div className="grid grid-cols-8 gap-2">
                    {COLOR_PRESETS.map(c => (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        className="w-8 h-8 rounded-full transition-all active:scale-90"
                        style={{
                          backgroundColor: c,
                          boxShadow: color === c ? `0 0 0 2px rgba(0,0,0,0.4), 0 0 0 4px ${c}` : undefined,
                          transform: color === c ? 'scale(1.15)' : undefined,
                        }}
                      />
                    ))}
                    <div className="relative">
                      <button
                        className="w-8 h-8 rounded-full transition-all active:scale-90 flex items-center justify-center overflow-hidden"
                        style={{
                          background: isCustomColor
                            ? color
                            : 'conic-gradient(from 0deg, #f87171, #fbbf24, #a3e635, #34d399, #60a5fa, #a78bfa, #f472b6, #f87171)',
                          boxShadow: isCustomColor ? `0 0 0 2px rgba(0,0,0,0.4), 0 0 0 4px ${color}` : undefined,
                          transform: isCustomColor ? 'scale(1.15)' : undefined,
                        }}
                      >
                        {!isCustomColor && (
                          <Pipette size={13} className="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]" />
                        )}
                      </button>
                      <input
                        type="color"
                        value={color}
                        onChange={e => setColor(e.target.value)}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* Icon */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] text-white/40 uppercase tracking-wider">Icon</label>
                    <div className="flex gap-1">
                      {(['emoji', 'upload'] as const).map(t => (
                        <button key={t} onClick={() => setIconTab(t)}
                          className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${iconTab === t ? 'bg-purple-500/30 text-purple-300' : 'text-white/30 hover:text-white/60'}`}
                        >{t === 'emoji' ? 'Emoji' : 'Foto'}</button>
                      ))}
                      {isPhoto && (
                        <button onClick={() => setIcon('🏷️')}
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
                        <button key={e} onClick={() => setIcon(e)}
                          className={`aspect-square flex items-center justify-center text-xl rounded-md transition-all active:scale-90 ${icon === e ? 'bg-purple-500/30 ring-1 ring-purple-500/50' : 'bg-white/4 hover:bg-white/8'}`}
                        >{e}</button>
                      ))}
                    </div>
                  )}

                  {iconTab === 'upload' && (
                    <div className="flex flex-col items-center gap-3">
                      {uploading ? (
                        <div className="flex flex-col items-center gap-2 p-6 text-white/40">
                          <Loader size={20} className="animate-spin" />
                          <span className="text-xs">Wird geladen…</span>
                        </div>
                      ) : isPhoto ? (
                        <div className="relative">
                          <img src={icon} alt="" className="w-20 h-20 rounded-card object-cover" />
                          <button onClick={() => setIcon('🏷️')}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/80 border border-white/20 flex items-center justify-center text-white/70"
                          ><X size={10} /></button>
                        </div>
                      ) : (
                        <button onClick={() => fileRef.current?.click()}
                          className="flex flex-col items-center gap-2 p-6 rounded-card border-2 border-dashed border-white/15 text-white/40 hover:text-white/60 hover:border-white/25 transition-colors w-full"
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

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button onClick={handleClose}
                    className="flex-1 py-2.5 rounded-card border border-white/10 text-sm text-white/50 hover:text-white/70 transition-colors"
                  >Abbrechen</button>
                  <button
                    onClick={handleSave}
                    disabled={!label.trim()}
                    className="flex-1 py-2.5 rounded-card bg-purple-600/80 hover:bg-purple-600 disabled:opacity-40 disabled:pointer-events-none text-sm text-white font-medium flex items-center justify-center gap-1.5 transition-colors"
                  ><Check size={14} />{editItem ? 'Speichern' : 'Erstellen'}</button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
