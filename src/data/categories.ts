import type { Category, CategoryId } from '@/types'

export const CATEGORIES: Record<string, Category> = {
  groceries:     { id: 'groceries',     label: 'Lebensmittel',   color: '#22c55e', icon: '🛒' },
  dining:        { id: 'dining',        label: 'Restaurants',    color: '#f97316', icon: '🍽️' },
  transport:     { id: 'transport',     label: 'Mobilität',      color: '#3b82f6', icon: '🚗' },
  housing:       { id: 'housing',       label: 'Wohnen',         color: '#8b5cf6', icon: '🏠' },
  entertainment: { id: 'entertainment', label: 'Freizeit',       color: '#ec4899', icon: '🎮' },
  shopping:      { id: 'shopping',      label: 'Shopping',       color: '#f59e0b', icon: '🛍️' },
  health:        { id: 'health',        label: 'Gesundheit',     color: '#10b981', icon: '💊' },
  insurance:     { id: 'insurance',     label: 'Versicherungen', color: '#6366f1', icon: '🛡️' },
  subscriptions: { id: 'subscriptions', label: 'Abonnements',    color: '#a855f7', icon: '📱' },
  travel:        { id: 'travel',        label: 'Reisen',         color: '#06b6d4', icon: '✈️' },
  education:     { id: 'education',     label: 'Bildung',        color: '#84cc16', icon: '📚' },
  savings:       { id: 'savings',       label: 'Sparen',         color: '#14b8a6', icon: '💰' },
  income:        { id: 'income',        label: 'Einnahmen',      color: '#4ade80', icon: '💵' },
  transfer:      { id: 'transfer',      label: 'Überweisungen',  color: '#94a3b8', icon: '↔️' },
  other:         { id: 'other',         label: 'Sonstiges',      color: '#6b7280', icon: '📋' },
}

export const CATEGORY_LIST = Object.values(CATEGORIES)
