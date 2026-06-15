import { useState, useCallback } from 'react'
import type { Account } from '@/types'
import type { StoredTx } from '@/utils/transactionsApi'

export interface WorkerConfig {
  workerUrl: string
}

export interface TanChallenge {
  method: 'photoTAN' | 'pushTAN' | 'smsTAN' | 'other'
  imageBase64?: string
  hint?: string
  orderRef: string
  dialogId: string
  secRef: number
  secFun: string
}

interface WorkerAccount {
  iban: string
  blz: string
  accountNumber: string
  owner: string
  description: string
  type: string
  currency: string
  balance: number
  balanceDate: string
}

interface WorkerSuccessResponse {
  accounts: WorkerAccount[]
  transactions: StoredTx[]
  meta: { accountCount: number; count: number; added: number; from: string; to: string; fetchedAt: string }
}

interface WorkerChallengeResponse {
  challenge: TanChallenge
}

const CONFIG_KEY = 'finants_worker_config'
const LAST_SYNC_KEY = 'finants_last_sync'

export function loadWorkerConfig(): WorkerConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? (JSON.parse(raw) as WorkerConfig) : null
  } catch {
    return null
  }
}

export function saveWorkerConfig(cfg: WorkerConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
}

const DEFAULT_WORKER_URL = (import.meta.env.VITE_WORKER_URL ?? 'https://finants-proxy.simon-bader.workers.dev').replace(/\/$/, '')

// The worker base URL — saved config if present, otherwise the built-in default.
// Use this everywhere instead of gating on loadWorkerConfig() (which is usually null).
export function resolveWorkerUrl(): string {
  return (loadWorkerConfig()?.workerUrl ?? DEFAULT_WORKER_URL).replace(/\/$/, '')
}

export function loadLastSync(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY)
}

export type SyncStatus = 'idle' | 'syncing' | 'challenge' | 'success' | 'error'

export function useWorkerSync(
  onImport: (rows: StoredTx[]) => void,
  onAccounts?: (accounts: Omit<Account, 'included'>[]) => void,
) {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [message, setMessage] = useState('')
  const [lastSync, setLastSync] = useState<string | null>(loadLastSync)
  const [challenge, setChallenge] = useState<TanChallenge | null>(null)
  const [pendingDays, setPendingDays] = useState(90)
  const [pendingConfig, setPendingConfig] = useState<WorkerConfig | null>(null)

  const doSync = useCallback(async (
    cfg: WorkerConfig,
    days: number,
    options?: { tan?: string; dialogId?: string; secRef?: number; secFun?: string },
  ) => {
    setStatus('syncing')
    setMessage('')

    try {
      let res: Response
      if (options?.tan) {
        res = await fetch(new URL('/tan', cfg.workerUrl).toString(), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tan: options.tan,
            dialogId: options.dialogId,
            secRef: options.secRef,
            secFun: options.secFun,
            days,
          }),
        })
      } else {
        const url = new URL(cfg.workerUrl)
        url.searchParams.set('days', String(days))
        res = await fetch(url.toString(), { credentials: 'include' })
      }

      if (res.status === 202) {
        const data = await res.json() as WorkerChallengeResponse
        setChallenge(data.challenge)
        setPendingConfig(cfg)
        setPendingDays(days)
        setStatus('challenge')
        return
      }

      const data = await res.json() as WorkerSuccessResponse & { error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)

      if (onAccounts && data.accounts?.length) {
        const validTypes = new Set(['giro', 'savings', 'depot', 'loan', 'other'])
        onAccounts(data.accounts.map(a => ({
          ...a,
          type: validTypes.has(a.type) ? (a.type as 'giro' | 'savings' | 'depot' | 'loan' | 'other') : 'other',
        })))
      }

      onImport(data.transactions ?? [])

      const syncTime = new Date().toLocaleString('de-DE')
      localStorage.setItem(LAST_SYNC_KEY, syncTime)
      setLastSync(syncTime)
      setChallenge(null)
      setStatus('success')
      setMessage(`${data.meta.added} neu · ${data.meta.count} gesamt · ${data.meta.accountCount} Konten`)
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Verbindungsfehler')
    }
  }, [onImport, onAccounts])

  const sync = useCallback((cfg: WorkerConfig, days = 90) => {
    return doSync(cfg, days)
  }, [doSync])

  const submitTan = useCallback((tan: string) => {
    if (!pendingConfig || !challenge) return
    return doSync(pendingConfig, pendingDays, {
      tan,
      dialogId: challenge.dialogId,
      secRef: challenge.secRef,
      secFun: challenge.secFun,
    })
  }, [pendingConfig, pendingDays, challenge, doSync])

  const dismissChallenge = useCallback(() => {
    setChallenge(null)
    setStatus('idle')
  }, [])

  return { sync, submitTan, dismissChallenge, status, message, lastSync, challenge }
}
