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

  return (
    <div id="app-shell" className="flex-1 min-h-0 bg-bg-base text-white flex flex-col">
      {/* <div id="safe-area-top" className="h-safe-top" /> */}

      {/* Extends the sticky filter's blur behind the notch / safe area */}


      <main id="app-main" className="mt-12 flex-1 overflow-hidden relative" style={{ height: '100vh' }}>
        {TABS.map(({ path, Component, scrollId }) => (
          <div
            key={path}
            id={scrollId}
            className="absolute inset-0 pt-6 overflow-y-auto overscroll-contain px-0 pb-28"
            style={{ display: pathname === path ? 'block' : 'none' }}
          >
            <Component />
          </div>
        ))}
      </main>

      <BottomNav />
    </div>
  )
}
