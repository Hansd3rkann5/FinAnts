import { useMemo } from 'react'
import type { Transaction, TimeFilter, BalanceSummary, CategorySummary } from '@/types'
import { isExcluded } from '@/data/categories'
import { filterByTimeFilter } from '@/utils/chartCompute'

export function useFilteredTransactions(transactions: Transaction[], filter: TimeFilter) {
  // Delegate to the shared range filter so encoded filters (a specific
  // month/year/week, e.g. "month/2025/8") work — the previous switch only
  // matched the base cases and let a specific month fall through to "all".
  return useMemo(() => filterByTimeFilter(transactions, filter), [transactions, filter])
}

export function useBalanceSummary(transactions: Transaction[]): BalanceSummary {
  return useMemo(() => {
    const booked = transactions.filter(t => !t.isPending && !isExcluded(t))
    const totalIncome = booked.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    const totalExpenses = Math.abs(booked.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0))
    const balance = totalIncome - totalExpenses

    const categoryMap = new Map<string, number>()
    for (const t of booked.filter(t => t.amount < 0)) {
      categoryMap.set(t.categoryId, (categoryMap.get(t.categoryId) ?? 0) + Math.abs(t.amount))
    }

    const categories: CategorySummary[] = Array.from(categoryMap.entries())
      .map(([categoryId, total]) => ({
        categoryId: categoryId as Transaction['categoryId'],
        total,
        count: booked.filter(t => t.categoryId === categoryId && t.amount < 0).length,
        percentage: totalExpenses > 0 ? (total / totalExpenses) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)

    return { totalIncome, totalExpenses, balance, categories }
  }, [transactions])
}
