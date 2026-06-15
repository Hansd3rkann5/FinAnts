import { useLocation } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { Dashboard } from '@/pages/Dashboard'
import { Transactions } from '@/pages/Transactions'
import { Settings } from '@/pages/Settings'

const TABS = [
  { path: '/',             Component: Dashboard,    scrollId: 'page-scroll-dashboard'    },
  { path: '/transactions', Component: Transactions, scrollId: 'page-scroll-transactions' },
  { path: '/settings',     Component: Settings,     scrollId: 'page-scroll-settings'     },
]

export function AppShell() {
  const { pathname } = useLocation()
  const n = TABS.length
  const activeIndex = Math.max(0, TABS.findIndex(t => t.path === pathname))

  return (
    <div id="app-shell" className="flex-1 min-h-0 bg-bg-base text-white flex flex-col">
      <main id="app-main" className="mt-12 flex-1 overflow-hidden relative" style={{ height: '100vh' }}>
        {/* Filmstrip: pages sit side-by-side in navbar order; the track slides to
            the active tab, so the swipe direction mirrors the page's position in
            the navbar. All pages stay mounted (scroll position + state kept). */}
        <div
          className="flex h-full transition-transform duration-300 ease-out"
          style={{ width: `${n * 100}%`, transform: `translateX(-${activeIndex * (100 / n)}%)` }}
        >
          {TABS.map(({ path, Component, scrollId }) => (
            <div
              key={path}
              id={scrollId}
              className="h-full overflow-y-auto overscroll-contain pt-6 px-0 pb-28"
              style={{ width: `${100 / n}%` }}
            >
              <Component />
            </div>
          ))}
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
