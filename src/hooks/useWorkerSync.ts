import { useState, useCallback } from 'react'
import { autoCategory } from '@/utils/categorizer'
import { findMerchant } from '@/utils/merchantLogos'
import type { Transaction, Account } from '@/types'

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

interface WorkerTransaction {
  date: string
  amount: number
  description: string
  counterparty: string
  counterpartyIban: string
  accountIban: string
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
  transactions: WorkerTransaction[]
  meta: { accountCount: number; count: number; from: string; to: string; fetchedAt: string }
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

export function loadLastSync(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY)
}

function mapWorkerTx(raw: WorkerTransaction): Transaction {
  const date = new Date(raw.date)
  const merchant = findMerchant(`${raw.description} ${raw.counterparty}`)
  return {
    id: `worker-${date.getTime()}-${Math.abs(raw.amount).toFixed(0)}-${(raw.counterparty ?? '').slice(0, 6)}-${raw.accountIban?.slice(-4) ?? ''}`,
    date,
    amount: raw.amount,
    type: raw.amount >= 0 ? 'income' : 'expense',
    description: raw.description,
    counterparty: raw.counterparty,
    iban: raw.counterpartyIban || undefined,
    categoryId: autoCategory(raw.description, raw.counterparty),
    merchantKey: merchant?.merchantKey,
    isRecurring: false,
  }
}

export type SyncStatus = 'idle' | 'syncing' | 'challenge' | 'success' | 'error'

export function useWorkerSync(
  onImport: (txs: Transaction[]) => void,
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

      const transactions = (data.transactions ?? []).map(mapWorkerTx)
      onImport(transactions)

      const syncTime = new Date().toLocaleString('de-DE')
      localStorage.setItem(LAST_SYNC_KEY, syncTime)
      setLastSync(syncTime)
      setChallenge(null)
      setStatus('success')
      setMessage(`${data.meta.count} Buchungen · ${data.meta.accountCount} Konten`)
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
