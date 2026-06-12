import { BottomNav } from './BottomNav'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'

const PAGE_TITLES: Record<string, string> = {
  '/':             'FinAnts',
  '/transactions': 'Buchungen',
  '/settings':     'Einstellungen',
}

export function AppShell() {
  const location = useLocation()
  const title = PAGE_TITLES[location.pathname] ?? 'FinAnts'

  return (
    <div className="h-full bg-bg-base text-white flex flex-col">
      {/* Status-bar spacer (iPhone notch) */}
      <div className="h-safe-top bg-bg-base/80 backdrop-blur-glass" />

      {/* Header */}
      <header className="sticky top-0 z-20 px-4 pt-2 pb-3 bg-bg-base/80 backdrop-blur-glass border-b border-white/[0.05]">
        <motion.h1
          key={title}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="text-lg font-bold tracking-tight bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent"
        >
          {title}
        </motion.h1>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className="absolute inset-0 overflow-y-auto overscroll-contain px-4 pt-4 pb-32"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomNav />
    </div>
  )
}
