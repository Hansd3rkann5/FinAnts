import { syncAll, blzFromIban } from './fints'

export interface Env {
  FINTS_BLZ?: string
  FINTS_USERNAME: string
  FINTS_PIN: string
  /** Optional fallback IBAN to derive BLZ from. */
  FINTS_IBAN?: string
  API_KEY: string
  ALLOWED_ORIGIN: string
  ICONS: R2Bucket
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
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

function checkAuth(request: Request, env: Env): boolean {
  const key = request.headers.get('X-Api-Key')
    ?? new URL(request.url).searchParams.get('key')
  return !!env.API_KEY && key === env.API_KEY
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
    const origin = env.ALLOWED_ORIGIN ?? '*'
    const cors = corsHeaders(origin)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    const url = new URL(request.url)
    const path = url.pathname.replace(/\/$/, '')

    // ── GET /icon/:key — public, no auth required ──────────────────────────
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

    if (!checkAuth(request, env)) {
      return jsonResponse({ error: 'Unauthorized' }, 401, cors)
    }

    // ── POST /upload-icon ──────────────────────────────────────────────────
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

    // ── GET /state ─────────────────────────────────────────────────────────
    if (request.method === 'GET' && path === '/state') {
      if (!env.ICONS) return jsonResponse({ error: 'R2 not configured' }, 503, cors)
      const obj = await env.ICONS.get('state/user.json')
      if (!obj) return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json', ...cors } })
      const h = new Headers(cors)
      h.set('Content-Type', 'application/json')
      return new Response(obj.body, { status: 200, headers: h })
    }

    // ── PUT /state ─────────────────────────────────────────────────────────
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

    // ── GET / or /sync ──────────────────────────────────────────────────────
    const isSync = request.method === 'GET' && (path === '' || path.endsWith('/sync'))
    if (isSync) {
      const daysBack = Math.min(parseInt(url.searchParams.get('days') ?? '90'), 365)
      const toDate = new Date()
      const fromDate = new Date(toDate.getTime() - daysBack * 86_400_000)

      try {
        const result = await syncAll(cfg, fromDate, toDate)
        if (result.challenge) {
          return jsonResponse({ challenge: result.challenge }, 202, cors)
        }
        return jsonResponse(buildSuccessBody(result, fromDate, toDate), 200, cors)
      } catch (e) {
        console.error('FinTS sync error:', e)
        return jsonResponse({ error: formatError(e) }, 502, cors)
      }
    }

    // ── POST /tan ───────────────────────────────────────────────────────────
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
      const toDate = new Date()
      const fromDate = new Date(toDate.getTime() - daysBack * 86_400_000)

      try {
        const result = await syncAll(cfg, fromDate, toDate, tan, dialogId, secRef, secFun)
        if (result.challenge) {
          return jsonResponse({ challenge: result.challenge }, 202, cors)
        }
        return jsonResponse(buildSuccessBody(result, fromDate, toDate), 200, cors)
      } catch (e) {
        console.error('FinTS TAN error:', e)
        return jsonResponse({ error: formatError(e) }, 502, cors)
      }
    }

    return jsonResponse({ error: 'Not found' }, 404, cors)
  },
}

function buildSuccessBody(
  result: { accounts: unknown[]; transactions: unknown[] },
  fromDate: Date,
  toDate: Date,
) {
  return {
    accounts: result.accounts,
    transactions: result.transactions,
    meta: {
      accountCount: result.accounts.length,
      count: result.transactions.length,
      from: fromDate.toISOString().slice(0, 10),
      to: toDate.toISOString().slice(0, 10),
      fetchedAt: new Date().toISOString(),
    },
  }
}
