import { useState, useCallback } from 'react'
import type { MerchantProfile, Transaction } from '@/types'
import { reportError } from '@/utils/notify'

const STORAGE_KEY = 'finants_merchant_profiles'

type StoredProfile = MerchantProfile & { matchString?: string }

function load(): MerchantProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const profiles = JSON.parse(raw) as StoredProfile[]
    // migrate old single-string entries
    return profiles.map(p => {
      if (!p.matchStrings && p.matchString) {
        const { matchString, ...rest } = p
        return { ...rest, matchStrings: [matchString] }
      }
      return p as MerchantProfile
    })
  } catch { return [] }
}

function persist(profiles: MerchantProfile[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
  } catch (e) {
    // localStorage is only a cache (profiles also live in the cloud blob);
    // never let a quota error crash the app.
    reportError('Speicher voll', e)
  }
}

export function resolveProfile(tx: Transaction, profiles: MerchantProfile[]): MerchantProfile | null {
  const text = `${tx.counterparty} ${tx.description}`.toLowerCase()
  const matches = profiles.filter(p =>
    p.matchStrings.some(ms => {
      const m = ms.toLowerCase()
      return p.matchMode === 'exact'
        ? tx.counterparty.toLowerCase() === m
        : text.includes(m)
    })
  )
  if (!matches.length) return null
  // prefer the profile with the most strings (more specific)
  return matches.sort((a, b) => b.matchStrings.length - a.matchStrings.length)[0]
}

export function useMerchantProfiles() {
  const [merchantProfiles, setMerchantProfiles] = useState<MerchantProfile[]>(load)

  const upsertProfile = useCallback((
    profileId: string | null,
    matchStrings: string[],
    matchMode: 'exact' | 'contains',
    patch: { label?: string; customIcon?: string; categoryId?: string },
  ) => {
    setMerchantProfiles(prev => {
      let next: MerchantProfile[]
      if (profileId) {
        next = prev.map(p =>
          p.id === profileId ? { ...p, matchStrings, matchMode, ...patch } : p
        )
      } else {
        next = [...prev, { id: crypto.randomUUID(), matchStrings, matchMode, ...patch }]
      }
      persist(next)
      return next
    })
  }, [])

  const deleteProfile = useCallback((id: string) => {
    setMerchantProfiles(prev => {
      const next = prev.filter(p => p.id !== id)
      persist(next)
      return next
    })
  }, [])

  const applyCloudProfiles = useCallback((profiles: MerchantProfile[]) => {
    setMerchantProfiles(profiles)
    persist(profiles)
  }, [])

  return { merchantProfiles, upsertProfile, deleteProfile, applyCloudProfiles }
}
