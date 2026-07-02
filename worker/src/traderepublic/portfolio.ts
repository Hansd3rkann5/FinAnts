// Live depot valuation — cash balance + current market value of held
// positions (shares × live price), NOT a sum of historical transaction
// amounts (that would just be net cash flow, which drifts away from reality
// the moment a holding's price moves). Ported from pytr's portfolio.py, with
// one deliberate deviation: current price comes from Yahoo Finance
// (marketdata.ts), not Trade Republic's own `instrument`/`ticker` WebSocket
// subscriptions — those are exactly the kind of undocumented, dynamic TR
// endpoint that already broke once this session (compactPortfolio →
// compactPortfolioByType), and live pricing has a perfectly good public
// alternative that doesn't depend on TR's internal API shape at all.

import { TR_HOST, authHeaders } from './auth'
import { connectTrWebSocket } from './timeline'
import { resolveInstrument, fetchCurrentPrice } from './marketdata'

interface TrSession {
  deviceId: string
  wafToken: string
  cookies: string[]
}

async function fetchSecAccNo(session: TrSession): Promise<string> {
  const res = await fetch(`${TR_HOST}/api/v2/auth/account`, {
    headers: authHeaders(session.wafToken, session.deviceId, session.cookies),
  })
  if (!res.ok) throw new Error(`TR account settings failed: HTTP ${res.status}`)
  const data = await res.json() as { securitiesAccountNumber?: string }
  if (!data.securitiesAccountNumber) throw new Error('securitiesAccountNumber missing from account settings')
  return data.securitiesAccountNumber
}

interface CompactPosition {
  instrumentId?: string  // legacy field name
  isin?: string          // current field name (post compactPortfolioByType)
  netSize: string
}

interface CompactPortfolioByType {
  categories?: { positions?: CompactPosition[] }[]
}

// Trade Republic retired `compactPortfolio` in favor of `compactPortfolioByType`
// in June 2026 (same fix pytr-org/pytr#362 applied) — positions are now nested
// under categories[].positions instead of a flat top-level array, and the ISIN
// field was renamed from `instrumentId` to `isin`. Flatten + normalize so the
// rest of this function doesn't need to care which shape it got.
function flattenPositions(res: CompactPortfolioByType): { isin: string; netSize: string }[] {
  const out: { isin: string; netSize: string }[] = []
  for (const cat of res.categories ?? []) {
    for (const pos of cat.positions ?? []) {
      const isin = pos.isin ?? pos.instrumentId
      if (isin) out.push({ isin, netSize: pos.netSize })
    }
  }
  return out
}

export async function fetchTradeRepublicPortfolioValue(session: TrSession, db?: D1Database): Promise<number> {
  const secAccNo = await fetchSecAccNo(session)
  const socket = await connectTrWebSocket(session.cookies)
  try {
    const [portfolioRes, cashRes] = await Promise.all([
      socket.subscribeOnce({ type: 'compactPortfolioByType', secAccNo }) as Promise<CompactPortfolioByType>,
      socket.subscribeOnce({ type: 'cash' }) as Promise<{ amount: number; currencyId: string }[]>,
    ])

    const cash = (cashRes ?? []).reduce((sum, c) => sum + (c.amount ?? 0), 0)
    const positions = flattenPositions(portfolioRes)

    const values = await Promise.all(positions.map(async pos => {
      const instrument = await resolveInstrument(pos.isin, db)
      if (!instrument) return 0
      const price = await fetchCurrentPrice(instrument.symbol)
      if (price === null) return 0
      return price * parseFloat(pos.netSize)
    }))

    const holdingsValue = values.reduce((sum, v) => sum + v, 0)
    return Math.round((cash + holdingsValue) * 100) / 100
  } finally {
    socket.close()
  }
}
