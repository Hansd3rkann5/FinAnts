import { useState, useRef, useCallback } from 'react'
import type { WorkerConfig } from '@/utils/workerConfig'
import { cfHeaders } from '@/utils/cfAuth'
import type { StoredTx } from '@/utils/transactionsApi'

export interface TrLoginSession {
  deviceId: string
  wafToken: string
  cookies: string[]
  processId: string
}

export type TrStatus = 'idle' | 'starting' | 'awaiting_approval' | 'syncing' | 'success' | 'error'

const POLL_INTERVAL_MS = 2500
const POLL_TIMEOUT_MS = 180_000

export function useTradeRepublic(
  onImport: (rows: StoredTx[]) => void,
  onPortfolioValue: (value: number) => void,
) {
  const [status, setStatus] = useState<TrStatus>('idle')
  const [message, setMessage] = useState('')
  const sessionRef = useRef<TrLoginSession | null>(null)
  const pollTimer = useRef<number | null>(null)

  const clearPoll = useCallback(() => {
    if (pollTimer.current !== null) { clearTimeout(pollTimer.current); pollTimer.current = null }
  }, [])

  const runSync = useCallback(async (cfg: WorkerConfig, session: TrLoginSession) => {
    setStatus('syncing')
    setMessage('Depot-Verlauf wird abgerufen…')
    try {
      const res = await fetch(`${cfg.workerUrl.replace(/\/$/, '')}/tr/sync`, {
        method: 'POST',
        credentials: 'include',
        headers: cfHeaders(),
        body: JSON.stringify({ session }),
      })
      const data = await res.json() as {
        transactions?: StoredTx[]; meta?: { added: number; total: number }
        portfolioValue?: number | null; error?: string
      }
      if (!res.ok || data.error || !data.transactions) throw new Error(data.error ?? `HTTP ${res.status}`)
      onImport(data.transactions)
      if (data.portfolioValue !== null && data.portfolioValue !== undefined) onPortfolioValue(data.portfolioValue)
      setStatus('success')
      setMessage(`${data.meta?.added ?? 0} neu · ${data.meta?.total ?? 0} gesamt`)
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Verbindungsfehler')
    }
  }, [onImport, onPortfolioValue])

  // phoneNo/pin are optional — when TR_PHONE_NO/TR_PIN are set as wrangler
  // secrets, the worker uses those instead and the body is just `{}`.
  // Resolves once the push notification is approved, then syncs immediately.
  const start = useCallback(async (cfg: WorkerConfig, phoneNo?: string, pin?: string) => {
    clearPoll()
    setStatus('starting')
    setMessage('')
    try {
      const res = await fetch(`${cfg.workerUrl.replace(/\/$/, '')}/tr/login/start`, {
        method: 'POST',
        credentials: 'include',
        headers: cfHeaders(),
        body: JSON.stringify({ phoneNo, pin }),
      })
      const data = await res.json() as { session?: TrLoginSession; error?: string }
      if (!res.ok || data.error || !data.session) throw new Error(data.error ?? `HTTP ${res.status}`)
      sessionRef.current = data.session

      setStatus('awaiting_approval')
      setMessage('Bitte Anmeldung in der Trade-Republic-App bestätigen…')

      const deadline = Date.now() + POLL_TIMEOUT_MS
      const poll = async () => {
        if (Date.now() > deadline) { setStatus('error'); setMessage('Zeitüberschreitung — Push nicht bestätigt.'); return }
        try {
          const pollRes = await fetch(`${cfg.workerUrl.replace(/\/$/, '')}/tr/login/poll`, {
            method: 'POST',
            credentials: 'include',
            headers: cfHeaders(),
            body: JSON.stringify({ session: sessionRef.current }),
          })
          const pollData = await pollRes.json() as { status: string; cookies?: string[]; reason?: string }
          if (pollData.status === 'approved') {
            const cookies = pollData.cookies ?? sessionRef.current?.cookies ?? []
            if (sessionRef.current) sessionRef.current.cookies = cookies
            if (sessionRef.current) await runSync(cfg, sessionRef.current)
            return
          }
          if (pollData.status === 'rejected') {
            setStatus('error')
            setMessage(`Anmeldung abgelehnt (${pollData.reason ?? 'unbekannt'}).`)
            return
          }
          pollTimer.current = window.setTimeout(poll, POLL_INTERVAL_MS)
        } catch (e) {
          setStatus('error')
          setMessage(e instanceof Error ? e.message : 'Verbindungsfehler')
        }
      }
      pollTimer.current = window.setTimeout(poll, POLL_INTERVAL_MS)
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Verbindungsfehler')
    }
  }, [clearPoll, runSync])

  return { start, status, message, session: sessionRef }
}
