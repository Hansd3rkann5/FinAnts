import { useState, useEffect, useCallback } from 'react'
import type { Transaction, RecurringGroup } from '@/types'
import { detectRecurring } from '@/utils/recurringDetector'
import {
  fetchTransactions, mergeTransactions, updateTransactionRemote, clearTransactionsRemote,
  storedToTransaction, transactionToMergeRow,
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions))
  localStorage.setItem(STORAGE_GROUPS_KEY, JSON.stringify(groups))
}

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [recurringGroups, setRecurringGroups] = useState<RecurringGroup[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  // Detect recurring, set state + refresh cache.
  const setFromTransactions = useCallback((enriched: Transaction[]) => {
    const { transactions: annotated, groups } = detectRecurring(enriched)
    setTransactions(annotated)
    setRecurringGroups(groups)
    saveCache(annotated, groups)
  }, [])

  // Enrich canonical rows from the cloud store and display them.
  const applyServerTransactions = useCallback((rows: StoredTx[]) => {
    setFromTransactions(rows.map(storedToTransaction))
  }, [setFromTransactions])

  // Pull the canonical set from D1 and make the app mirror it. Used on mount
  // and by pull-to-refresh. Throws on failure so callers can surface it.
  const refresh = useCallback(async () => {
    const rows = await fetchTransactions()
    applyServerTransactions(rows)
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
      .catch(err => console.warn('[transactions] cloud load failed, using cache:', err))
    return () => { active = false }
  }, [applyServerTransactions])

  // CSV import → merge delta server-side, then display the canonical set.
  // Pending rows aren't persisted (their key changes once booked), so we keep
  // the freshly parsed pending entries on top transiently for display.
  const importTransactions = useCallback(async (raw: Transaction[]) => {
    const rows = raw.map(transactionToMergeRow)
    const { transactions: merged, meta } = await mergeTransactions(rows, 'csv')
    const pending = raw.filter(t => t.isPending)
    setFromTransactions([...pending, ...merged.map(storedToTransaction)])
    return meta
  }, [setFromTransactions])

  // ── Per-tx edits: optimistic local update + persist override to D1 ──────────
  const updateCategory = useCallback((id: string, categoryId: Transaction['categoryId']) => {
    setTransactions(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, categoryId } : t)
      saveCache(updated, recurringGroups)
      return updated
    })
    updateTransactionRemote(id, { categoryId }).catch(e => console.warn('[transactions] update failed:', e))
  }, [recurringGroups])

  const batchUpdateCategory = useCallback((ids: string[], categoryId: Transaction['categoryId']) => {
    const idSet = new Set(ids)
    setTransactions(prev => {
      const updated = prev.map(t => idSet.has(t.id) ? { ...t, categoryId } : t)
      saveCache(updated, recurringGroups)
      return updated
    })
    Promise.all(ids.map(id => updateTransactionRemote(id, { categoryId })))
      .catch(e => console.warn('[transactions] batch update failed:', e))
  }, [recurringGroups])

  const updateTransaction = useCallback((id: string, patch: Partial<Pick<Transaction, 'categoryId' | 'customLabel' | 'customIcon'>>) => {
    setTransactions(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, ...patch } : t)
      saveCache(updated, recurringGroups)
      return updated
    })
    updateTransactionRemote(id, patch).catch(e => console.warn('[transactions] update failed:', e))
  }, [recurringGroups])

  const removeRecurringGroup = useCallback((id: string) => {
    setRecurringGroups(prev => {
      const next = prev.filter(g => g.id !== id)
      saveCache(transactions, next)
      return next
    })
  }, [transactions])

  const clearAll = useCallback(async () => {
    setTransactions([])
    setRecurringGroups([])
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_GROUPS_KEY)
    try { await clearTransactionsRemote() } catch (e) { console.warn('[transactions] clear failed:', e) }
  }, [])

  return {
    transactions, recurringGroups, isLoaded,
    importTransactions, applyServerTransactions, refresh,
    updateCategory, batchUpdateCategory, updateTransaction,
    removeRecurringGroup, clearAll,
  }
}
