import { useState, useEffect, useCallback, useRef } from 'react'
import type { Transaction, RecurringGroup, MerchantProfile } from '@/types'
import type { SplitMap } from '@/hooks/useTxSplits'
import { detectRecurring } from '@/utils/recurringDetector'
import { reportError } from '@/utils/notify'
import {
  fetchTransactions, mergeTransactions, updateTransactionRemote, clearTransactionsRemote,
  enrichTransactions, transactionToMergeRow,
  type StoredTx,
} from '@/utils/transactionsApi'

const STORAGE_KEY = 'finants_transactions'
const STORAGE_GROUPS_KEY = 'finants_recurring_groups'

// localStorage is only an offline read-cache now; the canonical store is D1.
function loadCache(): { transactions: Transaction[]; groups: RecurringGroup[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const rawGroups = localStorage.getItem(STORAGE_GROUPS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as (Omit<Transaction, 'date'> & { date: string })[]
      const transactions = parsed.map(t => ({ ...t, date: new Date(t.date) }))
      const groups = rawGroups ? JSON.parse(rawGroups) as RecurringGroup[] : []
      return { transactions, groups }
    }
  } catch {
    /* ignore corrupted cache */
  }
  return { transactions: [], groups: [] }
}

function saveCache(transactions: Transaction[], groups: RecurringGroup[]) {
  try {
    // Drop embedded data-URL icons before caching — a single base64 image can be
    // hundreds of KB and duplicates across every matching row, which blows the
    // localStorage quota. They're re-applied from patterns / R2 on the next load.
    const slim = transactions.map(t =>
      t.customIcon?.startsWith('data:') ? { ...t, customIcon: undefined } : t,
    )
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim))
    localStorage.setItem(STORAGE_GROUPS_KEY, JSON.stringify(groups))
  } catch (e) {
    // Quota exceeded / private-mode: the cache is only an offline nicety, so
    // never let it crash the app — drop it and carry on (D1 is the source).
    reportError('Speicher voll', e)
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(STORAGE_GROUPS_KEY)
    } catch { /* ignore */ }
  }
}

