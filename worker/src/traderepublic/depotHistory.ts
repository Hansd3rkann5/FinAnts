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
  const cumulativeByDate = new Map<string, number>()

  for (const [isin, isinTrades] of byIsin) {
    const instrument = await resolveInstrument(isin, db)
    if (!instrument) continue
    const [prices, currentPrice] = await Promise.all([
      fetchHistoricalPrices(instrument.symbol, range),
      fetchCurrentPrice(instrument.symbol),
    ])

    // ── Historical chart ──────────────────────────────────────────────────────
    const points: DepotHistoryPoint[] = []
    let shares = 0
    let tradeIdx = 0
    for (const p of prices) {
      while (tradeIdx < isinTrades.length && isinTrades[tradeIdx].date <= p.date) {
        shares += isinTrades[tradeIdx].shares
        tradeIdx++
      }
      if (shares <= 0.000001) continue
      const value = Math.round(shares * p.close * 100) / 100
      points.push({ date: p.date, value })
      cumulativeByDate.set(p.date, (cumulativeByDate.get(p.date) ?? 0) + value)
    }
    if (points.length > 0) perStock.push({ isin, name: instrument.name, points })

    // ── Current position + P&L (average cost method) ─────────────────────────
    // Only include positions still held (netShares > 0) with a valid live price.
    if (currentPrice === null) continue
    let totalShares = 0
    let totalBuyShares = 0
    let totalBuyCost = 0  // sum of |amount| for buy orders
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
    positions.push({ isin, name: instrument.name, shares: Math.round(totalShares * 1000000) / 1000000, costBasis, currentValue, currentPrice, pnl, pnlPct })
  }

  const cumulative = [...cumulativeByDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }))

  // Sort positions by current value descending
  positions.sort((a, b) => b.currentValue - a.currentValue)

  return { cumulative, perStock, positions }
}
