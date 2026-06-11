import { motion } from 'framer-motion'
import { clsx } from 'clsx'
import type { ReactNode, MouseEventHandler } from 'react'

interface Props {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  active?: boolean
  icon?: ReactNode
  className?: string
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  onClick?: MouseEventHandler<HTMLButtonElement>
}

export function PillButton({ children, variant = 'secondary', size = 'md', active, icon, className, onClick, disabled, type = 'button' }: Props) {
  return (
    <motion.button
      type={type}
      disabled={disabled}
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
      className={clsx(
        'inline-flex items-center gap-2 rounded-pill font-medium transition-all duration-200 select-none',
        size === 'sm'  && 'px-3 py-1.5 text-xs',
        size === 'md'  && 'px-4 py-2 text-sm',
        size === 'lg'  && 'px-6 py-3 text-base',
        variant === 'primary'   && 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/25',
        variant === 'secondary' && !active && 'bg-white/[0.06] border border-white/[0.1] text-white/70 hover:bg-white/[0.1] hover:text-white',
        variant === 'secondary' && active  && 'bg-purple-500/20 border border-purple-500/40 text-purple-300',
        variant === 'ghost'     && 'text-white/60 hover:text-white hover:bg-white/[0.06]',
        variant === 'danger'    && 'bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30',
        disabled && 'opacity-50 pointer-events-none',
        className,
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </motion.button>
  )
}
