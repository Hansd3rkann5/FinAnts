import { useState, useCallback, useEffect } from 'react'

const KEY = 'finants_manual_balance'
const SYNC_EVENT = 'finants:balance-updated'

interface ManualBalanceData {
  value: number
  savedAt: string
  updatedAt: string
}

function readFromStorage(): ManualBalanceData | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ManualBalanceData>
    if (!parsed.savedAt) parsed.savedAt = new Date(0).toISOString()
    return parsed as ManualBalanceData
  } catch { return null }
}

export function useManualBalance() {
  const [data, setData] = useState<ManualBalanceData | null>(readFromStorage)

  // Sync across all hook instances in the same tab (Settings ↔ Dashboard)
  useEffect(() => {
    function handler() { setData(readFromStorage()) }
    window.addEventListener(SYNC_EVENT, handler)
    return () => window.removeEventListener(SYNC_EVENT, handler)
  }, [])

  const save = useCallback((value: number) => {
    const now = new Date()
    const entry: ManualBalanceData = {
      value,
      savedAt: now.toISOString(),
      updatedAt: now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    }
    localStorage.setItem(KEY, JSON.stringify(entry))
    setData(entry)
    window.dispatchEvent(new Event(SYNC_EVENT))
  }, [])

  const clear = useCallback(() => {
    localStorage.removeItem(KEY)
    setData(null)
    window.dispatchEvent(new Event(SYNC_EVENT))
  }, [])

  return {
    baseBalance: data?.value ?? null,
    savedAt: data?.savedAt ?? null,
    updatedAt: data?.updatedAt ?? null,
    save,
    clear,
  }
}
