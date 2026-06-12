import { clsx } from 'clsx'
import { useAllCategories } from '@/hooks/useAllCategories'

interface Props {
  categoryId: string
  size?: 'sm' | 'md'
  showLabel?: boolean
  onClick?: () => void
}

export function CategoryBadge({ categoryId, size = 'md', showLabel = true, onClick }: Props) {
  const { allMap } = useAllCategories()
  const cat = allMap[categoryId]
  if (!cat) return null
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      data-component="category-badge"
      data-category-id={categoryId}
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
