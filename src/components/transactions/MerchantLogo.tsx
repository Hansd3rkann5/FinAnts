import { useState } from 'react'
import { CATEGORIES } from '@/data/categories'
import type { CategoryId } from '@/types'
import { getLogoUrl } from '@/utils/merchantLogos'

interface Props {
  merchantKey?: string
  categoryId: CategoryId
  customIcon?: string
  size?: number
}

export function MerchantLogo({ merchantKey, categoryId, customIcon, size = 40 }: Props) {
  const [error, setError] = useState(false)
  const cat = CATEGORIES[categoryId]

  // Custom image (data URL)
  if (customIcon?.startsWith('data:')) {
    return (
      <div
        className="shrink-0 rounded-card_sm overflow-hidden flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <img src={customIcon} alt="" className="w-full h-full object-cover" />
      </div>
    )
  }

  // Custom emoji
  if (customIcon) {
    return (
      <div
        className="shrink-0 rounded-card_sm flex items-center justify-center"
        style={{
          width: size,
          height: size,
          backgroundColor: `${cat.color}18`,
          border: `1px solid ${cat.color}30`,
          fontSize: size * 0.45,
        }}
      >
        {customIcon}
      </div>
    )
  }

  // Brand logo
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

  // Category icon fallback
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
