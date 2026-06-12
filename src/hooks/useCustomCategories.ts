import { useState, useCallback } from 'react'
import type { Category } from '@/types'

const STORAGE_KEY = 'finants_custom_categories'

function load(): Category[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function save(cats: Category[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cats))
}

export function useCustomCategories() {
  const [customCategories, setCustomCategories] = useState<Category[]>(load)

  const addCustomCategory = useCallback((cat: Omit<Category, 'id'>) => {
    setCustomCategories(prev => {
      const next = [...prev, { ...cat, id: `custom_${crypto.randomUUID()}` }]
      save(next)
      return next
    })
  }, [])

  const updateCustomCategory = useCallback((id: string, patch: Partial<Omit<Category, 'id'>>) => {
    setCustomCategories(prev => {
      const next = prev.map(c => c.id === id ? { ...c, ...patch } : c)
      save(next)
      return next
    })
  }, [])

  const deleteCustomCategory = useCallback((id: string) => {
    setCustomCategories(prev => {
      const next = prev.filter(c => c.id !== id)
      save(next)
      return next
    })
  }, [])

  return { customCategories, addCustomCategory, updateCustomCategory, deleteCustomCategory }
}
