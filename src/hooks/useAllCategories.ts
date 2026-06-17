import { useMemo } from 'react'
import { CATEGORIES, CATEGORY_LIST } from '@/data/categories'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import type { Category } from '@/types'

export function useAllCategories() {
  const { customCategories } = useTransactionsCtx()
  const allList: Category[] = useMemo(() => {
    const overriddenIds = new Set(customCategories.map(c => c.id))
    return [...CATEGORY_LIST.filter(c => !overriddenIds.has(c.id)), ...customCategories]
  }, [customCategories])
  const allMap: Record<string, Category> = useMemo(
    () => ({ ...CATEGORIES, ...Object.fromEntries(customCategories.map(c => [c.id, c])) }),
    [customCategories],
  )
  return { allList, allMap }
}
