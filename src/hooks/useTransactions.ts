import { useState, useEffect, useCallback } from 'react'
import type { Transaction, RecurringGroup } from '@/types'
import { detectRecurring } from '@/utils/recurringDetector'
import { MOCK_TRANSACTIONS } from '@/utils/mockData'

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
    if (stored.transactions.length > 0) {
      setTransactions(stored.transactions)
      setRecurringGroups(stored.groups)
    } else {
      const { transactions: annotated, groups } = detectRecurring(MOCK_TRANSACTIONS)
      setTransactions(annotated)
      setRecurringGroups(groups)
      saveToStorage(annotated, groups)
    }
    setIsLoaded(true)
  }, [])

  const importTransactions = useCallback((raw: Transaction[]) => {
    const merged = [...raw]
    const existingIds = new Set(transactions.map(t => t.id))
    const existing = transactions.filter(t => existingIds.has(t.id))

    const combined = [...merged, ...existing].sort((a, b) => b.date.getTime() - a.date.getTime())
    const deduped = combined.filter((t, i, arr) =>
      i === arr.findIndex(x =>
        x.date.getTime() === t.date.getTime() &&
        Math.abs(x.amount - t.amount) < 0.01 &&
        x.counterparty === t.counterparty
      )
    )

    const { transactions: annotated, groups } = detectRecurring(deduped)
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

  const clearAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_GROUPS_KEY)
    const { transactions: annotated, groups } = detectRecurring(MOCK_TRANSACTIONS)
    setTransactions(annotated)
    setRecurringGroups(groups)
  }, [])

  return { transactions, recurringGroups, isLoaded, importTransactions, updateCategory, clearAll }
}
