import { useState, useCallback } from 'react'
import { reportError } from '@/utils/notify'

const STORAGE_KEY = 'finants_excluded_merchants'

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch { return [] }
}

function persist(names: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(names))
  } catch (e) {
    reportError('Speicher voll', e)
  }
}

export function useExcludedMerchants() {
  const [excludedMerchants, setExcludedMerchants] = useState<string[]>(load)

  const excludeMerchant = useCallback((name: string) => {
    setExcludedMerchants(prev => {
      if (prev.includes(name)) return prev
      const next = [...prev, name]
      persist(next)
      return next
    })
  }, [])

  const applyCloudExcludedMerchants = useCallback((names: string[]) => {
    setExcludedMerchants(names)
    persist(names)
  }, [])

  return { excludedMerchants, excludeMerchant, applyCloudExcludedMerchants }
}
