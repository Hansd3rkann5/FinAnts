import { useState } from 'react'
import { Palette } from 'lucide-react'
import { loadTheme, applyTheme, type AppTheme } from '@/utils/theme'
import { CollapsibleCard } from './shared'

const OPTIONS: { value: AppTheme; label: string }[] = [
  { value: 'color', label: 'Farbig' },
  { value: 'mono',  label: 'Schwarz-Weiß' },
]

export function ThemeSection() {
  const [theme, setTheme] = useState<AppTheme>(loadTheme)

  function change(t: AppTheme) {
    applyTheme(t)
    setTheme(t)
  }

  return (
    <CollapsibleCard
      icon={<Palette size={15} className="text-white/40 shrink-0" />}
      title="Darstellung"
      statusText={theme === 'mono' ? 'Schwarz-Weiß' : 'Farbig'}
    >
      <p className="text-xs text-white/40 mb-3">
        Farbschema der App. Schwarz-Weiß färbt die Bedienelemente neutral ein —
        Kategorien, Charts und Symbole bleiben farbig.
      </p>
      <div className="flex gap-2">
        {OPTIONS.map(o => (
          <button
            key={o.value}
            onClick={() => change(o.value)}
            className="flex-1 py-1.5 rounded-pill text-xs border transition-all duration-150"
            style={{
              backgroundColor: theme === o.value ? 'rgba(var(--acc-rgb),0.2)' : 'rgba(255,255,255,0.04)',
              borderColor:     theme === o.value ? 'rgba(var(--acc-rgb),0.4)' : 'rgba(255,255,255,0.08)',
              color:           theme === o.value ? 'var(--acc-soft)' : 'rgba(255,255,255,0.4)',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </CollapsibleCard>
  )
}
