// Reconstructs depot value over time from the buy/sell trades already stored
// in D1 (isin + signed share count per trade) combined with Yahoo Finance's
// historical daily closes — not a stored snapshot series, so there's no cold
// start: a position bought a year ago shows a year of history immediately,
// limited only by how far back the trade itself goes.

import { resolveInstrument, fetchHistoricalPrices, fetchCurrentPrice, rangeForDays } from './marketdata'

export interface TradeRow {
  date: string  // yyyy-mm-dd
  isin: string
  shares: number  // signed: positive = bought, negative = sold
  amount: number  // signed EUR transaction amount (negative = money out = buy)
  description: string  // TR's own instrument name (e.g. "Semiconductor USD (Acc)")
}

export interface DepotHistoryPoint {
  date: string
  value: number
}

export interface DepotPosition {
  isin: string
  name: string
  shares: number        // current quantity held
  costBasis: number     // total EUR invested (average cost method)
  currentValue: number  // shares × current market price
  currentPrice: number
  pnl: number           // currentValue - costBasis
  pnlPct: number        // pnl / costBasis × 100
}

export interface DepotHistoryResult {
  cumulative: DepotHistoryPoint[]
  perStock: { isin: string; name: string; points: DepotHistoryPoint[] }[]
  positions: DepotPosition[]
}

export async function computeDepotHistory(trades: TradeRow[], days: number, db?: D1Database): Promise<DepotHistoryResult> {
  const byIsin = new Map<string, TradeRow[]>()
  for (const t of trades) {
    const arr = byIsin.get(t.isin) ?? []
    arr.push(t)
    byIsin.set(t.isin, arr)
  }
  for (const arr of byIsin.values()) arr.sort((a, b) => a.date.localeCompare(b.date))

  const range = rangeForDays(days)
  const perStock: DepotHistoryResult['perStock'] = []
  const positions: DepotPosition[] = []

  // Per-ISIN value series: date → portfolio value for that position on that day.
  // Used to build cumulative with carry-forward (different exchanges have
  // different holiday calendars, so summing only dates with prices causes
  // oscillation in the total when any one position is temporarily missing).
  interface IsinSeries {
    valueByDate: Map<string, number>
    lastPriceDate: string | null  // last date with a valid price while held
    openAtEnd: boolean            // position still held after last price in range
  }
  const isinSeries = new Map<string, IsinSeries>()

  for (const [isin, isinTrades] of byIsin) {
    const instrument = await resolveInstrument(isin, db)
    if (!instrument) continue
    const name = isinTrades.find(t => t.description)?.description || instrument.name
    const [prices, currentPrice] = await Promise.all([
      fetchHistoricalPrices(instrument.symbol, range),
      fetchCurrentPrice(instrument.symbol),
    ])

    // ── Historical chart ──────────────────────────────────────────────────────
    const valueByDate = new Map<string, number>()
    let shares = 0
    let tradeIdx = 0
    let lastPriceDate: string | null = null

    for (const p of prices) {
      while (tradeIdx < isinTrades.length && isinTrades[tradeIdx].date <= p.date) {
        shares += isinTrades[tradeIdx].shares
        tradeIdx++
      }
      if (shares <= 0.000001) continue
      const value = Math.round(shares * p.close * 100) / 100
      valueByDate.set(p.date, value)
      lastPriceDate = p.date
    }

    if (valueByDate.size > 0) {
      const points = [...valueByDate.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, value]) => ({ date, value }))
      perStock.push({ isin, name, points })
      isinSeries.set(isin, { valueByDate, lastPriceDate, openAtEnd: shares > 0.000001 })
    }

    // ── Current position + P&L (average cost method) ─────────────────────────
    if (currentPrice === null) continue
    let totalShares = 0
    let totalBuyShares = 0
    let totalBuyCost = 0
    for (const t of isinTrades) {
      totalShares += t.shares
      if (t.shares > 0) {
        totalBuyShares += t.shares
        totalBuyCost += Math.abs(t.amount)
      }
    }
    if (totalShares <= 0.000001) continue
    const avgCostPerShare = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0
    const costBasis = Math.round(avgCostPerShare * totalShares * 100) / 100
    const currentValue = Math.round(totalShares * currentPrice * 100) / 100
    const pnl = Math.round((currentValue - costBasis) * 100) / 100
    const pnlPct = costBasis > 0 ? Math.round((pnl / costBasis) * 10000) / 100 : 0
    positions.push({ isin, name, shares: Math.round(totalShares * 1000000) / 1000000, costBasis, currentValue, currentPrice, pnl, pnlPct })
  }

  // ── Cumulative with carry-forward ─────────────────────────────────────────
  // Collect every date any position has a price for, then iterate in order.
  // For each date, use the position's price for that day; if there's no price
  // (stock exchange was closed), carry forward the last known value — but only
  // while the position is still held (don't resurrect a sold position).
  const allDates = new Set<string>()
  for (const { valueByDate } of isinSeries.values()) {
    for (const date of valueByDate.keys()) allDates.add(date)
  }
  const sortedDates = [...allDates].sort()

  const lastKnown = new Map<string, number>()
  const cumulative: DepotHistoryPoint[] = []

  for (const date of sortedDates) {
    let total = 0
    let anyHeld = false

    for (const [isin, series] of isinSeries) {
      if (series.valueByDate.has(date)) {
        const v = series.valueByDate.get(date)!
        lastKnown.set(isin, v)
        total += v
        anyHeld = true
      } else if (lastKnown.has(isin)) {
        // Carry forward if position is still open, or if we're filling a gap
        // within the held period (holiday on this exchange, not a sell).
        const stillInRange = series.openAtEnd || (series.lastPriceDate !== null && date <= series.lastPriceDate)
        if (stillInRange) {
          total += lastKnown.get(isin)!
          anyHeld = true
        }
      }
    }

    if (anyHeld) cumulative.push({ date, value: Math.round(total * 100) / 100 })
  }

  positions.sort((a, b) => b.currentValue - a.currentValue)
  return { cumulative, perStock, positions }
}
