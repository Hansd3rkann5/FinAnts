import {
  format, subMonths, startOfMonth, endOfMonth,
  startOfWeek, startOfYear,
  eachDayOfInterval, eachMonthOfInterval,
  startOfISOWeek, endOfISOWeek, getISOWeek, getISOWeekYear, addWeeks,
  min as dateMin,
} from 'date-fns'
import { de } from 'date-fns/locale'
import type { Transaction, TimeFilter } from '@/types'
import { isExcluded, EXCLUDE_CATEGORY_ID } from '@/data/categories'

// ── Shared types ──────────────────────────────────────────────────────────────

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

export interface AvailablePeriods {
  years: number[]
  months: { year: number; month: number }[]
  weeks: { year: number; week: number }[]
}

// ── Filter helpers ────────────────────────────────────────────────────────────

export function getFilterMode(f: TimeFilter): 'week' | 'month' | 'year' | 'all' {
  if (f === 'week' || f === 'month' || f === 'year' || f === 'all') return f
  return f.split('/')[0] as 'week' | 'month' | 'year'
}

function isoWeekStart(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4)
  return addWeeks(startOfISOWeek(jan4), week - 1)
}

export function getFilterDateRange(f: TimeFilter): { start: Date; end: Date } {
  const now = new Date()
  if (f === 'all')   return { start: new Date(0), end: now }
  if (f === 'week')  return { start: startOfWeek(now, { weekStartsOn: 1 }), end: now }
  if (f === 'month') return { start: startOfMonth(now), end: now }
  if (f === 'year')  return { start: startOfYear(now), end: now }

  const parts = f.split('/')
  if (parts[0] === 'year') {
    const yr = +parts[1]
    return { start: new Date(yr, 0, 1), end: dateMin([new Date(yr, 11, 31, 23, 59, 59, 999), now]) }
  }
  if (parts[0] === 'month') {
    const yr = +parts[1], mo = +parts[2] - 1
    const d = new Date(yr, mo, 1)
    return { start: d, end: dateMin([endOfMonth(d), now]) }
  }
  if (parts[0] === 'week') {
    const yr = +parts[1], wk = +parts[2]
    const start = isoWeekStart(yr, wk)
    return { start, end: dateMin([endOfISOWeek(start), now]) }
  }
  return { start: new Date(0), end: now }
}

export function filterByTimeFilter(txs: Transaction[], filter: TimeFilter): Transaction[] {
  const { start, end } = getFilterDateRange(filter)
  if (filter === 'all') return txs
  return txs.filter(t => t.date >= start && t.date <= end)
}


// ── Available period discovery ────────────────────────────────────────────────

export function computeAvailablePeriods(transactions: Transaction[]): AvailablePeriods {
  const yearSet = new Set<number>()
  const monthMap = new Map<string, { year: number; month: number }>()
  const weekMap  = new Map<string, { year: number; week: number }>()

  for (const t of transactions) {
    const yr = t.date.getFullYear()
    const mo = t.date.getMonth() + 1
    yearSet.add(yr)
    monthMap.set(`${yr}-${mo}`, { year: yr, month: mo })

    const isoYr = getISOWeekYear(t.date)
    const isoWk = getISOWeek(t.date)
    weekMap.set(`${isoYr}-${isoWk}`, { year: isoYr, week: isoWk })
  }

  return {
    years:  [...yearSet].sort(),
    months: [...monthMap.values()].sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month),
    weeks:  [...weekMap.values()].sort((a, b)  => a.year !== b.year ? a.year - b.year : a.week  - b.week),
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function booked(txs: Transaction[]) { return txs.filter(t => !t.isPending && !isExcluded(t)) }

// A transaction's category breakdown: its split parts (chart-only overlay) if
// any, else the whole amount under its single category. Used by every
// per-category aggregation so a split is attributed across both categories.
export function categoryPortions(tx: Transaction): { categoryId: string; amount: number }[] {
  return tx.splits && tx.splits.length ? tx.splits : [{ categoryId: tx.categoryId, amount: tx.amount }]
}

// ── MonthlyBarChart data ──────────────────────────────────────────────────────

export function computeMonthlyData(txs: Transaction[], filter: TimeFilter): MonthPoint[] {
  const b = booked(txs)
  const mode = getFilterMode(filter)
  const { end: filterEnd } = getFilterDateRange(filter)

  let months: Date[]
  if (mode === 'week') {
    months = eachMonthOfInterval({ start: startOfMonth(subMonths(filterEnd, 1)), end: filterEnd })
  } else if (mode === 'month') {
    months = eachMonthOfInterval({ start: startOfMonth(subMonths(filterEnd, 2)), end: filterEnd })
  } else {
    const { start: filterStart } = getFilterDateRange(filter)
    const rangeBooked = filter === 'all' ? b : b.filter(t => t.date >= filterStart && t.date <= filterEnd)
    const minDate = rangeBooked.length
      ? rangeBooked.reduce((a, t) => t.date < a ? t.date : a, rangeBooked[0].date)
      : filterStart
    months = eachMonthOfInterval({ start: startOfMonth(minDate), end: filterEnd }).slice(-36)
  }

  return months.map(d => {
    const start = startOfMonth(d)
    const end   = endOfMonth(d)
    const m = b.filter(t => t.date >= start && t.date <= end)
    const income   = m.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    const expenses = Math.abs(m.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0))
    return { month: format(d, 'MMM', { locale: de }), key: format(d, 'yyyy-MM'), income, expenses, balance: income - expenses }
  })
}

