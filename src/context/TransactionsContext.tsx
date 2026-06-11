import { createContext, useContext } from 'react'
import { useTransactions } from '@/hooks/useTransactions'

type TransactionsCtx = ReturnType<typeof useTransactions>

const Ctx = createContext<TransactionsCtx | null>(null)

export function TransactionsProvider({ children }: { children: React.ReactNode }) {
  const value = useTransactions()
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTransactionsCtx() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTransactionsCtx must be used within TransactionsProvider')
  return ctx
}
