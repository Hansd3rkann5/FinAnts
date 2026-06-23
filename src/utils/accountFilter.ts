import type { Account, Transaction } from '@/types'

// Transactions without their own accountIban (older CSV imports predating
// this field, or rows the parser couldn't attribute) are counted under the
// main Girokonto rather than disappearing from every other account's view.
export function mainGiroIban(accounts: Account[]): string | undefined {
  return accounts.find(a => a.type === 'giro')?.iban
}

export function transactionAccountIban(t: Transaction, accounts: Account[]): string | undefined {
  return t.accountIban ?? mainGiroIban(accounts)
}

// `selected === null` means "no explicit selection yet" — show everything,
// unfiltered (the default, before the user has toggled anything).
export function filterTransactionsByAccounts(
  transactions: Transaction[],
  accounts: Account[],
  selected: string[] | null,
): Transaction[] {
  if (selected === null) return transactions
  const selectedSet = new Set(selected)
  return transactions.filter(t => {
    const iban = transactionAccountIban(t, accounts)
    return iban ? selectedSet.has(iban) : true
  })
}
