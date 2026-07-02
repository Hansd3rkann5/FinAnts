import { useState, useCallback } from 'react'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import type { WorkerConfig } from '@/utils/workerConfig'
import { pushCloudState, pullCloudState, type CloudState } from '@/utils/cloudSync'

const LAST_CLOUD_SYNC_KEY = 'finants_cloud_sync'

export type CloudSyncStatus = 'idle' | 'pushing' | 'pulling' | 'success' | 'error'

// Manual Cloud-Backup buttons. Categories + merchant profiles now also sync
// automatically (see TransactionsContext); these remain as an explicit force.
export function useCloudSync() {
  const ctx = useTransactionsCtx()
  const [status, setStatus] = useState<CloudSyncStatus>('idle')
  const [message, setMessage] = useState('')
  const [lastSync, setLastSync] = useState<string | null>(() => localStorage.getItem(LAST_CLOUD_SYNC_KEY))

  const push = useCallback(async (_override?: WorkerConfig) => {
    setStatus('pushing')
    setMessage('')
    try {
      // PUT replaces the whole blob — include every synced field, otherwise a
      // manual push silently drops whatever it omits (splits, accounts, …).
      const state: CloudState = {
        version: 1,
        updatedAt: new Date().toISOString(),
        customCategories: ctx.customCategories,
        merchantProfiles: ctx.merchantProfiles,
        txSplits: ctx.txSplits,
        excludedMerchants: ctx.excludedMerchants,
        accounts: ctx.accounts,
      }
      await pushCloudState(state)
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

  const pull = useCallback(async (_override?: WorkerConfig) => {
    setStatus('pulling')
    setMessage('')
    try {
      const state = await pullCloudState()
      if (!state) throw new Error('Kein Backup vorhanden')
      ctx.applyCloudCategories(state.customCategories ?? [])
      ctx.applyCloudProfiles(state.merchantProfiles ?? [])
      ctx.applyCloudSplits(state.txSplits ?? {})
      ctx.applyCloudExcludedMerchants(state.excludedMerchants ?? [])
      ctx.applyCloudAccounts(state.accounts)
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
