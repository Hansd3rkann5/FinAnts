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
  | 'income'
  | 'transfer'
  | 'other'

export interface Category {
  id: CategoryId
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
  categoryId: CategoryId
  merchantKey?: string
  isRecurring?: boolean
  recurringGroupId?: string
  isPending?: boolean
  customLabel?: string
  customIcon?: string  // emoji or data URL
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

export type TimeFilter = 'week' | 'month' | 'year' | 'all'

export interface CategorySummary {
  categoryId: CategoryId
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
