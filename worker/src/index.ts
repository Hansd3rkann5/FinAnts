import { syncAll, blzFromIban } from './fints'
import { ebStartAuth, ebExchangeAndSync, ebGetAspsps } from './enablebanking'

export interface Env {
  FINTS_BLZ?: string
  FINTS_USERNAME: string
  FINTS_PIN: string
  FINTS_IBAN?: string
  ALLOWED_ORIGIN: string
  ICONS: R2Bucket
  EB_APPLICATION_ID?: string
  EB_PRIVATE_KEY?: string
}

// ─── Cloudflare Access JWT validation ─────────────────────────────────────────

const CF_TEAM_DOMAIN = 'https://shrill-morning-3412.cloudflareaccess.com'
const CF_AUD         = 'ab7b540605742a2c199591d035e0f3cd'

let jwksCache: { keys: any[] } | null = null

async function getJwks(): Promise<{ keys: any[] }> {
  if (jwksCache) return jwksCache
  const res = await fetch(`${CF_TEAM_DOMAIN}/cdn-cgi/access/certs`)
  jwksCache = await res.json() as { keys: any[] }
  return jwksCache
}

async function getJwt(request: Request): Promise<string | null> {
  const header = request.headers.get('Cf-Access-Jwt-Assertion')
  if (header) return header
  const cookie = request.headers.get('Cookie') ?? ''
  const m = cookie.match(/CF_Authorization=([^;]+)/)
  return m ? m[1] : null
}

async function checkAuth(request: Request): Promise<boolean> {
  const jwt = await getJwt(request)
  if (!jwt) return false
  try {
    const parts = jwt.split('.')
    if (parts.length !== 3) return false

    const b64 = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'))
    const header  = JSON.parse(b64(parts[0]))
    const payload = JSON.parse(b64(parts[1]))

    console.log('[Auth] iss:', payload.iss, 'aud:', JSON.stringify(payload.aud), 'exp:', payload.exp, 'email:', payload.email, 'kid:', header.kid)

    if (payload.exp < Math.floor(Date.now() / 1000)) { console.log('[Auth] FAIL: expired'); return false }
    if (payload.iss !== CF_TEAM_DOMAIN) { console.log('[Auth] FAIL: wrong iss, expected', CF_TEAM_DOMAIN); return false }

    const jwks = await getJwks()
    const jwk  = jwks.keys.find((k: any) => k.kid === header.kid)
    if (!jwk) { console.log('[Auth] FAIL: kid not found in JWKS, available:', jwks.keys.map((k:any)=>k.kid)); return false }

    const key = await crypto.subtle.importKey(
      'jwk', jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } },
      false, ['verify'],
    )
    const sig  = Uint8Array.from(b64(parts[2]), c => c.charCodeAt(0))
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data)
    if (!ok) console.log('[Auth] FAIL: signature invalid')
    return ok
  } catch (e) {
    console.log('[Auth] FAIL: exception', String(e))
    return false
  }
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
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
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
      const jwt = await getJwt(request)
      if (!jwt || !await checkAuth(request)) {
        return jsonResponse({ error: 'Unauthorized' }, 401, cors)
      }
      try {
        const b64 = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'))
        const payload = JSON.parse(b64(jwt.split('.')[1]))
        return jsonResponse({ ok: true, email: payload.email ?? 'authenticated' }, 200, cors)
      } catch {
        return jsonResponse({ ok: true, email: 'authenticated' }, 200, cors)
      }
    }

    // ── Auth check ────────────────────────────────────────────────────────
    if (!await checkAuth(request)) {
      return jsonResponse({ error: 'Unauthorized' }, 401, cors)
    }

    // ── GET /auth — redirect to app after CF Access login ─────────────────
    if (request.method === 'GET' && path === '/auth') {
      const jwt = await getJwt(request)
      const base = 'https://hansd3rkann5.github.io/FinAnts/'
      const dest = jwt ? `${base}?cf_jwt=${encodeURIComponent(jwt)}#/settings` : `${base}#/settings`
      return new Response(null, { status: 302, headers: { Location: dest } })
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
        return jsonResponse(buildSuccessBody(result, fromDate, toDate), 200, cors)
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
        return jsonResponse(buildSuccessBody(result, fromDate, toDate), 200, cors)
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
