import { createContext, useContext } from 'react'
import { useTransactions } from '@/hooks/useTransactions'
import { useMerchantProfiles } from '@/hooks/useMerchantProfiles'
import { useCustomCategories } from '@/hooks/useCustomCategories'

type TransactionsCtx =
  ReturnType<typeof useTransactions> &
  ReturnType<typeof useMerchantProfiles> &
  ReturnType<typeof useCustomCategories>

const Ctx = createContext<TransactionsCtx | null>(null)

export function TransactionsProvider({ children }: { children: React.ReactNode }) {
  const transactions = useTransactions()
  const profiles = useMerchantProfiles()
  const categories = useCustomCategories()
  return <Ctx.Provider value={{ ...transactions, ...profiles, ...categories }}>{children}</Ctx.Provider>
}

export function useTransactionsCtx() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTransactionsCtx must be used within TransactionsProvider')
  return ctx
}
