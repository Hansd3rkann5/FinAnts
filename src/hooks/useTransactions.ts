import { useState, useEffect, useCallback } from 'react'
import type { Transaction, RecurringGroup } from '@/types'
import type { TxOverride } from './useCloudState'
import { detectRecurring } from '@/utils/recurringDetector'

const STORAGE_KEY = 'finants_transactions'
const STORAGE_GROUPS_KEY = 'finants_recurring_groups'

function loadFromStorage(): { transactions: Transaction[]; groups: RecurringGroup[] } {
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
    /* ignore corrupted storage */
  }
  return { transactions: [], groups: [] }
}

function saveToStorage(transactions: Transaction[], groups: RecurringGroup[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions))
  localStorage.setItem(STORAGE_GROUPS_KEY, JSON.stringify(groups))
}

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [recurringGroups, setRecurringGroups] = useState<RecurringGroup[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const stored = loadFromStorage()
    // Wipe leftover mock data from previous sessions
    if (stored.transactions.some(t => t.id.startsWith('mock-'))) {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(STORAGE_GROUPS_KEY)
      setIsLoaded(true)
      return
    }
    setTransactions(stored.transactions)
    setRecurringGroups(stored.groups)
    setIsLoaded(true)
  }, [])

  const importTransactions = useCallback((raw: Transaction[]) => {
    const existingMap = new Map(transactions.map(t => [t.id, t]))

    const merged = raw.map(t => {
      const prev = existingMap.get(t.id)
      if (!prev) return t
      return { ...t, categoryId: prev.categoryId, customLabel: prev.customLabel, customIcon: prev.customIcon }
    })

    const { transactions: annotated, groups } = detectRecurring(merged)
    setTransactions(annotated)
    setRecurringGroups(groups)
    saveToStorage(annotated, groups)
  }, [transactions])

  const updateCategory = useCallback((id: string, categoryId: Transaction['categoryId']) => {
    setTransactions(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, categoryId } : t)
      saveToStorage(updated, recurringGroups)
      return updated
    })
  }, [recurringGroups])

  const batchUpdateCategory = useCallback((ids: string[], categoryId: Transaction['categoryId']) => {
    const idSet = new Set(ids)
    setTransactions(prev => {
      const updated = prev.map(t => idSet.has(t.id) ? { ...t, categoryId } : t)
      saveToStorage(updated, recurringGroups)
      return updated
    })
  }, [recurringGroups])

  const updateTransaction = useCallback((id: string, patch: Partial<Pick<Transaction, 'categoryId' | 'customLabel' | 'customIcon'>>) => {
    setTransactions(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, ...patch } : t)
      saveToStorage(updated, recurringGroups)
      return updated
    })
  }, [recurringGroups])

  const removeRecurringGroup = useCallback((id: string) => {
    setRecurringGroups(prev => {
      const next = prev.filter(g => g.id !== id)
      saveToStorage(transactions, next)
      return next
    })
  }, [transactions])

  const clearAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_GROUPS_KEY)
    setTransactions([])
    setRecurringGroups([])
  }, [])

  const applyTxOverrides = useCallback((overrides: Record<string, TxOverride>) => {
    setTransactions(prev => {
      const updated = prev.map(t => {
        const o = overrides[t.id]
        if (!o) return t
        return { ...t, categoryId: o.categoryId ?? t.categoryId, customLabel: o.customLabel, customIcon: o.customIcon }
      })
      saveToStorage(updated, recurringGroups)
      return updated
    })
  }, [recurringGroups])

  return { transactions, recurringGroups, isLoaded, importTransactions, updateCategory, batchUpdateCategory, updateTransaction, removeRecurringGroup, clearAll, applyTxOverrides }
}
