import {
  ebStartAuth, ebExchangeCode, ebFetchData, ebGetAspsps, EbSessionExpiredError,
  type EbAccountResource,
} from './enablebanking'
import {
  mergeTransactions, getTransactions, updateTransaction, deleteTransaction, clearTransactions, toStored,
  insertError, getErrors, clearErrors, getTradeRows,
  saveEbSession, getEbSession, clearEbSession,
  type MergeInput, type StoredTx,
} from './db'
import { solveTradeRepublicWaf } from './traderepublic/waf'
import { startTrLogin, pollTrLogin, type TrLoginSession } from './traderepublic/auth'
import { fetchTradeRepublicTransactions } from './traderepublic/timeline'
import { fetchTradeRepublicPortfolioValue } from './traderepublic/portfolio'
import { computeDepotHistory } from './traderepublic/depotHistory'

export interface Env {
  ALLOWED_ORIGIN: string
  ICONS: R2Bucket
  DB?: D1Database
  EB_APPLICATION_ID?: string
  EB_PRIVATE_KEY?: string
  API_KEY?: string
  TR_PHONE_NO?: string
  TR_PIN?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://hansd3rkann5.github.io',
]

// Vite picks the next free port when 5173 is taken (5174, 5175, ...), so a
// fixed allowlist entry per port silently breaks every API call — with no
// useful error beyond a generic "NetworkError" — whenever a second dev
// server happens to be running. Any localhost/127.0.0.1 origin is only
// reachable from the developer's own machine anyway, so allow any port there.
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/

function corsHeaders(requestOrigin: string): Record<string, string> {
  const origin = ALLOWED_ORIGINS.includes(requestOrigin) || LOCALHOST_ORIGIN.test(requestOrigin)
    ? requestOrigin
    : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key',
    'Access-Control-Max-Age': '86400',
  }
}

