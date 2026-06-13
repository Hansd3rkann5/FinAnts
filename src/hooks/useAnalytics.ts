import { useMemo } from 'react'
import {
  format, subMonths,
  startOfMonth, endOfMonth,
  startOfWeek, startOfYear,
  eachDayOfInterval, eachMonthOfInterval,
} from 'date-fns'
import { de } from 'date-fns/locale'
import type { Transaction, TimeFilter } from '@/types'

export interface MonthPoint {
  month: string
  key: string
  income: number
  expenses: number
  balance: number
}

export interface SpendingPoint {
  label: string
  expenses: number
  income: number
}

export interface CategoryTrendPoint {
  month: string
  key: string
  [catId: string]: string | number
}

export interface TopMerchant {
  name: string
  total: number
  count: number
  categoryId: string
}

export interface AnalyticsData {
  monthlyData: MonthPoint[]
  spendingData: SpendingPoint[]
  categoryTrends: { points: CategoryTrendPoint[]; topCats: string[] }
  topMerchants: TopMerchant[]
  avgMonthlyExpenses: number
  currentMonthSavingsRate: number | null
  lastMonthSavingsRate: number | null
  hasEnoughData: boolean
}

export function useAnalytics(
  all: Transaction[],
  filtered: Transaction[],
  timeFilter: TimeFilter,
): AnalyticsData {
  return useMemo(() => {
    const booked = all.filter(t => !t.isPending)
    const bookedFiltered = filtered.filter(t => !t.isPending)
    const now = new Date()

    // ── Monthly overview (last 12 months) ────────────────────────────────
    const monthlyData: MonthPoint[] = []
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(now, i)
      const start = startOfMonth(d)
      const end = endOfMonth(d)
      const m = booked.filter(t => t.date >= start && t.date <= end)
      const income = m.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
      const expenses = Math.abs(m.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0))
      monthlyData.push({
        month: format(d, 'MMM', { locale: de }),
        key: format(d, 'yyyy-MM'),
        income,
        expenses,
        balance: income - expenses,
      })
    }

    // ── Spending points (adaptive granularity) ───────────────────────────
    let spendingData: SpendingPoint[] = []

    if (timeFilter === 'week') {
      const start = startOfWeek(now, { weekStartsOn: 1 })
      eachDayOfInterval({ start, end: now }).forEach(day => {
        const inDay = bookedFiltered.filter(t => t.date.toDateString() === day.toDateString())
        spendingData.push({
          label: format(day, 'EEE', { locale: de }),
          expenses: Math.abs(inDay.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)),
          income: inDay.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
        })
      })
    } else if (timeFilter === 'month') {
      const start = startOfMonth(now)
      eachDayOfInterval({ start, end: now }).forEach(day => {
        const inDay = bookedFiltered.filter(t => t.date.toDateString() === day.toDateString())
        spendingData.push({
          label: format(day, 'd', { locale: de }),
          expenses: Math.abs(inDay.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)),
          income: inDay.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
        })
      })
    } else {
      // year / all → group by month
      if (bookedFiltered.length > 0) {
        const minDate = bookedFiltered.reduce((a, t) => t.date < a ? t.date : a, bookedFiltered[0].date)
        const months = eachMonthOfInterval({ start: startOfMonth(minDate), end: now })
        const recent = months.slice(-24)
        recent.forEach(d => {
          const start = startOfMonth(d)
          const end = endOfMonth(d)
          const m = bookedFiltered.filter(t => t.date >= start && t.date <= end)
          spendingData.push({
            label: format(d, 'yyyy-MM'),  // ISO key — chart formats display
            expenses: Math.abs(m.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)),
            income: m.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
          })
        })
      }
    }

    // ── Category trends (last 6 months, top 4 expense cats) ──────────────
    const catTotals = new Map<string, number>()
    for (const t of booked.filter(t => t.amount < 0)) {
      catTotals.set(t.categoryId, (catTotals.get(t.categoryId) ?? 0) + Math.abs(t.amount))
    }
    const topCats = Array.from(catTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([id]) => id)
      .filter(id => id !== 'income' && id !== 'transfer')

    const trendPoints: CategoryTrendPoint[] = []
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i)
      const start = startOfMonth(d)
      const end = endOfMonth(d)
      const m = booked.filter(t => t.date >= start && t.date <= end && t.amount < 0)
      const point: CategoryTrendPoint = {
        month: format(d, 'MMM', { locale: de }),
        key: format(d, 'yyyy-MM'),
      }
      for (const catId of topCats) {
        point[catId] = Math.abs(m.filter(t => t.categoryId === catId).reduce((s, t) => s + t.amount, 0))
      }
      trendPoints.push(point)
    }

    // ── Top merchants (filtered period) ──────────────────────────────────
    const merchantMap = new Map<string, { total: number; count: number; categoryId: string }>()
    for (const t of bookedFiltered.filter(t => t.amount < 0)) {
      const key = (t.counterparty || t.description).trim()
      const prev = merchantMap.get(key) ?? { total: 0, count: 0, categoryId: t.categoryId }
      merchantMap.set(key, {
        total: prev.total + Math.abs(t.amount),
        count: prev.count + 1,
        categoryId: t.categoryId,
      })
    }
    const topMerchants: TopMerchant[] = Array.from(merchantMap.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)

    // ── Summary stats ─────────────────────────────────────────────────────
    const filledMonths = monthlyData.filter(m => m.expenses > 0)
    const avgMonthlyExpenses = filledMonths.length
      ? filledMonths.reduce((s, m) => s + m.expenses, 0) / filledMonths.length
      : 0

    const cm = monthlyData[11]
    const pm = monthlyData[10]
    const currentMonthSavingsRate = cm?.income > 0
      ? Math.max(0, (cm.balance / cm.income) * 100)
      : null
    const lastMonthSavingsRate = pm?.income > 0
      ? Math.max(0, (pm.balance / pm.income) * 100)
      : null

    const hasEnoughData = booked.length >= 3

    return {
      monthlyData,
      spendingData,
      categoryTrends: { points: trendPoints, topCats },
      topMerchants,
      avgMonthlyExpenses,
      currentMonthSavingsRate,
      lastMonthSavingsRate,
      hasEnoughData,
    }
  }, [all, filtered, timeFilter])
}