export function useTransactions(merchantProfiles: MerchantProfile[], txSplits: SplitMap = {}) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [recurringGroups, setRecurringGroups] = useState<RecurringGroup[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  // Latest canonical rows + profiles + splits, kept in refs so the callbacks
  // below stay stable (the mount fetch must not re-run when these change).
  const rawRowsRef = useRef<StoredTx[]>([])
  const profilesRef = useRef(merchantProfiles)
  profilesRef.current = merchantProfiles
  const splitsRef = useRef(txSplits)
  splitsRef.current = txSplits

  // Detect recurring, set state + refresh cache.
  const setFromTransactions = useCallback((enriched: Transaction[]) => {
    const { transactions: annotated, groups } = detectRecurring(enriched)
    setTransactions(annotated)
    setRecurringGroups(groups)
    saveCache(annotated, groups)
  }, [])

  // Enrich canonical rows (applying merchant patterns) and display them.
  const applyServerTransactions = useCallback((rows: StoredTx[]) => {
    rawRowsRef.current = rows
    setFromTransactions(enrichTransactions(rows, profilesRef.current, splitsRef.current))
  }, [setFromTransactions])

  // Pull the canonical set from D1 and make the app mirror it.
  const refresh = useCallback(async () => {
    applyServerTransactions(await fetchTransactions())
  }, [applyServerTransactions])

  // On mount: paint from cache instantly, then refresh from the canonical store.
  useEffect(() => {
    const cached = loadCache()
    setTransactions(cached.transactions)
    setRecurringGroups(cached.groups)
    setIsLoaded(true)

    let active = true
    fetchTransactions()
      .then(rows => { if (active) applyServerTransactions(rows) })
      .catch(err => reportError('Laden fehlgeschlagen', err))
    return () => { active = false }
  }, [applyServerTransactions])

  // Re-enrich live when patterns or splits change (an edit, or the cloud
  // auto-pull), so existing transactions pick up the updated icon/label/category
  // and chart split overlay.
  useEffect(() => {
    if (rawRowsRef.current.length === 0) return
    setFromTransactions(enrichTransactions(rawRowsRef.current, merchantProfiles, txSplits))
  }, [merchantProfiles, txSplits, setFromTransactions])

  // CSV import → merge delta server-side, then display the canonical set.
  // Pending rows aren't persisted (their key changes once booked), so we keep
  // the freshly parsed pending entries on top transiently for display.
  const importTransactions = useCallback(async (raw: Transaction[]) => {
    const rows = raw.map(transactionToMergeRow)
    const { transactions: merged, meta } = await mergeTransactions(rows, 'csv')
    rawRowsRef.current = merged
    const pending = raw.filter(t => t.isPending)
    setFromTransactions([...pending, ...enrichTransactions(merged, profilesRef.current, splitsRef.current)])
    return meta
  }, [setFromTransactions])

  // ── Per-tx edits: optimistic local update + persist override to D1 ──────────
  // Also patch the raw-row cache so a pattern-triggered re-enrich keeps the edit.
  const patchRaw = (ids: Set<string>, patch: Partial<Pick<StoredTx, 'categoryId' | 'customLabel' | 'customIcon'>>) => {
    rawRowsRef.current = rawRowsRef.current.map(r => ids.has(r.id) ? { ...r, ...patch } : r)
  }

  const updateCategory = useCallback((id: string, categoryId: Transaction['categoryId']) => {
    setTransactions(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, categoryId } : t)
      saveCache(updated, recurringGroups)
      return updated
    })
    patchRaw(new Set([id]), { categoryId })
    updateTransactionRemote(id, { categoryId }).catch(e => reportError('Speichern fehlgeschlagen', e))
  }, [recurringGroups])

  const batchUpdateCategory = useCallback((ids: string[], categoryId: Transaction['categoryId']) => {
    const idSet = new Set(ids)
    setTransactions(prev => {
      const updated = prev.map(t => idSet.has(t.id) ? { ...t, categoryId } : t)
      saveCache(updated, recurringGroups)
      return updated
    })
    patchRaw(idSet, { categoryId })
    Promise.all(ids.map(id => updateTransactionRemote(id, { categoryId })))
      .catch(e => reportError('Speichern fehlgeschlagen', e))
  }, [recurringGroups])

  const updateTransaction = useCallback((id: string, patch: Partial<Pick<Transaction, 'categoryId' | 'customLabel' | 'customIcon'>>) => {
    setTransactions(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, ...patch } : t)
      saveCache(updated, recurringGroups)
      return updated
    })
    const rawPatch: Partial<Pick<StoredTx, 'categoryId' | 'customLabel' | 'customIcon'>> = {}
    if ('categoryId' in patch)  rawPatch.categoryId  = patch.categoryId  ?? null
    if ('customLabel' in patch) rawPatch.customLabel = patch.customLabel ?? null
    if ('customIcon' in patch)  rawPatch.customIcon  = patch.customIcon  ?? null
    patchRaw(new Set([id]), rawPatch)
    updateTransactionRemote(id, patch).catch(e => reportError('Speichern fehlgeschlagen', e))
  }, [recurringGroups])

  const removeRecurringGroup = useCallback((id: string) => {
    setRecurringGroups(prev => {
      const next = prev.filter(g => g.id !== id)
      saveCache(transactions, next)
      return next
    })
  }, [transactions])

  const clearAll = useCallback(async () => {
    rawRowsRef.current = []
    setTransactions([])
    setRecurringGroups([])
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_GROUPS_KEY)
    try { await clearTransactionsRemote() } catch (e) { reportError('Löschen fehlgeschlagen', e) }
  }, [])

  return {
    transactions, recurringGroups, isLoaded,
    importTransactions, applyServerTransactions, refresh,
    updateCategory, batchUpdateCategory, updateTransaction,
    removeRecurringGroup, clearAll,
  }
}
