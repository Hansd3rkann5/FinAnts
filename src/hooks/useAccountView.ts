import { useState, useCallback } from 'react'
import type { Account } from '@/types'

const STORAGE_KEY = 'finants_account_view'

// `null` = no explicit selection yet → every account counts (the default,
// matching today's "show everything" behavior before this feature existed).
function load(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : null
  } catch {
    return null
  }
}

function persist(ibans: string[] | null) {
  try {
    if (ibans === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(ibans))
  } catch {
    /* best-effort — this is just a view preference, never critical data */
  }
}

// Which accounts the Dashboard/Transactions overview currently displays —
// independent of Account.included (that one only governs Gesamtvermögen).
export function useAccountView(accounts: Account[]) {
  const [selectedAccountIbans, setSelected] = useState<string[] | null>(load)

  const isAccountSelected = useCallback(
    (iban: string) => selectedAccountIbans === null || selectedAccountIbans.includes(iban),
    [selectedAccountIbans],
  )

  const toggleAccount = useCallback((iban: string) => {
    setSelected(prev => {
      // First toggle ever: start from "everything selected" so toggling one
      // account off reads as "deselect this one", not "select only this one".
      const base = prev ?? accounts.map(a => a.iban)
      const next = base.includes(iban) ? base.filter(i => i !== iban) : [...base, iban]
      persist(next)
      return next
    })
  }, [accounts])

  return { selectedAccountIbans, isAccountSelected, toggleAccount }
}