// ── SpendingAreaChart data ────────────────────────────────────────────────────

export function computeSpendingData(txs: Transaction[], filter: TimeFilter): SpendingPoint[] {
  const b = booked(txs)
  const mode = getFilterMode(filter)
  const { start: filterStart, end: filterEnd } = getFilterDateRange(filter)
  const result: SpendingPoint[] = []

  if (mode === 'week') {
    eachDayOfInterval({ start: filterStart, end: filterEnd }).forEach(day => {
      const inDay = b.filter(t => t.date.toDateString() === day.toDateString())
      result.push({
        label: format(day, 'EEE', { locale: de }),
        expenses: Math.abs(inDay.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)),
        income:   inDay.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
      })
    })
  } else if (mode === 'month') {
    eachDayOfInterval({ start: filterStart, end: filterEnd }).forEach(day => {
      const inDay = b.filter(t => t.date.toDateString() === day.toDateString())
      result.push({
        label: format(day, 'd'),
        expenses: Math.abs(inDay.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)),
        income:   inDay.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
      })
    })
  } else {
    // year / all → monthly granularity
    const rangeBooked = filter === 'all' ? b : b.filter(t => t.date >= filterStart && t.date <= filterEnd)
    if (!rangeBooked.length) return []
    const minDate = rangeBooked.reduce((a, t) => t.date < a ? t.date : a, rangeBooked[0].date)
    eachMonthOfInterval({ start: startOfMonth(minDate), end: filterEnd }).slice(-24).forEach(d => {
      const start = startOfMonth(d)
      const end   = endOfMonth(d)
      const m = rangeBooked.filter(t => t.date >= start && t.date <= end)
      result.push({
        label: format(d, 'yyyy-MM'),
        expenses: Math.abs(m.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)),
        income:   m.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
      })
    })
  }
  return result
}

// ── CategoryTrendChart data ───────────────────────────────────────────────────

export function computeCategoryTrends(
  txs: Transaction[],
  filter: TimeFilter,
): { points: CategoryTrendPoint[]; topCats: string[] } {
  const b = booked(txs)
  const mode = getFilterMode(filter)
  const { end: filterEnd } = getFilterDateRange(filter)
  const monthCount = mode === 'week' ? 2 : mode === 'month' ? 3 : mode === 'year' ? 6 : 12

  const catTotals = new Map<string, number>()
  for (const t of b) {
    for (const p of categoryPortions(t)) {
      if (p.amount < 0 && p.categoryId !== EXCLUDE_CATEGORY_ID) {
        catTotals.set(p.categoryId, (catTotals.get(p.categoryId) ?? 0) + Math.abs(p.amount))
      }
    }
  }
  const topCats = Array.from(catTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id]) => id)
    .filter(id => id !== 'income' && id !== 'transfer')

  const points: CategoryTrendPoint[] = Array.from({ length: monthCount }, (_, idx) => {
    const d = subMonths(filterEnd, monthCount - 1 - idx)
    const start = startOfMonth(d)
    const end   = endOfMonth(d)
    const m = b.filter(t => t.date >= start && t.date <= end && t.amount < 0)
    const point: CategoryTrendPoint = { month: format(d, 'MMM', { locale: de }), key: format(d, 'yyyy-MM') }
    for (const catId of topCats) {
      point[catId] = Math.abs(m.reduce((s, t) =>
        s + categoryPortions(t).reduce((ps, p) => p.categoryId === catId && p.amount < 0 ? ps + p.amount : ps, 0), 0))
    }
    return point
  })

  return { points, topCats }
}

// ── TopMerchantsBar data ──────────────────────────────────────────────────────

export function computeTopMerchants(txs: Transaction[], filter: TimeFilter, excluded?: Set<string>): TopMerchant[] {
  const b = booked(txs)
  const { start, end } = getFilterDateRange(filter)
  const rangeBooked = filter === 'all' ? b : b.filter(t => t.date >= start && t.date <= end)

  const map = new Map<string, { total: number; count: number; categoryId: string }>()
  for (const t of rangeBooked.filter(t => t.amount < 0)) {
    const key = (t.counterparty || t.description).trim()
    if (excluded?.has(key)) continue
    const prev = map.get(key) ?? { total: 0, count: 0, categoryId: t.categoryId }
    map.set(key, { total: prev.total + Math.abs(t.amount), count: prev.count + 1, categoryId: t.categoryId })
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
}

export interface MerchantBreakdownEntry {
  name: string
  total: number
  categoryId: string
  items: Transaction[]
}

// Every merchant with spending in range (not just the chart's top 8), for the
// "Alle anzeigen" sheet — lets the user drill into a merchant's transactions
// or exclude it from ever being considered a top merchant again.
export function computeMerchantBreakdown(txs: Transaction[], filter: TimeFilter): MerchantBreakdownEntry[] {
  const scoped = filterByTimeFilter(booked(txs), filter)
  const map = new Map<string, MerchantBreakdownEntry>()
  for (const t of scoped.filter(t => t.amount < 0)) {
    const key = (t.counterparty || t.description).trim()
    const entry = map.get(key) ?? { name: key, total: 0, categoryId: t.categoryId, items: [] }
    entry.total += Math.abs(t.amount)
    entry.items.push(t)
    map.set(key, entry)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}
