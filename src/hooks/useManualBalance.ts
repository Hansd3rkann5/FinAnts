import { useState, useCallback } from 'react'

const KEY = 'finants_manual_balance'

interface ManualBalanceData {
  value: number
  updatedAt: string
}

export function useManualBalance() {
  const [data, setData] = useState<ManualBalanceData | null>(() => {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? (JSON.parse(raw) as ManualBalanceData) : null
    } catch { return null }
  })

  const save = useCallback((value: number) => {
    const entry: ManualBalanceData = {
      value,
      updatedAt: new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    }
    localStorage.setItem(KEY, JSON.stringify(entry))
    setData(entry)
  }, [])

  const clear = useCallback(() => {
    localStorage.removeItem(KEY)
    setData(null)
  }, [])

  return { balance: data?.value ?? null, updatedAt: data?.updatedAt ?? null, save, clear }
}
