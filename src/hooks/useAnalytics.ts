import { useMemo } from 'react'
import type { Transaction } from '@/types'
import { computeMonthlyData } from '@/utils/chartCompute'

// Re-export types for backward compatibility with chart components
export type { MonthPoint, SpendingPoint, CategoryTrendPoint, TopMerchant } from '@/utils/chartCompute'

export interface AnalyticsSummary {
  avgMonthlyExpenses: number
  currentMonthSavingsRate: number | null
  lastMonthSavingsRate: number | null
  hasEnoughData: boolean
}

export function useAnalytics(transactions: Transaction[]): AnalyticsSummary {
  return useMemo(() => {
    const booked = transactions.filter(t => !t.isPending)
    const monthly = computeMonthlyData(transactions, 'year')
    const filledMonths = monthly.filter(m => m.expenses > 0 || m.income > 0)

    const avgMonthlyExpenses = filledMonths.length
      ? filledMonths.reduce((s, m) => s + m.expenses, 0) / filledMonths.length
      : 0

    const cm = monthly[monthly.length - 1]
    const pm = monthly[monthly.length - 2]
    const currentMonthSavingsRate = cm?.income > 0 ? Math.max(0, (cm.balance / cm.income) * 100) : null
    const lastMonthSavingsRate    = pm?.income > 0 ? Math.max(0, (pm.balance / pm.income) * 100) : null

    return {
      avgMonthlyExpenses,
      currentMonthSavingsRate,
      lastMonthSavingsRate,
      hasEnoughData: booked.length >= 3,
    }
  }, [transactions])
}
