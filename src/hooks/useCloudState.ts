import { useState, useCallback } from 'react'
import type { Category, MerchantProfile } from '@/types'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import type { WorkerConfig } from './useWorkerSync'

export interface TxOverride {
  categoryId: string
  customLabel?: string
  customIcon?: string
}

export interface CloudState {
  version: 1
  updatedAt: string
  customCategories: Category[]
  merchantProfiles: MerchantProfile[]
  txOverrides: Record<string, TxOverride>
}

const LAST_CLOUD_SYNC_KEY = 'finants_cloud_sync'
const WORKER_URL = (import.meta.env.VITE_WORKER_URL ?? 'https://finants-proxy.simon-bader.workers.dev').replace(/\/$/, '')

async function pushToCloud(workerUrl: string, state: CloudState): Promise<void> {
  const res = await fetch(new URL('/state', workerUrl).toString(), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
}

async function pullFromCloud(workerUrl: string): Promise<CloudState | null> {
  const res = await fetch(new URL('/state', workerUrl).toString(), {
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<CloudState | null>
}

export type CloudSyncStatus = 'idle' | 'pushing' | 'pulling' | 'success' | 'error'

export function useCloudSync() {
  const ctx = useTransactionsCtx()
  const [status, setStatus] = useState<CloudSyncStatus>('idle')
  const [message, setMessage] = useState('')
  const [lastSync, setLastSync] = useState<string | null>(() => localStorage.getItem(LAST_CLOUD_SYNC_KEY))

  function resolveUrl(override?: WorkerConfig) {
    return (override?.workerUrl ?? WORKER_URL).replace(/\/$/, '')
  }

  const push = useCallback(async (override?: WorkerConfig) => {
    const url = resolveUrl(override)
    setStatus('pushing')
    setMessage('')
    try {
      const txOverrides: Record<string, TxOverride> = {}
      for (const t of ctx.transactions) {
        if (t.categoryId || t.customLabel || t.customIcon) {
          txOverrides[t.id] = { categoryId: t.categoryId, customLabel: t.customLabel, customIcon: t.customIcon }
        }
      }
      const state: CloudState = {
        version: 1,
        updatedAt: new Date().toISOString(),
        customCategories: ctx.customCategories,
        merchantProfiles: ctx.merchantProfiles,
        txOverrides,
      }
      await pushToCloud(url, state)
      const time = new Date().toLocaleString('de-DE')
      localStorage.setItem(LAST_CLOUD_SYNC_KEY, time)
      setLastSync(time)
      setStatus('success')
      setMessage(`${ctx.merchantProfiles.length} Profile, ${ctx.customCategories.length} Kategorien hochgeladen`)
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Unbekannter Fehler')
    }
  }, [ctx])

  const pull = useCallback(async (override?: WorkerConfig) => {
    const url = resolveUrl(override)
    setStatus('pulling')
    setMessage('')
    try {
      const state = await pullFromCloud(url)
      if (!state) throw new Error('Kein Backup vorhanden')
      ctx.applyCloudCategories(state.customCategories ?? [])
      ctx.applyCloudProfiles(state.merchantProfiles ?? [])
      if (state.txOverrides) ctx.applyTxOverrides(state.txOverrides)
      const time = new Date().toLocaleString('de-DE')
      localStorage.setItem(LAST_CLOUD_SYNC_KEY, time)
      setLastSync(time)
      setStatus('success')
      setMessage('Kategorien & Profile synchronisiert')
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Unbekannter Fehler')
    }
  }, [ctx])

  return { push, pull, status, message, lastSync }
}
