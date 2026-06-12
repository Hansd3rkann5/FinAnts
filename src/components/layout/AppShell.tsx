import { BottomNav } from './BottomNav'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'

export function AppShell() {
  const location = useLocation()

  return (
    <div className="h-full bg-bg-base text-white flex flex-col">
      {/* Status-bar spacer (iPhone notch) */}
      <div className="h-safe-top" />

      {/* Main content */}
      <main className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
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
