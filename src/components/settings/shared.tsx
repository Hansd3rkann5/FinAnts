import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, AlertCircle, CheckCircle, ChevronDown } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import type { CloudSyncStatus } from '@/hooks/useCloudState'

export const WORKER_URL = (import.meta.env.VITE_WORKER_URL ?? 'https://finants-proxy.simon-bader.workers.dev').replace(/\/$/, '')
export const workerCfg = { workerUrl: WORKER_URL }

export type ImportStatus = 'idle' | 'parsing' | 'success' | 'error'

// Sections report a busy message upward so the page-level ChartLoader can
// show it (null = section is idle again).
export type OnLoader = (message: string | null) => void

export function StatusBanner({ status, message }: { status: ImportStatus | CloudSyncStatus; message: string }) {
  if (status === 'idle') return null
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex items-start gap-2 p-3 rounded-card_sm text-xs border ${
        status === 'success'
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          : status === 'error'
          ? 'bg-red-500/10 border-red-500/20 text-red-400'
          : 'bg-white/5 border-white/10 text-white/50'
      }`}
    >
      {status === 'success' && <CheckCircle size={14} className="shrink-0 mt-0.5" />}
      {status === 'error'   && <AlertCircle size={14} className="shrink-0 mt-0.5" />}
      {status === 'parsing' && (
        <FileText size={14} className="shrink-0 mt-0.5 animate-pulse" />
      )}
      <span>
        {status === 'parsing' ? 'Datei wird verarbeitet…' : message}
      </span>
    </motion.div>
  )
}

export function CollapsibleCard({
  icon, title, badge, statusText, defaultOpen = false, glow, children,
}: {
  icon: React.ReactNode
  title: string
  badge?: React.ReactNode
  statusText?: string
  defaultOpen?: boolean
  glow?: 'purple' | 'blue'
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <GlassCard glow={glow}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-2 text-left">
        {icon}
        <span className="text-sm font-semibold text-white/90 flex-1">{title}</span>
        {badge}
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-white/30 shrink-0"
        >
          <ChevronDown size={14} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {!open && statusText && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="text-[10px] text-white/30 ml-5.5 overflow-hidden"
          >
            <span className="block mt-1.5">{statusText}</span>
          </motion.p>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  )
}

// A top-level group of related CollapsibleCards (e.g. every way to import
// data). The subtitle is a sibling *below* the icon/title row, never nested
// inside it — nesting it there (alongside the title, both centered via
// items-center) made the icon/chevron visibly jump on toggle, since that
// column's height — and therefore the whole row's centered height — changed
// the instant the subtitle was removed. Animating height/opacity here instead
// of an abrupt conditional render smooths out the remaining size change.
export function SettingsGroup({
  icon, title, subtitle, defaultOpen = false, children,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <GlassCard padding="sm">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-2.5 text-left">
        <div className="w-8 h-8 rounded-card_sm bg-white/5 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <span className="text-sm font-semibold text-white/80 flex-1">{title}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-white/30 shrink-0"
        >
          <ChevronDown size={14} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {!open && subtitle && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="text-[10px] text-white/30 ml-[42px] overflow-hidden"
          >
            <span className="block mt-0.5">{subtitle}</span>
          </motion.p>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 pt-4 pl-3.5 ml-4 border-l border-white/8">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  )
}
