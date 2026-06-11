import { useState, useCallback } from 'react'
import type { Account } from '@/types'

const ACCOUNTS_KEY = 'finants_accounts'

export function loadAccounts(): Account[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY)
    return raw ? (JSON.parse(raw) as Account[]) : []
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
      const updated: Account[] = incoming.map(a => {
        const existing = prev.find(p => p.iban === a.iban)
        return { ...a, included: existing?.included ?? true }
      })
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

  return { accounts, setAccounts, toggleIncluded, totalWealth }
}
