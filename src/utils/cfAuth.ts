const KEY = 'finants_api_key'

export function getApiKey(): string | null {
  return localStorage.getItem(KEY)
}

export function setApiKey(key: string): void {
  localStorage.setItem(KEY, key)
}

export function clearApiKey(): void {
  localStorage.removeItem(KEY)
}

export function cfHeaders(extra?: Record<string, string>): Record<string, string> {
  const apiKey = getApiKey()
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { 'X-Api-Key': apiKey } : {}),
    ...extra,
  }
}
