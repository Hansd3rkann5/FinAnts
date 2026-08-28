const CONFIG_KEY = 'finants_site_pin'
const SESSION_KEY = 'finants_site_unlocked'

interface SitePinConfig {
  pinHash: string
  salt: string
  pinLength: number
}

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function hashPin(pin: string, salt: string): Promise<string> {
  return sha256hex(`${salt}:${pin}`)
}

function load(): SitePinConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? (JSON.parse(raw) as SitePinConfig) : null
  } catch { return null }
}

export function isSitePinEnabled(): boolean { return !!load() }
export function sitePinLength(): number { return load()?.pinLength ?? 4 }

export async function enableSitePin(pin: string): Promise<void> {
  const salt = crypto.randomUUID()
  const pinHash = await hashPin(pin, salt)
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ pinHash, salt, pinLength: pin.length } satisfies SitePinConfig))
}

export function disableSitePin(): void {
  localStorage.removeItem(CONFIG_KEY)
  sessionStorage.removeItem(SESSION_KEY)
}

export async function verifySitePin(pin: string): Promise<boolean> {
  const c = load()
  if (!c) return false
  return (await hashPin(pin, c.salt)) === c.pinHash
}

// Unlocked state lives in sessionStorage — survives page refreshes within the
// same tab/session but resets when the browser or tab is closed.
export function isSitePinUnlocked(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === '1'
}

export function markSitePinUnlocked(): void {
  sessionStorage.setItem(SESSION_KEY, '1')
}
