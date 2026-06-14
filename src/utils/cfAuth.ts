const KEY = 'finants_cf_jwt'

export function getCfJwt(): string | null {
  return localStorage.getItem(KEY)
}

export function setCfJwt(jwt: string): void {
  localStorage.setItem(KEY, jwt)
}

export function clearCfJwt(): void {
  localStorage.removeItem(KEY)
}

export function cfHeaders(extra?: Record<string, string>): Record<string, string> {
  const jwt = getCfJwt()
  return {
    'Content-Type': 'application/json',
    ...(jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {}),
    ...extra,
  }
}
