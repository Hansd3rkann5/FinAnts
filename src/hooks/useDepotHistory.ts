import { useState, useEffect, useCallback } from 'react'
import { fetchDepotHistory, type DepotHistoryResult } from '@/utils/depotHistory'
import { reportError } from '@/utils/notify'

export function useDepotHistory(days: number) {
  const [data, setData] = useState<DepotHistoryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchDepotHistory(days))
    } catch (e) {
      reportError('Depot-Verlauf laden fehlgeschlagen', e)
      setError(e instanceof Error ? e.message : 'Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { refresh() }, [refresh])

  return { data, loading, error, refresh }
}
