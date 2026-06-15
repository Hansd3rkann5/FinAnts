// Lightweight notification + error-logging core (no React imports beyond the
// hooks at the bottom). Failures across the app route through `reportError`,
// which (1) shows a top toast with a short hint and (2) appends to a capped,
// persisted error log in localStorage so issues can be reviewed later.
import { useSyncExternalStore } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ToastKind = 'error' | 'info'
export interface Toast { id: string; kind: ToastKind; title: string; detail?: string }
export interface LoggedError { id: string; time: string; context: string; message: string; stack?: string }

// ─── Toast bus ─────────────────────────────────────────────────────────────

const LOG_KEY = 'finants_error_log'
const LOG_CAP = 100
const STACK_CAP = 1500
const TOAST_TTL = { error: 10_000, info: 6_000 }
const THROTTLE_MS = 8_000

let toasts: Toast[] = []
const toastListeners = new Set<() => void>()
const lastEmit = new Map<string, number>()   // throttle key → timestamp

// True if this key fired within the throttle window (and records the time).
function throttled(key: string): boolean {
  const now = Date.now()
  if (now - (lastEmit.get(key) ?? 0) < THROTTLE_MS) return true
  lastEmit.set(key, now)
  return false
}

function pushToast(kind: ToastKind, title: string, detail?: string) {
  const id = crypto.randomUUID()
  toasts = [...toasts, { id, kind, title, detail }]
  toastListeners.forEach(l => l())
  setTimeout(() => dismissToast(id), TOAST_TTL[kind])
}

export function dismissToast(id: string) {
  const next = toasts.filter(t => t.id !== id)
  if (next.length === toasts.length) return
  toasts = next
  toastListeners.forEach(l => l())
}

// ─── Error log (localStorage, capped, never throws) ──────────────────────────

let logCache: LoggedError[] | null = null
const logListeners = new Set<() => void>()

function readLog(): LoggedError[] {
  if (logCache) return logCache
  try {
    const raw = localStorage.getItem(LOG_KEY)
    logCache = raw ? (JSON.parse(raw) as LoggedError[]) : []
  } catch { logCache = [] }
  return logCache
}

function writeLog(entries: LoggedError[]) {
  logCache = entries
  // Trim to cap; on quota, keep halving until it fits (or give up silently).
  let slice = entries.slice(-LOG_CAP)
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(slice))
      break
    } catch {
      slice = slice.slice(Math.ceil(slice.length / 2))
      if (slice.length === 0) { try { localStorage.removeItem(LOG_KEY) } catch { /* ignore */ } break }
    }
  }
  logListeners.forEach(l => l())
}

function appendLog(entry: LoggedError) {
  writeLog([...readLog(), entry])
}

export function getErrorLog(): LoggedError[] {
  return readLog()
}

export function clearErrorLog() {
  writeLog([])
}

// ─── Public API ──────────────────────────────────────────────────────────────

function toMessage(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message || error.name, stack: error.stack?.slice(0, STACK_CAP) }
  if (typeof error === 'string') return { message: error }
  try { return { message: JSON.stringify(error) } } catch { return { message: String(error) } }
}

// Log a non-fatal failure: console + persisted log + top toast. The same
// error firing repeatedly within the throttle window is recorded once.
export function reportError(context: string, error: unknown) {
  const { message, stack } = toMessage(error)
  console.error(`[${context}]`, error)
  if (throttled(`err:${context}|${message}`)) return
  appendLog({ id: crypto.randomUUID(), time: new Date().toISOString(), context, message, stack })
  pushToast('error', context, message)
}

// Informational toast (no error log entry).
export function notify(title: string, detail?: string) {
  if (throttled(`info:${title}`)) return
  pushToast('info', title, detail)
}

// ─── React hooks ─────────────────────────────────────────────────────────────

export function useToasts() {
  const subscribe = (cb: () => void) => { toastListeners.add(cb); return () => { toastListeners.delete(cb) } }
  const list = useSyncExternalStore(subscribe, () => toasts, () => toasts)
  return { toasts: list, dismiss: dismissToast }
}

export function useErrorLog() {
  const subscribe = (cb: () => void) => { logListeners.add(cb); return () => { logListeners.delete(cb) } }
  const entries = useSyncExternalStore(subscribe, readLog, readLog)
  return { entries, clear: clearErrorLog }
}
