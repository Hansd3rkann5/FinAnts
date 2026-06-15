import { useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { Dashboard } from '@/pages/Dashboard'
import { Transactions } from '@/pages/Transactions'
import { Settings } from '@/pages/Settings'
import { usePagerSwipe } from '@/hooks/useSwipeNavigation'

// Order must mirror the BottomNav (left → right): Buchungen · Übersicht · Einstellungen
const TABS = [
  { path: '/transactions', Component: Transactions, scrollId: 'page-scroll-transactions' },
  { path: '/',             Component: Dashboard,    scrollId: 'page-scroll-dashboard'    },
  { path: '/settings',     Component: Settings,     scrollId: 'page-scroll-settings'     },
]

export function AppShell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const n = TABS.length
  const activeIndex = Math.max(0, TABS.findIndex(t => t.path === pathname))
  const trackRef = useRef<HTMLDivElement>(null)

  const goTo = useCallback((i: number) => navigate(TABS[i].path), [navigate])

  // Live, finger-following swipe; the hook drives the track's transform.
  usePagerSwipe(trackRef, n, activeIndex, goTo)

  return (
    <div id="app-shell" className="flex-1 min-h-0 bg-bg-base text-white flex flex-col">
      <main id="app-main" className="mt-12 flex-1 overflow-hidden relative" style={{ height: '100vh' }}>
        {/* Filmstrip: pages sit side-by-side in navbar order; the track follows
            the finger during a horizontal swipe (transform managed by
            usePagerSwipe) and snaps to a page on release. All pages stay
            mounted (scroll position + state kept). */}
        <div
          ref={trackRef}
          className="flex h-full"
          style={{ width: `${n * 100}%`, willChange: 'transform', backfaceVisibility: 'hidden' }}
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
