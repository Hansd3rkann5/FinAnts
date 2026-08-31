import { NavLink } from 'react-router-dom'
import { LayoutDashboard, List, Settings } from 'lucide-react'
import { motion } from 'framer-motion'
import { useModalContext } from '@/context/ModalContext'

const TABS = [
  { to: '/transactions', label: 'Buchungen',    Icon: List            },
  { to: '/',             label: 'Übersicht',    Icon: LayoutDashboard },
  { to: '/settings',     label: 'Einstellungen', Icon: Settings        },
]

export function BottomNav() {
  const { anyModalOpen } = useModalContext()
  return (
    <motion.nav
      id="bottom-nav"
      className="absolute bottom-0 w-full z-30"
      style={{ paddingBottom: 0 }}
      initial={{ y: 0 }}
      animate={{ y: anyModalOpen ? '100%' : 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
    >
      <div
        id="nav-glass"
        className="absolute top-0 bottom-0 rounded-t-[35px]"
        style={{
          backdropFilter: 'blur(5px)',
          WebkitBackdropFilter: 'blur(5px)',
          marginInline: '24px',
        }}
      />
      <div id="nav-pill" className="relative rounded-pill border border-white/[0.08] flex"
        style={{
          backgroundColor: 'var(--nav-bg)',
          backdropFilter: 'blur(5px)',
          WebkitBackdropFilter: 'blur(5px)',
          marginInline: '24px',
          marginBottom: '24px',
          boxShadow: 'var(--nav-shadow)',
        }}
      >
        {TABS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className="flex-1"
            data-nav-tab={to}
          >
            {({ isActive }) => (
              <motion.div
                className="flex flex-col items-center gap-1 py-3 transition-colors duration-200"
                style={{ color: isActive ? 'var(--nav-tab-active)' : 'var(--nav-tab-inactive)' }}
                whileTap={{ scale: 0.92 }}
                transition={{ duration: 0.1 }}
              >
                <div className="relative">
                  <Icon size={22} strokeWidth={isActive ? 2.3 : 1.4} />
                  {/* {isActive && (
                    <motion.div
                      layoutId="nav-dot"
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-purple-400"
                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                    />
                  )} */}
                </div>
                <span className="text-[10px] font-medium">{label}</span>
              </motion.div>
            )}
          </NavLink>
        ))}
      </div>
    </motion.nav>
  )
}
