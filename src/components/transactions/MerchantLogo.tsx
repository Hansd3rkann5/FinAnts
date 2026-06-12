import { useState } from 'react'
import { useAllCategories } from '@/hooks/useAllCategories'
import { getLogoUrl } from '@/utils/merchantLogos'

interface Props {
  merchantKey?: string
  categoryId: string
  customIcon?: string
  size?: number
}

const BASE = { 'data-component': 'merchant-logo' } as const

export function MerchantLogo({ merchantKey, categoryId, customIcon, size = 40 }: Props) {
  const [error, setError] = useState(false)
  const { allMap } = useAllCategories()
  const cat = allMap[categoryId] ?? allMap['other']

  if (customIcon?.startsWith('data:') || customIcon?.startsWith('http')) {
    return (
      <div
        {...BASE}
        className="shrink-0 rounded-card_sm overflow-hidden flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <img src={customIcon} alt="" className="w-full h-full object-cover" />
      </div>
    )
  }

  if (customIcon) {
    return (
      <div
        {...BASE}
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

  if (merchantKey && !error) {
    const url = getLogoUrl(merchantKey)
    return (
      <div
        {...BASE}
        className="shrink-0 rounded-card_sm overflow-hidden bg-white flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <img
          src={url}
          alt=""
          className="w-full h-full object-contain"
          onLoad={() => console.log('[MerchantLogo] loaded:', url)}
          onError={() => { console.warn('[MerchantLogo] failed:', url); setError(true) }}
          loading="lazy"
        />
      </div>
    )
  }

  return (
    <div
      {...BASE}
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
