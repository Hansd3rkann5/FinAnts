import { useState } from 'react'
import { CATEGORIES } from '@/data/categories'
import type { CategoryId } from '@/types'
import { getLogoUrl } from '@/utils/merchantLogos'

interface Props {
  merchantKey?: string
  categoryId: CategoryId
  size?: number
}

export function MerchantLogo({ merchantKey, categoryId, size = 40 }: Props) {
  const [error, setError] = useState(false)
  const cat = CATEGORIES[categoryId]

  if (merchantKey && !error) {
    return (
      <div
        className="shrink-0 rounded-card_sm overflow-hidden bg-white flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <img
          src={getLogoUrl(merchantKey)}
          alt=""
          className="object-contain"
          style={{ width: size - 8, height: size - 8 }}
          onError={() => setError(true)}
          loading="lazy"
        />
      </div>
    )
  }

  return (
    <div
      className="shrink-0 rounded-card_sm flex items-center justify-center text-lg"
      style={{
        width: size,
        height: size,
        backgroundColor: `${cat.color}18`,
        border: `1px solid ${cat.color}30`,
      }}
    >
      {cat.icon}
    </div>
  )
}
