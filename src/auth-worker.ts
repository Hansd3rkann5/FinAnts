interface Env {
  ASSETS: Fetcher
  AUTH_PASSWORD: string
  AUTH_SECRET: string
}

const COOKIE_NAME = '__fa_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

// HMAC-SHA256 of a fixed message — unique per secret, cheap to verify.
async function makeToken(secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('finants-auth'))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function getCookieValue(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') ?? ''
  for (const part of header.split(';')) {
    const [k, v] = part.trim().split('=')
    if (k === name) return v ?? null
  }
  return null
}

function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}; Path=/`
}

function clearCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/`
}

function loginPage(error = false): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FinAnts</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #09090f;
      min-height: 100svh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 24px;
      padding: 40px 32px;
      width: 100%;
      max-width: 360px;
      margin: 20px;
    }
    .logo { font-size: 2rem; margin-bottom: 12px; }
    h1 { font-size: 1.2rem; font-weight: 700; margin-bottom: 4px; }
    .sub { color: rgba(255,255,255,0.3); font-size: 0.8rem; margin-bottom: 32px; }
    label {
      display: block;
      font-size: 0.68rem;
      color: rgba(255,255,255,0.3);
      text-transform: uppercase;
      letter-spacing: 0.07em;
      margin-bottom: 8px;
    }
    input[type=password] {
      width: 100%;
      background: rgba(255,255,255,0.05);
      border: 1px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'};
      border-radius: 12px;
      padding: 13px 16px;
      color: #fff;
      font-size: 0.95rem;
      outline: none;
      transition: border-color 0.2s;
      -webkit-appearance: none;
    }
    input[type=password]:focus { border-color: rgba(167,139,250,0.6); }
    button {
      width: 100%;
      margin-top: 14px;
      padding: 14px;
      background: rgba(139,92,246,0.75);
      border: none;
      border-radius: 12px;
      color: #fff;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    button:hover { background: rgba(139,92,246,0.95); }
    button:active { transform: scale(0.98); }
    .error {
      margin-top: 12px;
      padding: 10px 14px;
      background: rgba(239,68,68,0.1);
      border: 1px solid rgba(239,68,68,0.2);
      border-radius: 10px;
      font-size: 0.8rem;
      color: #f87171;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🐜</div>
    <h1>FinAnts</h1>
    <p class="sub">Persönliche Finanzübersicht</p>
    <form method="POST" action="/__auth/login">
      <label for="pw">Passwort</label>
      <input type="password" id="pw" name="password" autofocus autocomplete="current-password" placeholder="••••••••">
      <button type="submit">Anmelden</button>
      ${error ? '<p class="error">Falsches Passwort</p>' : ''}
    </form>
  </div>
</body>
</html>`
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const expectedToken = await makeToken(env.AUTH_SECRET)

    // ── Logout ───────────────────────────────────────────────────────────────
    if (url.pathname === '/__auth/logout') {
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/', 'Set-Cookie': clearCookie() },
      })
    }

    // ── Login POST ────────────────────────────────────────────────────────────
    if (url.pathname === '/__auth/login' && request.method === 'POST') {
      const form = await request.formData()
      const password = form.get('password')

      if (typeof password === 'string' && password === env.AUTH_PASSWORD) {
        return new Response(null, {
          status: 302,
          headers: {
            'Location': '/',
            'Set-Cookie': sessionCookie(expectedToken),
          },
        })
      }

      return new Response(loginPage(true), {
        status: 401,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    // ── Check session cookie ──────────────────────────────────────────────────
    const token = getCookieValue(request, COOKIE_NAME)
    if (!token || token !== expectedToken) {
      return new Response(loginPage(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    // ── Authenticated → serve static assets ──────────────────────────────────
    return env.ASSETS.fetch(request)
  },
}