function checkAuth(request: Request, env: Env): boolean {
  if (!env.API_KEY) return false
  return request.headers.get('X-Api-Key') === env.API_KEY
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
    const requestOrigin = request.headers.get('Origin') ?? ALLOWED_ORIGINS[0]
    const cors = corsHeaders(requestOrigin)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    const url  = new URL(request.url)
    const path = url.pathname.replace(/\/$/, '')

    // ── GET /icon/:key — public, no auth ──────────────────────────────────
    if (request.method === 'GET' && /^\/icon\/.+/.test(path)) {
      if (!env.ICONS) return new Response('R2 not configured', { status: 503, headers: cors })
      const key = decodeURIComponent(path.slice('/icon/'.length))
      const obj = await env.ICONS.get(key)
      if (!obj) return new Response('Not found', { status: 404, headers: cors })
      const h = new Headers(cors)
      h.set('Content-Type', obj.httpMetadata?.contentType ?? 'application/octet-stream')
      h.set('Cache-Control', 'public, max-age=31536000, immutable')
      return new Response(obj.body, { headers: h })
    }

    // ── GET /ping — auth check ────────────────────────────────────────────
    if (request.method === 'GET' && path === '/ping') {
      if (!checkAuth(request, env)) return jsonResponse({ error: 'Unauthorized' }, 401, cors)
      return jsonResponse({ ok: true }, 200, cors)
    }

    // ── Auth check ────────────────────────────────────────────────────────
    if (!checkAuth(request, env)) {
      return jsonResponse({ error: 'Unauthorized' }, 401, cors)
    }

    // ── GET /transactions — canonical store ───────────────────────────────
    if (request.method === 'GET' && path === '/transactions') {
      if (!env.DB) return jsonResponse({ error: 'D1 not configured' }, 503, cors)
      const transactions = await getTransactions(env.DB)
      return jsonResponse({ transactions }, 200, cors)
    }

    // ── POST /transactions/merge — dedup + insert delta ───────────────────
    if (request.method === 'POST' && path === '/transactions/merge') {
      if (!env.DB) return jsonResponse({ error: 'D1 not configured' }, 503, cors)
      let body: { transactions?: MergeInput[]; source?: string }
      try { body = await request.json() as typeof body } catch { return jsonResponse({ error: 'Ungültiger JSON-Body' }, 400, cors) }
      const meta = await mergeTransactions(env.DB, body.transactions ?? [], body.source ?? 'csv')
      const transactions = await getTransactions(env.DB)
      return jsonResponse({ transactions, meta }, 200, cors)
    }

    // ── POST /transactions/update — persist a per-tx edit ─────────────────
    if (request.method === 'POST' && path === '/transactions/update') {
      if (!env.DB) return jsonResponse({ error: 'D1 not configured' }, 503, cors)
      let body: { id?: string; categoryId?: string; customLabel?: string; customIcon?: string; parentId?: string }
      try { body = await request.json() as typeof body } catch { return jsonResponse({ error: 'Ungültiger JSON-Body' }, 400, cors) }
      if (!body.id) return jsonResponse({ error: 'id fehlt' }, 400, cors)
      const patch: { categoryId?: string; customLabel?: string; customIcon?: string; parentId?: string } = {}
      if ('categoryId' in body)  patch.categoryId  = body.categoryId
      if ('customLabel' in body) patch.customLabel = body.customLabel
      if ('customIcon' in body)  patch.customIcon  = body.customIcon
      if ('parentId' in body)    patch.parentId    = body.parentId
      await updateTransaction(env.DB, body.id, patch)
      return jsonResponse({ ok: true }, 200, cors)
    }

    // ── DELETE /transactions/:id — remove a single transaction ───────────
    if (request.method === 'DELETE' && path.startsWith('/transactions/')) {
      if (!env.DB) return jsonResponse({ error: 'D1 not configured' }, 503, cors)
      const id = path.slice('/transactions/'.length)
      if (!id) return jsonResponse({ error: 'id fehlt' }, 400, cors)
      await deleteTransaction(env.DB, id)
      return jsonResponse({ ok: true }, 200, cors)
    }

    // ── POST /transactions/clear — wipe the store ─────────────────────────
    if (request.method === 'POST' && path === '/transactions/clear') {
      if (!env.DB) return jsonResponse({ error: 'D1 not configured' }, 503, cors)
      await clearTransactions(env.DB)
      return jsonResponse({ ok: true }, 200, cors)
    }

    // ── POST /errors — append one entry to the global error log ──────────
    if (request.method === 'POST' && path === '/errors') {
      if (!env.DB) return jsonResponse({ error: 'D1 not configured' }, 503, cors)
      let body: { id?: string; time?: string; context?: string; message?: string; stack?: string; device?: string }
      try { body = await request.json() as typeof body } catch { return jsonResponse({ error: 'Ungültiger JSON-Body' }, 400, cors) }
      if (!body.id || !body.time || !body.context || !body.message) {
        return jsonResponse({ error: 'Fehlende Felder' }, 400, cors)
      }
      await insertError(env.DB, {
        id: body.id, time: body.time, context: body.context, message: body.message,
        stack: body.stack, device: body.device,
      })
      return jsonResponse({ ok: true }, 200, cors)
    }

    // ── GET /errors — list the global error log ───────────────────────────
    if (request.method === 'GET' && path === '/errors') {
      if (!env.DB) return jsonResponse({ error: 'D1 not configured' }, 503, cors)
      const errors = await getErrors(env.DB)
      return jsonResponse({ errors }, 200, cors)
    }

    // ── POST /errors/clear — wipe the global error log ────────────────────
    if (request.method === 'POST' && path === '/errors/clear') {
      if (!env.DB) return jsonResponse({ error: 'D1 not configured' }, 503, cors)
      await clearErrors(env.DB)
      return jsonResponse({ ok: true }, 200, cors)
    }

    // ── GET /eb/aspsps ────────────────────────────────────────────────────
    if (request.method === 'GET' && path === '/eb/aspsps') {
      if (!env.EB_APPLICATION_ID || !env.EB_PRIVATE_KEY) {
        return jsonResponse({ error: 'EnableBanking nicht konfiguriert' }, 503, cors)
      }
      const country = url.searchParams.get('country') ?? 'DE'
      const search  = url.searchParams.get('search') ?? undefined
      try {
        const data = await ebGetAspsps(env.EB_APPLICATION_ID, env.EB_PRIVATE_KEY, country, search)
        return jsonResponse(data, 200, cors)
      } catch (e) {
        return jsonResponse({ error: String(e) }, 502, cors)
      }
    }

    // ── POST /eb/start ────────────────────────────────────────────────────
    if (request.method === 'POST' && path === '/eb/start') {
      if (!env.EB_APPLICATION_ID || !env.EB_PRIVATE_KEY) {
        return jsonResponse({ error: 'EnableBanking nicht konfiguriert (EB_APPLICATION_ID, EB_PRIVATE_KEY)' }, 503, cors)
      }
      let body: { redirect_url: string; aspsp_name?: string; aspsp_country?: string }
      try { body = await request.json() as typeof body } catch { return jsonResponse({ error: 'Ungültiger JSON-Body' }, 400, cors) }

      try {
        const result = await ebStartAuth(env.EB_APPLICATION_ID, env.EB_PRIVATE_KEY, body.redirect_url, body.aspsp_name ?? 'Commerzbank', body.aspsp_country ?? 'DE')
        return jsonResponse(result, 200, cors)
      } catch (e) {
        return jsonResponse({ error: String(e) }, 502, cors)
      }
    }

    // ── POST /eb/sync ─────────────────────────────────────────────────────
    // With `code`: exchange the fresh authorization for a session, persist it,
    // then fetch. Without `code`: reuse the stored session — no TAN needed —
    // and answer { needsAuth: true } when there is none or it stopped working.
    if (request.method === 'POST' && path === '/eb/sync') {
      if (!env.EB_APPLICATION_ID || !env.EB_PRIVATE_KEY) {
        return jsonResponse({ error: 'EnableBanking nicht konfiguriert' }, 503, cors)
      }
      let body: { code?: string; days?: number }
      try { body = await request.json() as typeof body } catch { return jsonResponse({ error: 'Ungültiger JSON-Body' }, 400, cors) }

      const daysBack = Math.min(body.days ?? 90, 365)
      const toDate   = new Date()
      const fromDate = new Date(toDate.getTime() - daysBack * 86_400_000)

      try {
        let ebAccounts: EbAccountResource[]
        if (body.code) {
          const session = await ebExchangeCode(env.EB_APPLICATION_ID, env.EB_PRIVATE_KEY, body.code)
          ebAccounts = session.accounts
          if (env.DB) {
            await saveEbSession(env.DB, {
              sessionId: session.sessionId,
              accountsJson: JSON.stringify(session.accounts),
              validUntil: session.validUntil ?? new Date(Date.now() + 180 * 86_400_000).toISOString(),
            })
          }
        } else {
          const stored = env.DB ? await getEbSession(env.DB) : null
          if (!stored || new Date(stored.valid_until).getTime() <= Date.now()) {
            if (stored && env.DB) await clearEbSession(env.DB)
            return jsonResponse({ error: 'Keine gültige Bank-Session', needsAuth: true }, 401, cors)
          }
          ebAccounts = JSON.parse(stored.accounts) as EbAccountResource[]
        }

        const result = await ebFetchData(env.EB_APPLICATION_ID, env.EB_PRIVATE_KEY, ebAccounts, fromDate, toDate)

        // EB sometimes returns a UUID as the account "IBAN" when the bank doesn't
        // expose it via PSD2. Patch any UUID accounts by looking up the real
        // account_iban from previously stored transactions (e.g. CSV imports).
        if (env.DB) {
          const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-/i
          for (const acct of result.accounts as { iban: string; blz: string; accountNumber: string }[]) {
            if (!uuidRe.test(acct.iban)) continue
            const row = await env.DB
              .prepare(`SELECT account_iban FROM transactions
                        WHERE account_iban IS NOT NULL AND account_iban NOT LIKE '________-____-%'
                        GROUP BY account_iban ORDER BY COUNT(*) DESC LIMIT 1`)
              .first<{ account_iban: string }>()
            if (!row?.account_iban) continue
            const real = row.account_iban
            // Patch transactions in the result that reference the UUID
            for (const t of result.transactions) {
              if ((t as { accountIban?: string }).accountIban === acct.iban)
                (t as { accountIban?: string }).accountIban = real
            }
            acct.blz = real.slice(4, 12)
            acct.accountNumber = real.slice(12)
            acct.iban = real
          }
        }

        return jsonResponse(await buildSyncResponse(env, result, 'eb', fromDate, toDate), 200, cors)
      } catch (e) {
        if (e instanceof EbSessionExpiredError) {
          if (env.DB) await clearEbSession(env.DB)
          return jsonResponse({ error: 'Bank-Session abgelaufen', needsAuth: true }, 401, cors)
        }
        return jsonResponse({ error: String(e) }, 502, cors)
      }
    }

    // ── POST /tr/login/start — solve WAF challenge, submit phone+PIN, trigger
    // the TR mobile-app push notification. Returns an opaque session object
    // the frontend round-trips to /tr/login/poll (Workers have no implicit
    // cookie jar across requests). Phone/PIN come from wrangler secrets
    // (TR_PHONE_NO/TR_PIN) when set — same trust model as API_KEY/
    // EB_PRIVATE_KEY — falling back to the request body otherwise, so the
    // Settings UI doesn't need to ask for them on every sync. ─────────────
    if (request.method === 'POST' && path === '/tr/login/start') {
      let body: { phoneNo?: string; pin?: string } = {}
      try { body = await request.json() as typeof body } catch { /* empty body is fine when using secrets */ }
      const phoneNo = env.TR_PHONE_NO ?? body.phoneNo
      const pin = env.TR_PIN ?? body.pin
      if (!phoneNo || !pin) return jsonResponse({ error: 'phoneNo und pin erforderlich (oder TR_PHONE_NO/TR_PIN als Secret setzen)' }, 400, cors)

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('WAF-Lösung/Login Timeout (>25 s) — bitte erneut versuchen')), 25_000)
      )
      try {
        const session = await Promise.race([
          (async () => {
            const wafToken = await solveTradeRepublicWaf()
            return startTrLogin(phoneNo, pin, wafToken)
          })(),
          timeout,
        ])
        return jsonResponse({ session }, 200, cors)
      } catch (e) {
        return jsonResponse({ error: String(e) }, 502, cors)
      }
    }

    // ── POST /tr/login/poll — call repeatedly until the push is approved ──
    if (request.method === 'POST' && path === '/tr/login/poll') {
      let body: { session?: TrLoginSession }
      try { body = await request.json() as typeof body } catch { return jsonResponse({ error: 'Ungültiger JSON-Body' }, 400, cors) }
      if (!body.session) return jsonResponse({ error: 'session erforderlich' }, 400, cors)

      try {
        const result = await pollTrLogin(body.session)
        return jsonResponse(result, 200, cors)
      } catch (e) {
        return jsonResponse({ error: String(e) }, 502, cors)
      }
    }

    // ── POST /tr/sync — fetch the timeline over WebSocket using an approved
    // session, map events to transactions, merge into D1, and separately
    // fetch the *live* portfolio value (cash + current market value of
    // holdings) — never derived from summing transaction amounts, since that
    // would just be net cash flow and drift away from reality the moment a
    // holding's price moves. Must match src/utils/tradeRepublicParser.ts's
    // TRADE_REPUBLIC_IBAN exactly.
    if (request.method === 'POST' && path === '/tr/sync') {
      if (!env.DB) return jsonResponse({ error: 'D1 not configured' }, 503, cors)
      let body: { session?: TrLoginSession }
      try { body = await request.json() as typeof body } catch { return jsonResponse({ error: 'Ungültiger JSON-Body' }, 400, cors) }
      if (!body.session?.cookies?.length) return jsonResponse({ error: 'session erforderlich (aus dem Login-Schritt)' }, 400, cors)

      const TRADE_REPUBLIC_IBAN = 'DE62100123454047536911'
      try {
        const [events, portfolioValue] = await Promise.all([
          fetchTradeRepublicTransactions(body.session.cookies),
          fetchTradeRepublicPortfolioValue(body.session, env.DB).catch(e => {
            // Don't fail the whole sync if the valuation step breaks —
            // transactions are still worth importing either way.
            console.error('TR portfolio valuation failed:', e)
            return null
          }),
        ])
        const rows: MergeInput[] = events.map(e => ({
          date: e.date,
          amount: e.amount,
          description: e.description,
          counterparty: e.counterparty,
          reference: e.reference,
          categoryId: e.categoryId,
          accountIban: TRADE_REPUBLIC_IBAN,
          isin: e.isin,
          shares: e.shares,
        }))
        const meta = await mergeTransactions(env.DB, rows, 'traderepublic')
        const transactions = await getTransactions(env.DB)
        return jsonResponse({ transactions, meta, portfolioValue }, 200, cors)
      } catch (e) {
        return jsonResponse({ error: String(e) }, 502, cors)
      }
    }

    // ── GET /tr/depot-history?days=180 — depot value over time, reconstructed
    // from stored buy/sell trades (isin + signed shares) combined with Yahoo
    // Finance historical prices. No TR session needed — purely from D1 +
    // public market data, so it works any time, not just right after a sync.
    if (request.method === 'GET' && path === '/tr/depot-history') {
      if (!env.DB) return jsonResponse({ error: 'D1 not configured' }, 503, cors)
      const days = Math.max(1, Number(url.searchParams.get('days')) || 180)
      try {
        const trades = await getTradeRows(env.DB)
        const history = await computeDepotHistory(trades, days, env.DB)
        return jsonResponse(history, 200, cors)
      } catch (e) {
        return jsonResponse({ error: String(e) }, 502, cors)
      }
    }

    // ── POST /tr/instruments/clear — wipe the ISIN→ticker cache so the next
    // depot-history call re-resolves from Yahoo (useful after a bad cache entry
    // caused wrong portfolio valuation, e.g. XF000ETH0019 → wrong ticker).
    if (request.method === 'POST' && path === '/tr/instruments/clear') {
      if (!env.DB) return jsonResponse({ error: 'D1 not configured' }, 503, cors)
      await env.DB.prepare('DELETE FROM instruments').run().catch(() => { /* ignore */ })
      return jsonResponse({ ok: true }, 200, cors)
    }

    // ── POST /upload-icon ─────────────────────────────────────────────────
    if (request.method === 'POST' && path.endsWith('/upload-icon')) {
      if (!env.ICONS) return jsonResponse({ error: 'R2 not configured' }, 503, cors)
      const contentType = request.headers.get('Content-Type') ?? 'image/webp'
      const ext = contentType.split('/')[1]?.split(';')[0] ?? 'webp'
      const body = await request.arrayBuffer()
      if (body.byteLength > 2 * 1024 * 1024) {
        return jsonResponse({ error: 'Image too large (max 2 MB)' }, 413, cors)
      }
      const key = `${crypto.randomUUID()}.${ext}`
      await env.ICONS.put(key, body, { httpMetadata: { contentType } })
      const iconUrl = new URL(`/icon/${key}`, url.origin).toString()
      return jsonResponse({ url: iconUrl, key }, 200, cors)
    }

    // ── GET /state ────────────────────────────────────────────────────────
    if (request.method === 'GET' && path === '/state') {
      if (!env.ICONS) return jsonResponse({ error: 'R2 not configured' }, 503, cors)
      const obj = await env.ICONS.get('state/user.json')
      if (!obj) return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json', ...cors } })
      const h = new Headers(cors)
      h.set('Content-Type', 'application/json')
      return new Response(obj.body, { status: 200, headers: h })
    }

    // ── PUT /state ────────────────────────────────────────────────────────
    if (request.method === 'PUT' && path === '/state') {
      if (!env.ICONS) return jsonResponse({ error: 'R2 not configured' }, 503, cors)
      const body = await request.text()
      if (body.length > 20 * 1024 * 1024) return jsonResponse({ error: 'State too large (max 20 MB)' }, 413, cors)
      await env.ICONS.put('state/user.json', body, { httpMetadata: { contentType: 'application/json' } })
      return jsonResponse({ ok: true }, 200, cors)
    }

    return jsonResponse({ error: 'Not found' }, 404, cors)
  },
}

// Merge freshly fetched bank transactions into the canonical D1 store and
// return the full deduped set. Without a DB binding it degrades to returning
// just this batch (mapped to the canonical shape) so the app still renders.
async function buildSyncResponse(
  env: Env,
  result: { accounts: unknown[]; transactions: MergeInput[] },
  source: string,
  fromDate: Date,
  toDate: Date,
) {
  let transactions: StoredTx[]
  let added: number
  let total: number
  let newlyAddedIds: string[]
  if (env.DB) {
    const meta = await mergeTransactions(env.DB, result.transactions, source)
    added = meta.added
    total = meta.total
    newlyAddedIds = meta.newlyAddedIds
    transactions = await getTransactions(env.DB)
  } else {
    transactions = toStored(result.transactions, source)
    added = transactions.length
    total = transactions.length
    newlyAddedIds = transactions.map(t => t.id)
  }
  return {
    accounts: result.accounts,
    transactions,
    meta: {
      accountCount: result.accounts.length,
      count: total,
      added,
      newlyAddedIds,
      from: fromDate.toISOString().slice(0, 10),
      to: toDate.toISOString().slice(0, 10),
      fetchedAt: new Date().toISOString(),
    },
  }
}
