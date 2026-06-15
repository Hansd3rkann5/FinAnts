import { useState, useCallback } from 'react'
import { reportError } from '@/utils/notify'

// Chart-only category splits, keyed by transaction id. Stored in localStorage
// (cache) and synced via the R2 settings blob — the D1 transaction rows are
// never touched. A split's amounts are signed and sum to the transaction amount.
export type Split = { categoryId: string; amount: number }
export type SplitMap = Record<string, Split[]>

const STORAGE_KEY = 'finants_tx_splits'

function load(): SplitMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SplitMap) : {}
  } catch {
    return {}
  }
}

function save(map: SplitMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch (e) {
    reportError('Speicher voll', e)
  }
}

export function useTxSplits() {
  const [txSplits, setTxSplits] = useState<SplitMap>(load)

  const setSplit = useCallback((id: string, parts: Split[]) => {
    setTxSplits(prev => {
      const next = { ...prev, [id]: parts }
      save(next)
      return next
    })
  }, [])

  const clearSplit = useCallback((id: string) => {
    setTxSplits(prev => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      save(next)
      return next
    })
  }, [])

  const applyCloudSplits = useCallback((map: SplitMap) => {
    const m = map ?? {}
    setTxSplits(m)
    save(m)
  }, [])

  return { txSplits, setSplit, clearSplit, applyCloudSplits }
}
