import { useState, useEffect, useCallback } from 'react'
import type { Account } from '@/types'
import type { StoredTx } from '@/utils/transactionsApi'
import type { WorkerConfig } from '@/utils/workerConfig'
import { cfHeaders } from '@/utils/cfAuth'
import { reportError } from '@/utils/notify'

const EB_PENDING_KEY  = 'finants_eb_pending'
const EB_LAST_SYNC_KEY = 'finants_eb_last_sync'

interface PendingSession {
  workerUrl: string
  days: number
}

interface EbWorkerAccount {
  iban: string; blz: string; accountNumber: string; owner: string
  description: string; type: string; currency: string; balance: number; balanceDate: string
}

interface EbSyncResponse {
  accounts: EbWorkerAccount[]
  transactions: StoredTx[]
  meta: { accountCount: number; count: number; added: number; newlyAddedIds: string[]; from: string; to: string; fetchedAt: string }
  error?: string
}

export type EbStatus = 'idle' | 'starting' | 'awaiting_auth' | 'syncing' | 'success' | 'error'

export function useEnableBanking(
  onImport: (rows: StoredTx[]) => void,
  onAccounts?: (accounts: Omit<Account, 'included'>[]) => void,
  onNewIds?: (ids: string[]) => void,
) {
  const [status,   setStatus]   = useState<EbStatus>('idle')
  const [message,  setMessage]  = useState('')
  const [lastSync, setLastSync] = useState<string | null>(() => localStorage.getItem(EB_LAST_SYNC_KEY))

  const applySync = useCallback((data: EbSyncResponse) => {
    if (onAccounts && data.accounts?.length) {
      const validTypes = new Set(['giro', 'savings', 'depot', 'loan', 'other'])
      onAccounts(data.accounts.map(a => ({
        ...a,
        type: validTypes.has(a.type) ? (a.type as 'giro' | 'savings' | 'depot' | 'loan' | 'other') : 'other',
      })))
    }

    onImport(data.transactions ?? [])
    if (data.meta.newlyAddedIds?.length) onNewIds?.(data.meta.newlyAddedIds)

    const syncTime = new Date().toLocaleString('de-DE')
    localStorage.setItem(EB_LAST_SYNC_KEY, syncTime)
    setLastSync(syncTime)
    setStatus('success')
    setMessage(`${data.meta.added} neu · ${data.meta.count} gesamt · ${data.meta.accountCount} Konten`)
  }, [onImport, onAccounts, onNewIds])

  const doSync = useCallback(async (cfg: WorkerConfig, code: string, days: number) => {
    setStatus('syncing')
    setMessage('')
    try {
      const res  = await fetch(`${cfg.workerUrl.replace(/\/$/, '')}/eb/sync`, {
        method: 'POST',
        credentials: 'include',
        headers: cfHeaders(),
        body: JSON.stringify({ code, days }),
      })
      const data = await res.json() as EbSyncResponse
      console.log('[EB] sync response:', JSON.stringify(data))
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)

      localStorage.removeItem(EB_PENDING_KEY)
      applySync(data)
    } catch (e) {
      reportError('EnableBanking-Sync fehlgeschlagen', e)
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Verbindungsfehler')
    }
  }, [applySync])

  // Sync via the session stored on the worker — no TAN, no redirect. Returns
  // 'needs_auth' when there is no usable session (never connected, expired,
  // or revoked by the bank) so the caller can point the user to Settings.
  const refresh = useCallback(async (cfg: WorkerConfig, days = 30): Promise<'ok' | 'needs_auth' | 'error'> => {
    setStatus('syncing')
    setMessage('')
    try {
      const res  = await fetch(`${cfg.workerUrl.replace(/\/$/, '')}/eb/sync`, {
        method: 'POST',
        credentials: 'include',
        headers: cfHeaders(),
        body: JSON.stringify({ days }),
      })
      const data = await res.json() as EbSyncResponse & { needsAuth?: boolean }
      if (data.needsAuth) {
        setStatus('idle')
        return 'needs_auth'
      }
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)
      applySync(data)
      return 'ok'
    } catch (e) {
      reportError('EnableBanking-Sync fehlgeschlagen', e)
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Verbindungsfehler')
      return 'error'
    }
  }, [applySync])

  // Detect redirect-back from EnableBanking (code in URL)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    console.log('[EB] redirect check — search:', window.location.search)
    const code = params.get('code')
    if (!code) {
      console.log('[EB] no ?code= found, skipping sync')
      return
    }
    console.log('[EB] got code, length:', code.length)

    window.history.replaceState({}, '', window.location.pathname)

    const raw = localStorage.getItem(EB_PENDING_KEY)
    console.log('[EB] pending in localStorage:', raw)
    if (!raw) return

    const pending: PendingSession = JSON.parse(raw)
    doSync({ workerUrl: pending.workerUrl }, code, pending.days)
  }, [doSync])

  const start = useCallback(async (
    cfg: WorkerConfig,
    aspspName = 'Commerzbank AG',
    aspspCountry = 'DE',
    days = 90,
  ) => {
    setStatus('starting')
    setMessage('')
    try {
      const redirectUrl = window.location.origin + import.meta.env.BASE_URL
      const res  = await fetch(`${cfg.workerUrl.replace(/\/$/, '')}/eb/start`, {
        method: 'POST',
        credentials: 'include',
        headers: cfHeaders(),
        body: JSON.stringify({ redirect_url: redirectUrl, aspsp_name: aspspName, aspsp_country: aspspCountry }),
      })
      const data = await res.json() as { authorization_id: string; auth_url: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)

      // Persist enough info to complete sync after redirect
      const pending: PendingSession = { workerUrl: cfg.workerUrl, days }
      localStorage.setItem(EB_PENDING_KEY, JSON.stringify(pending))

      setStatus('awaiting_auth')
      window.location.href = data.auth_url
    } catch (e) {
      reportError('EnableBanking-Start fehlgeschlagen', e)
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Verbindungsfehler')
    }
  }, [])

  return { start, refresh, status, message, lastSync }
}
