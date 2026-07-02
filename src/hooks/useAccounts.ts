import { useState, useCallback } from 'react'
import type { Account } from '@/types'

const ACCOUNTS_KEY = 'finants_accounts'

// One entry per IBAN — duplicates crept in when EB returned a fresh UUID per
// sync and each got remapped to the same real IBAN. Last occurrence wins
// (newest sync data); `included` stays off if the user disabled any copy.
function dedupe(accounts: Account[]): Account[] {
  const byIban = new Map<string, Account>()
  for (const a of accounts) {
    const prev = byIban.get(a.iban)
    byIban.set(a.iban, { ...a, included: prev ? (prev.included && a.included) : a.included })
  }
  return [...byIban.values()]
}

export function loadAccounts(): Account[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY)
    return raw ? dedupe(JSON.parse(raw) as Account[]) : []
  } catch {
    return []
  }
}

function saveAccounts(accounts: Account[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
}

export function useAccounts() {
  const [accounts, setAccountsState] = useState<Account[]>(loadAccounts)

  const setAccounts = useCallback((incoming: Omit<Account, 'included'>[]) => {
    setAccountsState(prev => {
      const updated: Account[] = dedupe(incoming.map(a => {
        const existing = prev.find(p => p.iban === a.iban)
        return { ...a, included: existing?.included ?? true }
      }))
      saveAccounts(updated)
      return updated
    })
  }, [])

  // Cloud pull: replace local state with the synced list. `undefined` means
  // the blob predates account sync — keep local (never wipe on old backups).
  const applyCloudAccounts = useCallback((incoming: Account[] | undefined) => {
    if (!incoming) return
    setAccountsState(prev => {
      const updated = dedupe(incoming)
      if (JSON.stringify(updated) === JSON.stringify(prev)) return prev
      saveAccounts(updated)
      return updated
    })
  }, [])

  const remapAccountIban = useCallback((oldIban: string, newIban: string) => {
    setAccountsState(prev => {
      if (!prev.some(a => a.iban === oldIban)) return prev
      const isReal = /^[A-Z]{2}\d{2}/.test(newIban)
      const updated = dedupe(prev.map(a => a.iban === oldIban
        ? { ...a, iban: newIban, blz: isReal ? newIban.slice(4, 12) : a.blz, accountNumber: isReal ? newIban.slice(12) : a.accountNumber }
        : a))
      saveAccounts(updated)
      return updated
    })
  }, [])

  const upsertAccount = useCallback((account: Omit<Account, 'included'>) => {
    setAccountsState(prev => {
      const existing = prev.find(p => p.iban === account.iban)
      const updated = dedupe(existing
        ? prev.map(a => a.iban === account.iban ? { ...account, included: a.included } : a)
        : [...prev, { ...account, included: true }])
      saveAccounts(updated)
      return updated
    })
  }, [])

  const toggleIncluded = useCallback((iban: string) => {
    setAccountsState(prev => {
      const updated = prev.map(a =>
        a.iban === iban ? { ...a, included: !a.included } : a
      )
      saveAccounts(updated)
      return updated
    })
  }, [])

  const totalWealth = accounts
    .filter(a => a.included)
    .reduce((sum, a) => sum + a.balance, 0)

  return { accounts, setAccounts, upsertAccount, applyCloudAccounts, remapAccountIban, toggleIncluded, totalWealth }
}
