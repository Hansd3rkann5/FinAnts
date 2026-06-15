import { useMemo } from 'react'
import type { Transaction, TimeFilter, BalanceSummary, CategorySummary } from '@/types'
import { isExcluded, EXCLUDE_CATEGORY_ID } from '@/data/categories'
import { filterByTimeFilter, categoryPortions } from '@/utils/chartCompute'

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

    // Expand each transaction into its category portions (split overlay) so a
    // split counts toward both categories. Income/expense totals above are
    // unaffected (the parts sum to the amount).
    const categoryMap = new Map<string, number>()
    const countMap = new Map<string, number>()
    for (const t of booked) {
      for (const p of categoryPortions(t)) {
        if (p.amount < 0 && p.categoryId !== EXCLUDE_CATEGORY_ID) {
          categoryMap.set(p.categoryId, (categoryMap.get(p.categoryId) ?? 0) + Math.abs(p.amount))
          countMap.set(p.categoryId, (countMap.get(p.categoryId) ?? 0) + 1)
        }
      }
    }

    const categories: CategorySummary[] = Array.from(categoryMap.entries())
      .map(([categoryId, total]) => ({
        categoryId: categoryId as Transaction['categoryId'],
        total,
        count: countMap.get(categoryId) ?? 0,
        percentage: totalExpenses > 0 ? (total / totalExpenses) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)

    return { totalIncome, totalExpenses, balance, categories }
  }, [transactions])
}
