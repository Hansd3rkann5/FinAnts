const KEY = 'finants_theme'

export type AppTheme = 'color' | 'mono'

export function loadTheme(): AppTheme {
  try {
    return localStorage.getItem(KEY) === 'mono' ? 'mono' : 'color'
  } catch {
    return 'color'
  }
}

// 'mono' renders the whole app black/white via a grayscale filter on <html>
// (see index.css) — one rule covers every hardcoded accent color, inline
// style, and portal without touching any component. Safe here because
// html/body never scroll (overflow:hidden), so the filter's containing
// block doesn't affect fixed-position overlays.
export function applyTheme(theme: AppTheme) {
  document.documentElement.classList.toggle('theme-mono', theme === 'mono')
  try {
    localStorage.setItem(KEY, theme)
  } catch { /* view preference only */ }
}

export function initTheme() {
  document.documentElement.classList.toggle('theme-mono', loadTheme() === 'mono')
}
