import { fetchTransactions, blzFromIban, type RawTransaction } from './fints'

export interface Env {
  /** Commerzbank BLZ, e.g. "20041100".
   *  If FINTS_IBAN is set the BLZ will be derived from it automatically.
   *  Otherwise set this explicitly. */
  FINTS_BLZ?: string
  /** Commerzbank OnlineBanking username. */
  FINTS_USERNAME: string
  /** Commerzbank OnlineBanking PIN. */
  FINTS_PIN: string
  /** Optional: IBAN to fetch (e.g. "DE89200411001234567890").
   *  If omitted, the server returns data for the first account it finds. */
  FINTS_IBAN?: string
  /** A random secret string you choose. The app sends it as X-Api-Key. */
  API_KEY: string
  /** Allowed CORS origin, e.g. "https://yourname.github.io". Set to "*" for development. */
  ALLOWED_ORIGIN: string
}

// ─── CORS helper ─────────────────────────────────────────────────────────────

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key',
    'Access-Control-Max-Age': '86400',
  }
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

// ─── Worker entry ─────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = env.ALLOWED_ORIGIN ?? '*'
    const cors = corsHeaders(origin)

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, 405, cors)
    }

    // Auth check
    const apiKey = request.headers.get('X-Api-Key')
      ?? new URL(request.url).searchParams.get('key')

    if (!env.API_KEY || apiKey !== env.API_KEY) {
      return jsonResponse({ error: 'Unauthorized' }, 401, cors)
    }

    // Parse query params
    const { searchParams } = new URL(request.url)
    const daysBack = Math.min(parseInt(searchParams.get('days') ?? '90'), 365)
    const toDate = new Date()
    const fromDate = new Date(toDate.getTime() - daysBack * 86_400_000)

    // Resolve BLZ
    let blz: string
    try {
      blz = env.FINTS_IBAN
        ? blzFromIban(env.FINTS_IBAN)
        : (env.FINTS_BLZ ?? '')
      if (!blz) throw new Error('FINTS_BLZ or FINTS_IBAN must be set as a Worker Secret')
    } catch (e) {
      return jsonResponse({ error: String(e) }, 400, cors)
    }

    // Fetch from bank
    let transactions: RawTransaction[]
    try {
      transactions = await fetchTransactions(
        {
          blz,
          username: env.FINTS_USERNAME,
          pin: env.FINTS_PIN,
          iban: env.FINTS_IBAN,
        },
        fromDate,
        toDate,
      )
    } catch (e) {
      console.error('FinTS fetch error:', e)
      const msg = e instanceof Error ? e.message : String(e)

      // Provide helpful hints for common errors
      let hint = ''
      if (msg.includes('9010') || msg.includes('9210')) hint = ' (Falsche Zugangsdaten?)'
      else if (msg.includes('9340')) hint = ' (Konto gesperrt oder Limit erreicht)'
      else if (msg.includes('9800')) hint = ' (Bankserver vorübergehend nicht erreichbar)'

      return jsonResponse({ error: msg + hint }, 502, cors)
    }

    return jsonResponse(
      {
        transactions,
        meta: {
          count: transactions.length,
          from: fromDate.toISOString().slice(0, 10),
          to: toDate.toISOString().slice(0, 10),
          fetchedAt: new Date().toISOString(),
        },
      },
      200,
      cors,
    )
  },
}
