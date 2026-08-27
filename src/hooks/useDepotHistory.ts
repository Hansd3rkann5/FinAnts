import { useState, useEffect, useCallback } from 'react'
import { fetchDepotHistory, type DepotHistoryResult } from '@/utils/depotHistory'
import { reportError } from '@/utils/notify'

export function useDepotHistory(days: number) {
  const [data, setData] = useState<DepotHistoryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchDepotHistory(days))
      setLastFetched(new Date())
    } catch (e) {
      reportError('Depot-Verlauf laden fehlgeschlagen', e)
      setError(e instanceof Error ? e.message : 'Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { refresh() }, [refresh])

  // Re-fetch when the user returns to the app (tab/window focus).
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  return { data, loading, error, lastFetched, refresh }
}
