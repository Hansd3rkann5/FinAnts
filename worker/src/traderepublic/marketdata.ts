// Public, no-API-key market data via Yahoo Finance's unofficial chart/search
// endpoints — deliberately NOT sourced from Trade Republic's own WebSocket
// API for this, since that's undocumented and already broke once this
// session (compactPortfolio → compactPortfolioByType). ISIN→ticker resolution
// and historical/current prices both come from Yahoo instead, independent of
// whether the user currently has an active (push-approved) TR session.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'

export interface ResolvedInstrument {
  symbol: string
  name: string
}

// Two cache layers: a module-level Map for repeat lookups within one isolate,
// and the D1 `instruments` table as the permanent store (resolutions basically
// never change), so Yahoo's search endpoint is hit at most once per ISIN ever.
const isinCache = new Map<string, ResolvedInstrument | null>()

export async function resolveInstrument(isin: string, db?: D1Database): Promise<ResolvedInstrument | null> {
  if (isinCache.has(isin)) return isinCache.get(isin) ?? null

  if (db) {
    const row = await db
      .prepare('SELECT symbol, name FROM instruments WHERE isin = ?')
      .bind(isin)
      .first<{ symbol: string; name: string }>()
      .catch(() => null)
    if (row) {
      isinCache.set(isin, row)
      return row
    }
  }

  const res = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}`, {
    headers: { 'user-agent': UA },
  })
  if (!res.ok) { isinCache.set(isin, null); return null }
  const data = await res.json() as { quotes?: { symbol?: string; shortname?: string; longname?: string }[] }
  const quote = data.quotes?.[0]
  const resolved = quote?.symbol ? { symbol: quote.symbol, name: quote.shortname ?? quote.longname ?? quote.symbol } : null
  isinCache.set(isin, resolved)

  if (resolved && db) {
    await db
      .prepare('INSERT OR REPLACE INTO instruments (isin, symbol, name, resolved_at) VALUES (?, ?, ?, ?)')
      .bind(isin, resolved.symbol, resolved.name, new Date().toISOString())
      .run()
      .catch(() => { /* cache write is best-effort */ })
  }
  return resolved
}

export interface PricePoint {
  date: string  // ISO yyyy-mm-dd
  close: number
}

interface YahooChartResponse {
  chart: {
    result?: [{
      meta: { regularMarketPrice?: number }
      timestamp?: number[]
      indicators: { quote: [{ close: (number | null)[] }] }
    }]
  }
}

// Yahoo's `range` param only accepts a fixed preset list — pick the smallest
// one that still covers `days` worth of history.
const RANGE_PRESETS: { days: number; range: string }[] = [
  { days: 5, range: '5d' }, { days: 30, range: '1mo' }, { days: 90, range: '3mo' },
  { days: 180, range: '6mo' }, { days: 365, range: '1y' }, { days: 730, range: '2y' },
  { days: 1825, range: '5y' }, { days: 3650, range: '10y' },
]
export function rangeForDays(days: number): string {
  return RANGE_PRESETS.find(p => days <= p.days)?.range ?? 'max'
}

// 1 h edge cache per ticker+range — the chart uses daily closes, so anything
// fresher than an hour is indistinguishable, and repeated dashboard loads
// stop hammering Yahoo. Cache API keys must be plausible request URLs on our
// own zone; the actual Yahoo URL goes in the fetch only.
export async function fetchHistoricalPrices(ticker: string, range: string): Promise<PricePoint[]> {
  const cache = (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches?.default
  const cacheKey = new Request(`https://finants-cache.internal/yahoo/${encodeURIComponent(ticker)}/${range}`)

  const cached = await cache?.match(cacheKey)
  if (cached) return cached.json() as Promise<PricePoint[]>

  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d`,
    { headers: { 'user-agent': UA } },
  )
  if (!res.ok) throw new Error(`Yahoo chart fetch failed for ${ticker}: HTTP ${res.status}`)
  const data = await res.json() as YahooChartResponse
  const result = data.chart.result?.[0]
  if (!result?.timestamp) return []
  const closes = result.indicators.quote[0].close
  const points: PricePoint[] = []
  for (let i = 0; i < result.timestamp.length; i++) {
    const close = closes[i]
    if (close === null || close === undefined) continue
    points.push({ date: new Date(result.timestamp[i] * 1000).toISOString().slice(0, 10), close })
  }

  await cache?.put(cacheKey, new Response(JSON.stringify(points), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  })).catch(() => { /* cache write is best-effort */ })

  return points
}

export async function fetchCurrentPrice(ticker: string): Promise<number | null> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`,
    { headers: { 'user-agent': UA } },
  )
  if (!res.ok) return null
  const data = await res.json() as YahooChartResponse
  return data.chart.result?.[0]?.meta.regularMarketPrice ?? null
}
