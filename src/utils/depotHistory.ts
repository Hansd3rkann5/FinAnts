import { cfHeaders } from './cfAuth'
import { cloudWorkerUrl } from './cloudSync'

export interface DepotHistoryPoint {
  date: string
  value: number
}

export interface DepotStockHistory {
  isin: string
  name: string
  points: DepotHistoryPoint[]
}

export interface DepotHistoryResult {
  cumulative: DepotHistoryPoint[]
  perStock: DepotStockHistory[]
}

// Reconstructed depot value over time — see worker/src/traderepublic/depotHistory.ts.
// `days` picks the lookback window; the worker fetches enough Yahoo history to
// cover both that and however long each position has actually been held.
export async function fetchDepotHistory(days: number): Promise<DepotHistoryResult> {
  const res = await fetch(`${cloudWorkerUrl()}/tr/depot-history?days=${days}`, {
    credentials: 'include',
    headers: cfHeaders(),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<DepotHistoryResult>
}
