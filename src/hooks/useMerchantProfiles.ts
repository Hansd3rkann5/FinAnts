import { useState, useCallback } from 'react'
import type { MerchantProfile, Transaction } from '@/types'

const STORAGE_KEY = 'finants_merchant_profiles'

function load(): MerchantProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function save(profiles: MerchantProfile[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
}

export function resolveProfile(tx: Transaction, profiles: MerchantProfile[]): MerchantProfile | null {
  const text = `${tx.counterparty} ${tx.description}`.toLowerCase()
  const matches = profiles.filter(p => {
    const m = p.matchString.toLowerCase()
    return p.matchMode === 'exact'
      ? tx.counterparty.toLowerCase() === m
      : text.includes(m)
  })
  if (!matches.length) return null
  return matches.sort((a, b) => b.matchString.length - a.matchString.length)[0]
}

export function useMerchantProfiles() {
  const [merchantProfiles, setMerchantProfiles] = useState<MerchantProfile[]>(load)

  const upsertProfile = useCallback((
    matchString: string,
    matchMode: 'exact' | 'contains',
    patch: { label?: string; customIcon?: string },
  ) => {
    setMerchantProfiles(prev => {
      const existing = prev.find(
        p => p.matchString.toLowerCase() === matchString.toLowerCase() && p.matchMode === matchMode,
      )
      let next: MerchantProfile[]
      if (existing) {
        next = prev.map(p => p.id === existing.id ? { ...p, ...patch } : p)
      } else {
        next = [...prev, { id: crypto.randomUUID(), matchString, matchMode, ...patch }]
      }
      save(next)
      return next
    })
  }, [])

  const deleteProfile = useCallback((id: string) => {
    setMerchantProfiles(prev => {
      const next = prev.filter(p => p.id !== id)
      save(next)
      return next
    })
  }, [])

  return { merchantProfiles, upsertProfile, deleteProfile }
}
