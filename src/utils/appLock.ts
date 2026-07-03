// Soft app lock: a Face ID / Touch ID (WebAuthn platform authenticator) gate on
// open, with a PIN fallback. This guards the UI only (the config lives in
// localStorage); the actual data is protected by the API key. It exists for
// privacy/convenience, not as hard security.

const KEY = 'finants_lock'

interface LockConfig {
  enabled: boolean
  credentialId?: string   // base64url of the WebAuthn credential, if biometrics registered
  pinHash: string
  salt: string
  pinLength: number       // digit count (not sensitive) so the lock screen can auto-submit
  lockTimeoutMin?: number // minutes the app may sit backgrounded before re-locking (default 1)
}

const DEFAULT_LOCK_TIMEOUT_MIN = 1

function load(): LockConfig | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as LockConfig) : null
  } catch {
    return null
  }
}

export function isLockEnabled(): boolean {
  return !!load()?.enabled
}

export function hasBiometric(): boolean {
  return !!load()?.credentialId
}

export function pinLength(): number {
  return load()?.pinLength ?? 0
}

export function lockTimeoutMinutes(): number {
  return load()?.lockTimeoutMin ?? DEFAULT_LOCK_TIMEOUT_MIN
}

export function setLockTimeoutMinutes(minutes: number): void {
  const c = load()
  if (!c) return
  localStorage.setItem(KEY, JSON.stringify({ ...c, lockTimeoutMin: minutes } satisfies LockConfig))
}

export function webauthnSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined'
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function randBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n))
}

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function hashPin(pin: string, salt: string): Promise<string> {
  return sha256hex(`${salt}:${pin}`)
}

function b64u(buf: ArrayBuffer): string {
  let s = ''
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64u(str: string): Uint8Array {
  const s = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : ''
  const bin = atob(s + pad)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

// ─── enable / disable ─────────────────────────────────────────────────────────

// Enable the lock with a PIN; optionally register a platform biometric. Returns
// whether biometric registration succeeded (PIN-only lock otherwise).
export async function enableLock(pin: string, withBiometric: boolean): Promise<{ biometric: boolean }> {
  const salt = crypto.randomUUID()
  const pinHash = await hashPin(pin, salt)
  let credentialId: string | undefined

  if (withBiometric && webauthnSupported()) {
    try {
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: randBytes(32),
          rp: { name: 'FinAnts', id: location.hostname },
          user: { id: randBytes(16), name: 'finants-user', displayName: 'FinAnts' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
          timeout: 60_000,
        },
      }) as PublicKeyCredential | null
      if (cred) credentialId = b64u(cred.rawId)
    } catch {
      /* registration declined/unsupported → fall back to PIN-only */
    }
  }

  localStorage.setItem(KEY, JSON.stringify({
    enabled: true, credentialId, pinHash, salt, pinLength: pin.length, lockTimeoutMin: DEFAULT_LOCK_TIMEOUT_MIN,
  } satisfies LockConfig))
  return { biometric: !!credentialId }
}

export function disableLock(): void {
  localStorage.removeItem(KEY)
}

// ─── verify ────────────────────────────────────────────────────────────────────

// Prompt Face ID / Touch ID. Soft check: a resolved assertion means the user
// passed biometric verification (no server-side signature verification).
export async function verifyBiometric(): Promise<boolean> {
  const c = load()
  if (!c?.credentialId || !webauthnSupported()) return false
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randBytes(32),
        allowCredentials: [{ type: 'public-key', id: fromB64u(c.credentialId) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    return !!assertion
  } catch {
    return false
  }
}

export async function verifyPin(pin: string): Promise<boolean> {
  const c = load()
  if (!c) return false
  return (await hashPin(pin, c.salt)) === c.pinHash
}

// ── Live lock state ─────────────────────────────────────────────────────────
// Tiny module-level store so components (charts) can defer their JS-driven
// entry animations while the LockScreen overlay is up — Recharts re-renders
// every animation frame on the main thread and starves the PIN keypad of
// input events. Purely behavioral: no layout or DOM structure involved.
let appLocked = false
const lockListeners = new Set<() => void>()

export function setAppLocked(locked: boolean) {
  if (appLocked === locked) return
  appLocked = locked
  lockListeners.forEach(l => l())
}

export function subscribeAppLocked(cb: () => void): () => void {
  lockListeners.add(cb)
  return () => { lockListeners.delete(cb) }
}

export function isAppLocked(): boolean {
  return appLocked
}
