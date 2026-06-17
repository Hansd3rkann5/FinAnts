export type TransactionType = 'income' | 'expense' | 'transfer'

export type CategoryId =
  | 'groceries'
  | 'dining'
  | 'transport'
  | 'housing'
  | 'entertainment'
  | 'shopping'
  | 'health'
  | 'insurance'
  | 'subscriptions'
  | 'travel'
  | 'education'
  | 'savings'
  | 'fees'
  | 'income'
  | 'transfer'
  | 'other'

export interface Category {
  id: string
  label: string
  color: string
  icon: string
}

export interface Transaction {
  id: string
  date: Date
  amount: number
  type: TransactionType
  description: string
  counterparty: string
  iban?: string
  reference?: string
  categoryId: string
  merchantKey?: string
  isRecurring?: boolean
  recurringGroupId?: string
  isPending?: boolean
  customLabel?: string
  customIcon?: string  // emoji or data URL
  /** Chart-only overlay: split the amount across categories (signed, sums to `amount`).
   *  Stored in the R2 settings blob, never in the D1 transaction row. */
  splits?: { categoryId: string; amount: number }[]
}

export interface MerchantProfile {
  id: string
  matchStrings: string[]
  matchMode: 'exact' | 'contains'
  label?: string
  customIcon?: string
  /** Category applied to every transaction matching this pattern. */
  categoryId?: string
}

export interface Account {
  iban: string
  blz: string
  accountNumber: string
  owner: string
  description: string
  type: 'giro' | 'savings' | 'depot' | 'loan' | 'other'
  currency: string
  balance: number
  balanceDate: string
  /** Whether this account is counted toward Gesamtvermögen. */
  included: boolean
}

export interface RecurringGroup {
  id: string
  merchantKey: string
  counterparty: string
  approximateAmount: number
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  transactions: string[]
}

// Base modes = "current" period; encoded strings = specific past period
export type TimeFilter =
  | 'week' | 'month' | 'year' | 'all'
  | `year/${number}`
  | `month/${number}/${number}`   // month/year/month  e.g. 'month/2025/1'
  | `week/${number}/${number}`    // week/year/isoWeek e.g. 'week/2025/5'

export interface CategorySummary {
  categoryId: string
  total: number
  count: number
  percentage: number
}

export interface BalanceSummary {
  totalIncome: number
  totalExpenses: number
  balance: number
  categories: CategorySummary[]
}
