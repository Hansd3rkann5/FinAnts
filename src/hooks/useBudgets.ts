import { useState, useCallback } from 'react'
import { reportError } from '@/utils/notify'

const STORAGE_KEY = 'finants_budgets'

// One spending limit per category, checked against the current month's
// expenses in the Dashboard's budget panel.
export interface Budget {
  categoryId: string
  limit: number
}

function load(): Budget[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Budget[]) : []
  } catch {
    return []
  }
}

function persist(budgets: Budget[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(budgets))
  } catch (e) {
    reportError('Speicher voll', e)
  }
}

export function useBudgets() {
  const [budgets, setBudgets] = useState<Budget[]>(load)

  const setBudget = useCallback((categoryId: string, limit: number) => {
    setBudgets(prev => {
      const next = prev.some(b => b.categoryId === categoryId)
        ? prev.map(b => b.categoryId === categoryId ? { ...b, limit } : b)
        : [...prev, { categoryId, limit }]
      persist(next)
      return next
    })
  }, [])

  const removeBudget = useCallback((categoryId: string) => {
    setBudgets(prev => {
      const next = prev.filter(b => b.categoryId !== categoryId)
      persist(next)
      return next
    })
  }, [])

  const applyCloudBudgets = useCallback((incoming: Budget[] | undefined) => {
    // undefined = cloud blob predates budgets → keep local, next push migrates.
    if (!incoming) return
    setBudgets(prev => {
      if (JSON.stringify(incoming) === JSON.stringify(prev)) return prev
      persist(incoming)
      return incoming
    })
  }, [])

  return { budgets, setBudget, removeBudget, applyCloudBudgets }
}
