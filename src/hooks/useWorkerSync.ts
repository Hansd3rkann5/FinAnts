import { useState, useCallback } from 'react'
import { autoCategory } from '@/utils/categorizer'
import { findMerchant } from '@/utils/merchantLogos'
import type { Transaction } from '@/types'

interface WorkerConfig {
  workerUrl: string
  apiKey: string
}

interface WorkerTransaction {
  date: string
  amount: number
  description: string
  counterparty: string
  counterpartyIban: string
}

interface WorkerResponse {
  transactions: WorkerTransaction[]
  meta: {
    count: number
    from: string
    to: string
    fetchedAt: string
  }
  error?: string
}

const CONFIG_KEY = 'finants_worker_config'
const LAST_SYNC_KEY = 'finants_last_sync'

export function loadWorkerConfig(): WorkerConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? JSON.parse(raw) as WorkerConfig : null
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
    id: `worker-${date.getTime()}-${Math.abs(raw.amount).toFixed(0)}-${raw.counterparty.slice(0, 6)}`,
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

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

export function useWorkerSync(onImport: (txs: Transaction[]) => void) {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [message, setMessage] = useState('')
  const [lastSync, setLastSync] = useState<string | null>(loadLastSync)

  const sync = useCallback(async (cfg: WorkerConfig, days = 90) => {
    setStatus('syncing')
    setMessage('')

    try {
      const url = new URL(cfg.workerUrl)
      url.searchParams.set('days', String(days))

      const res = await fetch(url.toString(), {
        headers: { 'X-Api-Key': cfg.apiKey },
      })

      const data = await res.json() as WorkerResponse

      if (!res.ok || data.error) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }

      const transactions = data.transactions.map(mapWorkerTx)
      onImport(transactions)

      const syncTime = new Date().toLocaleString('de-DE')
      localStorage.setItem(LAST_SYNC_KEY, syncTime)
      setLastSync(syncTime)
      setStatus('success')
      setMessage(`${data.meta.count} Buchungen synchronisiert`)
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Verbindungsfehler')
    }
  }, [onImport])

  return { sync, status, message, lastSync }
}
