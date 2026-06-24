import { useState, useCallback } from 'react'
import type { Account } from '@/types'

// `null` = show everything (default). Selection is intentionally not persisted —
// stale IBANs after an account remap or re-sync would silently hide transactions.
export function useAccountView(accounts: Account[]) {
  const [selectedAccountIbans, setSelected] = useState<string[] | null>(null)

  const isAccountSelected = useCallback(
    (iban: string) => selectedAccountIbans === null || selectedAccountIbans.includes(iban),
    [selectedAccountIbans],
  )

  const toggleAccount = useCallback((iban: string) => {
    setSelected(prev => {
      const base = prev ?? accounts.map(a => a.iban)
      const next = base.includes(iban) ? base.filter(i => i !== iban) : [...base, iban]
      return next
    })
  }, [accounts])

  return { selectedAccountIbans, isAccountSelected, toggleAccount }
}
