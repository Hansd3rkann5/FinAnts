import { useState, useCallback, useMemo } from 'react'

const STORAGE_KEY = 'finants_new_tx_ids'

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch { return [] }
}

// Purely local, never cloud-synced — just "what changed on this device since
// the last PSD2 pull", shown as a small marker on the affected TransactionCards.
export function useNewTransactionMarkers() {
  const [newIds, setNewIds] = useState<string[]>(load)

  // Each pull replaces the marked set with just that batch, so the markers
  // reflect "what's new since the last pull" rather than piling up forever.
  const markNew = useCallback((ids: string[]) => {
    setNewIds(ids)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)) } catch { /* best-effort */ }
  }, [])

  const newTransactionIds = useMemo(() => new Set(newIds), [newIds])

  return { newTransactionIds, markNew }
}
