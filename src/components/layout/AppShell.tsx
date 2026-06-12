import { BottomNav } from './BottomNav'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'

export function AppShell() {
  const location = useLocation()

  return (
    <div id="app-shell" className="h-full bg-bg-base text-white flex flex-col">
      <div id="safe-area-top" className="h-safe-top" />

      <main id="app-main" className="flex-1 overflow-hidden relative">
        <AnimatePresence initial={false}>
          <motion.div
            id="page-scroll"
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, zIndex: 1 }}
            exit={{ opacity: 0, zIndex: 0 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="absolute inset-0 overflow-y-auto overscroll-contain px-4 pt-4 pb-24"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomNav />
    </div>
  )
}
