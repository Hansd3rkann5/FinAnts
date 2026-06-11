import { useMemo } from 'react'
import { startOfWeek, startOfMonth, startOfYear, isAfter } from 'date-fns'
import type { Transaction, TimeFilter, BalanceSummary, CategorySummary } from '@/types'

export function useFilteredTransactions(transactions: Transaction[], filter: TimeFilter) {
  return useMemo(() => {
    const now = new Date()
    let cutoff: Date | null = null

    switch (filter) {
      case 'week':  cutoff = startOfWeek(now, { weekStartsOn: 1 }); break
      case 'month': cutoff = startOfMonth(now); break
      case 'year':  cutoff = startOfYear(now); break
      case 'all':   cutoff = null; break
    }

    const filtered = cutoff
      ? transactions.filter(t => isAfter(t.date, cutoff!))
      : transactions

    return filtered
  }, [transactions, filter])
}

export function useBalanceSummary(transactions: Transaction[]): BalanceSummary {
  return useMemo(() => {
    const totalIncome = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    const totalExpenses = Math.abs(transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0))
    const balance = totalIncome - totalExpenses

    const categoryMap = new Map<string, number>()
    for (const t of transactions.filter(t => t.amount < 0)) {
      categoryMap.set(t.categoryId, (categoryMap.get(t.categoryId) ?? 0) + Math.abs(t.amount))
    }

    const categories: CategorySummary[] = Array.from(categoryMap.entries())
      .map(([categoryId, total]) => ({
        categoryId: categoryId as Transaction['categoryId'],
        total,
        count: transactions.filter(t => t.categoryId === categoryId && t.amount < 0).length,
        percentage: totalExpenses > 0 ? (total / totalExpenses) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)

    return { totalIncome, totalExpenses, balance, categories }
  }, [transactions])
}
