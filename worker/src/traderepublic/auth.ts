// v2 web-login (push-approval via the TR mobile app, no SMS code) — ported
// from pytr's api.py. Workers' fetch() has no implicit cookie jar, so cookies
// are captured from Set-Cookie response headers and round-tripped explicitly
// (the frontend stores them between the start/poll calls, same pattern as
// EnableBanking's pending-session handling).

export const TR_HOST = 'https://api.traderepublic.com'
const TR_LOGIN_PATH = '/api/v2/auth/web/login'
// Captured from app.traderepublic.com on 2026-06-23. Bump if TR rejects with
// a version-mismatch error.
const TR_APP_VERSION = '15.7.0'
const TR_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'

function deviceInfoHeader(deviceId: string): string {
  const payload = {
    stableDeviceId: deviceId,
    model: 'Apple Macintosh',
    browser: 'Chrome',
    browserVersion: '148.0.0.0',
    os: 'Mac OS',
    osVersion: '10.15.7',
    timezone: 'Europe/Amsterdam',
    timezoneOffset: -120,
    screen: '1800x1169x30',
    preferredLanguages: ['en', 'en-US'],
    numberOfCores: 12,
    deviceMemory: 16,
  }
  return btoa(JSON.stringify(payload))
}

export function authHeaders(wafToken: string, deviceId: string, cookies: string[]): HeadersInit {
  const h: Record<string, string> = {
    'User-Agent': TR_USER_AGENT,
    Origin: 'https://app.traderepublic.com',
    Referer: 'https://app.traderepublic.com/',
    'x-tr-platform': 'web',
    'x-tr-app-version': TR_APP_VERSION,
    'x-tr-device-info': deviceInfoHeader(deviceId),
    'x-aws-waf-token': wafToken,
  }
  if (cookies.length) h.Cookie = cookies.join('; ')
  return h
}

// Cloudflare Workers' Headers implements getSetCookie() (modern Fetch spec);
// fall back to a single get() for any runtime that doesn't, splitting on the
// pattern that separates concatenated Set-Cookie values.
function extractSetCookies(headers: Headers): string[] {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie
  const raw = getSetCookie ? getSetCookie.call(headers) : (headers.get('set-cookie')?.split(/,(?=\s*\w+=)/) ?? [])
  return raw.map(c => c.split(';')[0].trim()).filter(Boolean)
}

function mergeCookies(existing: string[], incoming: string[]): string[] {
  const map = new Map(existing.map(c => [c.split('=')[0], c]))
  for (const c of incoming) map.set(c.split('=')[0], c)
  return [...map.values()]
}

export interface TrLoginSession {
  deviceId: string
  wafToken: string
  cookies: string[]
  processId: string
}

export async function startTrLogin(phoneNo: string, pin: string, wafToken: string): Promise<TrLoginSession> {
  const deviceId = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const res = await fetch(`${TR_HOST}${TR_LOGIN_PATH}`, {
    method: 'POST',
    headers: { ...authHeaders(wafToken, deviceId, []), 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: phoneNo, pin }),
  })
  const cookies = extractSetCookies(res.headers)
  const body = await res.json().catch(() => ({})) as { processId?: string; errors?: unknown }
  if (!res.ok || !body.processId) {
    throw new Error(body.errors ? JSON.stringify(body.errors) : `Login failed: HTTP ${res.status}`)
  }
  return { deviceId, wafToken, cookies, processId: body.processId }
}

export type TrLoginPollResult =
  | { status: 'pending' }
  | { status: 'approved'; cookies: string[] }
  | { status: 'rejected'; reason: string }

export async function pollTrLogin(session: TrLoginSession): Promise<TrLoginPollResult> {
  const res = await fetch(`${TR_HOST}${TR_LOGIN_PATH}/processes/${session.processId}`, {
    headers: authHeaders(session.wafToken, session.deviceId, session.cookies),
  })
  const newCookies = extractSetCookies(res.headers)
  const merged = mergeCookies(session.cookies, newCookies)

  if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 410) {
    return { status: 'rejected', reason: `HTTP ${res.status}` }
  }
  if (!res.ok) return { status: 'pending' }

  const body = await res.json().catch(() => ({})) as { state?: string; status?: string }
  const state = (body.state ?? body.status ?? '').toUpperCase()
  if (['APPROVED', 'COMPLETED', 'SUCCESS', 'OK', 'DONE'].includes(state)) {
    return { status: 'approved', cookies: merged }
  }
  if (['REJECTED', 'DECLINED', 'FAILED', 'EXPIRED'].includes(state)) {
    return { status: 'rejected', reason: state }
  }
  // No recognizable state field, but a session cookie showed up anyway — TR's
  // process-status payload shape isn't publicly documented, so treat the
  // presence of tr_session as the authoritative "done" signal either way.
  if (merged.some(c => c.startsWith('tr_session='))) {
    return { status: 'approved', cookies: merged }
  }
  return { status: 'pending' }
}
