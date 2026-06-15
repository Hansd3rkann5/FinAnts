import { syncAll, blzFromIban } from './fints'
import { ebStartAuth, ebExchangeAndSync, ebGetAspsps } from './enablebanking'
import {
  mergeTransactions, getTransactions, updateTransaction, clearTransactions, toStored,
  type MergeInput, type StoredTx,
} from './db'

export interface Env {
  FINTS_BLZ?: string
  FINTS_USERNAME: string
  FINTS_PIN: string
  FINTS_IBAN?: string
  ALLOWED_ORIGIN: string
  ICONS: R2Bucket
  DB?: D1Database
  EB_APPLICATION_ID?: string
  EB_PRIVATE_KEY?: string
  API_KEY?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://hansd3rkann5.github.io',
  'http://localhost:5173',
  'https://localhost:5173',
]

function corsHeaders(requestOrigin: string): Record<string, string> {
  const origin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
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

function resolveBlz(env: Env): string {
  if (env.FINTS_BLZ) return env.FINTS_BLZ
  if (env.FINTS_IBAN) return blzFromIban(env.FINTS_IBAN)
  throw new Error('FINTS_BLZ must be set as a Worker Secret')
}

function formatError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('9010') || msg.includes('9210')) return msg + ' (Falsche Zugangsdaten?)'
  if (msg.includes('9340')) return msg + ' (Konto gesperrt oder Limit erreicht)'
  if (msg.includes('9800')) return msg + ' (Bankserver vorübergehend nicht erreichbar)'
  return msg
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
      let body: { id?: string; categoryId?: string; customLabel?: string; customIcon?: string }
      try { body = await request.json() as typeof body } catch { return jsonResponse({ error: 'Ungültiger JSON-Body' }, 400, cors) }
      if (!body.id) return jsonResponse({ error: 'id fehlt' }, 400, cors)
      const patch: { categoryId?: string; customLabel?: string; customIcon?: string } = {}
      if ('categoryId' in body)  patch.categoryId  = body.categoryId
      if ('customLabel' in body) patch.customLabel = body.customLabel
      if ('customIcon' in body)  patch.customIcon  = body.customIcon
      await updateTransaction(env.DB, body.id, patch)
      return jsonResponse({ ok: true }, 200, cors)
    }

    // ── POST /transactions/clear — wipe the store ─────────────────────────
    if (request.method === 'POST' && path === '/transactions/clear') {
      if (!env.DB) return jsonResponse({ error: 'D1 not configured' }, 503, cors)
      await clearTransactions(env.DB)
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
    if (request.method === 'POST' && path === '/eb/sync') {
      if (!env.EB_APPLICATION_ID || !env.EB_PRIVATE_KEY) {
        return jsonResponse({ error: 'EnableBanking nicht konfiguriert' }, 503, cors)
      }
      let body: { code: string; days?: number }
      try { body = await request.json() as typeof body } catch { return jsonResponse({ error: 'Ungültiger JSON-Body' }, 400, cors) }

      const daysBack = Math.min(body.days ?? 90, 365)
      const toDate   = new Date()
      const fromDate = new Date(toDate.getTime() - daysBack * 86_400_000)

      try {
        const result = await ebExchangeAndSync(env.EB_APPLICATION_ID, env.EB_PRIVATE_KEY, body.code, fromDate, toDate)
        return jsonResponse(await buildSyncResponse(env, result, 'eb', fromDate, toDate), 200, cors)
      } catch (e) {
        return jsonResponse({ error: String(e) }, 502, cors)
      }
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

    let blz: string
    try {
      blz = resolveBlz(env)
    } catch (e) {
      return jsonResponse({ error: String(e) }, 400, cors)
    }

    const cfg = { blz, username: env.FINTS_USERNAME, pin: env.FINTS_PIN }

    // ── GET / or /sync ────────────────────────────────────────────────────
    const isSync = request.method === 'GET' && (path === '' || path.endsWith('/sync'))
    if (isSync) {
      const daysBack = Math.min(parseInt(url.searchParams.get('days') ?? '90'), 365)
      const toDate   = new Date()
      const fromDate = new Date(toDate.getTime() - daysBack * 86_400_000)

      try {
        const result = await syncAll(cfg, fromDate, toDate)
        if (result.challenge) {
          return jsonResponse({ challenge: result.challenge }, 202, cors)
        }
        return jsonResponse(await buildSyncResponse(env, result, 'fints', fromDate, toDate), 200, cors)
      } catch (e) {
        console.error('FinTS sync error:', e)
        return jsonResponse({ error: formatError(e) }, 502, cors)
      }
    }

    // ── POST /tan ─────────────────────────────────────────────────────────
    if (request.method === 'POST' && path.endsWith('/tan')) {
      let body: { tan: string; dialogId: string; secRef: number; secFun: string; days?: number }
      try {
        body = await request.json() as typeof body
      } catch {
        return jsonResponse({ error: 'Ungültiger JSON-Body' }, 400, cors)
      }

      const { tan, dialogId, secRef, secFun, days = 90 } = body
      if (!tan || !dialogId || !secRef || !secFun) {
        return jsonResponse({ error: 'Fehlende Felder: tan, dialogId, secRef, secFun' }, 400, cors)
      }

      const daysBack = Math.min(days, 365)
      const toDate   = new Date()
      const fromDate = new Date(toDate.getTime() - daysBack * 86_400_000)

      try {
        const result = await syncAll(cfg, fromDate, toDate, tan, dialogId, secRef, secFun)
        if (result.challenge) {
          return jsonResponse({ challenge: result.challenge }, 202, cors)
        }
        return jsonResponse(await buildSyncResponse(env, result, 'fints', fromDate, toDate), 200, cors)
      } catch (e) {
        console.error('FinTS TAN error:', e)
        return jsonResponse({ error: formatError(e) }, 502, cors)
      }
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
  if (env.DB) {
    const meta = await mergeTransactions(env.DB, result.transactions, source)
    added = meta.added
    total = meta.total
    transactions = await getTransactions(env.DB)
  } else {
    transactions = toStored(result.transactions, source)
    added = transactions.length
    total = transactions.length
  }
  return {
    accounts: result.accounts,
    transactions,
    meta: {
      accountCount: result.accounts.length,
      count: total,
      added,
      from: fromDate.toISOString().slice(0, 10),
      to: toDate.toISOString().slice(0, 10),
      fetchedAt: new Date().toISOString(),
    },
  }
}
