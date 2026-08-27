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
  /** IBAN of the user's own account this booking belongs to (not the
   *  counterparty's IBAN, which lives in `iban`) — set for EnableBanking and
   *  CSV-imported rows, used to filter the dashboard/transactions by account. */
  accountIban?: string
  reference?: string
  categoryId: string
  merchantKey?: string
  isRecurring?: boolean
  recurringGroupId?: string
  isPending?: boolean
  customLabel?: string
  customIcon?: string  // emoji or data URL
  source?: string  // 'csv' | 'eb' | 'creditcard' | ... — which import path this came from
  /** Set on an itemized credit-card purchase: the id of the lump-sum Giro
   *  "Kreditkarte" booking it was billed under. Hidden from the main list and
   *  from chart totals (see isExcluded) — only reachable via its parent. */
  parentId?: string
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
  /** User-set logo: base64 data URL or remote URL. */
  customLogo?: string
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
