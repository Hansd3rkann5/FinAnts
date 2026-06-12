import { useState, useCallback } from 'react'
import type { Category, MerchantProfile } from '@/types'
import { loadWorkerConfig } from './useWorkerSync'
import { useTransactionsCtx } from '@/context/TransactionsContext'

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

async function pushToCloud(workerUrl: string, apiKey: string, state: CloudState): Promise<void> {
  const res = await fetch(new URL('/state', workerUrl).toString(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify(state),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
}

async function pullFromCloud(workerUrl: string, apiKey: string): Promise<CloudState | null> {
  const res = await fetch(new URL('/state', workerUrl).toString(), {
    headers: { 'X-Api-Key': apiKey },
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

  function resolveConfig(override?: { workerUrl: string; apiKey: string }) {
    if (override?.workerUrl && override?.apiKey) return override
    return loadWorkerConfig()
  }

  const push = useCallback(async (override?: { workerUrl: string; apiKey: string }) => {
    const cfg = resolveConfig(override)
    if (!cfg) { setStatus('error'); setMessage('Worker nicht konfiguriert'); return }
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
      await pushToCloud(cfg.workerUrl, cfg.apiKey, state)
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

  const pull = useCallback(async (override?: { workerUrl: string; apiKey: string }) => {
    const cfg = resolveConfig(override)
    if (!cfg) { setStatus('error'); setMessage('Worker nicht konfiguriert'); return }
    setStatus('pulling')
    setMessage('')
    try {
      const state = await pullFromCloud(cfg.workerUrl, cfg.apiKey)
      if (!state) throw new Error('Kein Backup vorhanden')
      ctx.applyCloudCategories(state.customCategories ?? [])
      ctx.applyCloudProfiles(state.merchantProfiles ?? [])
      if (state.txOverrides) ctx.applyTxOverrides(state.txOverrides)
      const time = new Date().toLocaleString('de-DE')
      localStorage.setItem(LAST_CLOUD_SYNC_KEY, time)
      setLastSync(time)
      setStatus('success')
      setMessage(`${(state.merchantProfiles ?? []).length} Profile, ${(state.customCategories ?? []).length} Kategorien geladen`)
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Unbekannter Fehler')
    }
  }, [ctx])

  return { push, pull, status, message, lastSync }
}
