import { NavLink } from 'react-router-dom'
import { LayoutDashboard, List, Settings } from 'lucide-react'
import { motion } from 'framer-motion'
import { clsx } from 'clsx'

const TABS = [
  { to: '/',             label: 'Übersicht',    Icon: LayoutDashboard },
  { to: '/transactions', label: 'Buchungen',    Icon: List            },
  { to: '/settings',     label: 'Einstellungen', Icon: Settings        },
]

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 pb-safe">
      {/* Blurred glass backdrop — same width as pill, rounded top, fills safe area */}
      <div
        className="absolute top-0 bottom-0 left-3 right-3 rounded-t-[28px] overflow-hidden"
        style={{
          background: 'rgba(8, 8, 14, 0.82)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      />
      <div className="relative mx-3 mb-3 rounded-pill bg-white/[0.04] border border-white/[0.08] flex">
        {TABS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className="flex-1"
          >
            {({ isActive }) => (
              <motion.div
                className={clsx(
                  'flex flex-col items-center gap-1 py-3 transition-colors duration-200',
                  isActive ? 'text-purple-400' : 'text-white/40',
                )}
                whileTap={{ scale: 0.92 }}
                transition={{ duration: 0.1 }}
              >
                <div className="relative">
                  <Icon size={22} strokeWidth={isActive ? 2.2 : 1.6} />
                  {isActive && (
                    <motion.div
                      layoutId="nav-dot"
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-purple-400"
                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                    />
                  )}
                </div>
                <span className="text-[10px] font-medium">{label}</span>
              </motion.div>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
