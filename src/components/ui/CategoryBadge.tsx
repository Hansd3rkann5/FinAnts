import type { CategoryId } from '@/types'
import { CATEGORIES } from '@/data/categories'
import { clsx } from 'clsx'

interface Props {
  categoryId: CategoryId
  size?: 'sm' | 'md'
  showLabel?: boolean
  onClick?: () => void
}

export function CategoryBadge({ categoryId, size = 'md', showLabel = true, onClick }: Props) {
  const cat = CATEGORIES[categoryId]
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-pill border font-medium transition-all duration-150',
        size === 'sm' && 'px-2 py-0.5 text-xs',
        size === 'md' && 'px-3 py-1 text-xs',
        onClick && 'hover:brightness-125 active:scale-95 cursor-pointer',
        !onClick && 'cursor-default',
      )}
      style={{
        backgroundColor: `${cat.color}18`,
        borderColor: `${cat.color}40`,
        color: cat.color,
      }}
    >
      <span>{cat.icon}</span>
      {showLabel && <span>{cat.label}</span>}
    </button>
  )
}
