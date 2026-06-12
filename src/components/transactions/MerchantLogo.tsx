import { useState } from 'react'
import { useAllCategories } from '@/hooks/useAllCategories'
import { getLogoUrl } from '@/utils/merchantLogos'

interface Props {
  merchantKey?: string
  categoryId: string
  customIcon?: string
  size?: number
}

export function MerchantLogo({ merchantKey, categoryId, customIcon, size = 40 }: Props) {
  const [error, setError] = useState(false)
  const { allMap } = useAllCategories()
  const cat = allMap[categoryId] ?? allMap['other']

  if (customIcon?.startsWith('data:') || customIcon?.startsWith('http')) {
    return (
      <div
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
