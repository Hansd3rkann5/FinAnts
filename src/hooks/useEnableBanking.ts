import { useState, useEffect, useCallback } from 'react'
import { autoCategory } from '@/utils/categorizer'
import { findMerchant } from '@/utils/merchantLogos'
import type { Transaction, Account } from '@/types'
import type { WorkerConfig } from './useWorkerSync'

const EB_PENDING_KEY  = 'finants_eb_pending'
const EB_LAST_SYNC_KEY = 'finants_eb_last_sync'

interface PendingSession {
  workerUrl: string
  apiKey: string
  days: number
}

interface EbWorkerTransaction {
  date: string; amount: number; description: string
  counterparty: string; counterpartyIban: string; accountIban: string
}

interface EbWorkerAccount {
  iban: string; blz: string; accountNumber: string; owner: string
  description: string; type: string; currency: string; balance: number; balanceDate: string
}

interface EbSyncResponse {
  accounts: EbWorkerAccount[]
  transactions: EbWorkerTransaction[]
  meta: { accountCount: number; count: number; from: string; to: string; fetchedAt: string }
  error?: string
}

function mapTx(raw: EbWorkerTransaction): Transaction {
  const date     = new Date(raw.date)
  const merchant = findMerchant(`${raw.description} ${raw.counterparty}`)
  return {
    id: `eb-${date.getTime()}-${Math.abs(raw.amount).toFixed(0)}-${(raw.counterparty ?? '').slice(0, 6)}-${raw.accountIban?.slice(-4) ?? ''}`,
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

export type EbStatus = 'idle' | 'starting' | 'awaiting_auth' | 'syncing' | 'success' | 'error'

export function useEnableBanking(
  onImport: (txs: Transaction[]) => void,
  onAccounts?: (accounts: Omit<Account, 'included'>[]) => void,
) {
  const [status,   setStatus]   = useState<EbStatus>('idle')
  const [message,  setMessage]  = useState('')
  const [lastSync, setLastSync] = useState<string | null>(() => localStorage.getItem(EB_LAST_SYNC_KEY))

  const doSync = useCallback(async (cfg: WorkerConfig, code: string, days: number) => {
    setStatus('syncing')
    setMessage('')
    try {
      const res  = await fetch(`${cfg.workerUrl}/eb/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': cfg.apiKey },
        body: JSON.stringify({ code, days }),
      })
      const data = await res.json() as EbSyncResponse
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)

      if (onAccounts && data.accounts?.length) {
        const validTypes = new Set(['giro', 'savings', 'depot', 'loan', 'other'])
        onAccounts(data.accounts.map(a => ({
          ...a,
          type: validTypes.has(a.type) ? (a.type as 'giro' | 'savings' | 'depot' | 'loan' | 'other') : 'other',
        })))
      }

      onImport((data.transactions ?? []).map(mapTx))

      localStorage.removeItem(EB_PENDING_KEY)
      const syncTime = new Date().toLocaleString('de-DE')
      localStorage.setItem(EB_LAST_SYNC_KEY, syncTime)
      setLastSync(syncTime)
      setStatus('success')
      setMessage(`${data.meta.count} Buchungen · ${data.meta.accountCount} Konten`)
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Verbindungsfehler')
    }
  }, [onImport, onAccounts])

  // Detect redirect-back from EnableBanking (code in URL)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code   = params.get('code')
    if (!code) return

    // Clean URL immediately so it doesn't re-trigger on hot-reload
    window.history.replaceState({}, '', window.location.pathname)

    const raw = localStorage.getItem(EB_PENDING_KEY)
    if (!raw) return

    const pending: PendingSession = JSON.parse(raw)
    doSync({ workerUrl: pending.workerUrl, apiKey: pending.apiKey }, code, pending.days)
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
      const res  = await fetch(`${cfg.workerUrl}/eb/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': cfg.apiKey },
        body: JSON.stringify({ redirect_url: redirectUrl, aspsp_name: aspspName, aspsp_country: aspspCountry }),
      })
      const data = await res.json() as { authorization_id: string; auth_url: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)

      // Persist enough info to complete sync after redirect
      const pending: PendingSession = { workerUrl: cfg.workerUrl, apiKey: cfg.apiKey, days }
      localStorage.setItem(EB_PENDING_KEY, JSON.stringify(pending))

      setStatus('awaiting_auth')
      window.location.href = data.auth_url
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Verbindungsfehler')
    }
  }, [])

  return { start, status, message, lastSync }
}
