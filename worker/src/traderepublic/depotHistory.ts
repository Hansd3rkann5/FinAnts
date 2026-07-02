// Reconstructs depot value over time from the buy/sell trades already stored
// in D1 (isin + signed share count per trade) combined with Yahoo Finance's
// historical daily closes — not a stored snapshot series, so there's no cold
// start: a position bought a year ago shows a year of history immediately,
// limited only by how far back the trade itself goes.

import { resolveInstrument, fetchHistoricalPrices, rangeForDays } from './marketdata'

export interface TradeRow {
  date: string  // yyyy-mm-dd
  isin: string
  shares: number  // signed: positive = bought, negative = sold
}

export interface DepotHistoryPoint {
  date: string
  value: number
}

export interface DepotHistoryResult {
  cumulative: DepotHistoryPoint[]
  perStock: { isin: string; name: string; points: DepotHistoryPoint[] }[]
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
  const cumulativeByDate = new Map<string, number>()

  for (const [isin, isinTrades] of byIsin) {
    const instrument = await resolveInstrument(isin, db)
    if (!instrument) continue
    const prices = await fetchHistoricalPrices(instrument.symbol, range)
    if (prices.length === 0) continue

    const points: DepotHistoryPoint[] = []
    let shares = 0
    let tradeIdx = 0
    for (const p of prices) {
      while (tradeIdx < isinTrades.length && isinTrades[tradeIdx].date <= p.date) {
        shares += isinTrades[tradeIdx].shares
        tradeIdx++
      }
      if (shares <= 0.000001) continue  // not held (yet, or anymore) on this date
      const value = Math.round(shares * p.close * 100) / 100
      points.push({ date: p.date, value })
      cumulativeByDate.set(p.date, (cumulativeByDate.get(p.date) ?? 0) + value)
    }
    if (points.length > 0) perStock.push({ isin, name: instrument.name, points })
  }

  const cumulative = [...cumulativeByDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }))

  return { cumulative, perStock }
}
