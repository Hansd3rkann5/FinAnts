import { motion, type HTMLMotionProps } from 'framer-motion'
import { clsx } from 'clsx'

interface Props extends HTMLMotionProps<'div'> {
  children: React.ReactNode
  className?: string
  glow?: 'purple' | 'blue' | 'none'
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export function GlassCard({ children, className, glow = 'none', padding = 'md', ...rest }: Props) {
  return (
    <motion.div
      className={clsx(
        'rounded-card border border-white/[0.08] backdrop-blur-glass',
        'bg-white/[0.04]',
        glow === 'purple' && 'shadow-[0_0_24px_rgba(139,92,246,0.12)]',
        glow === 'blue'   && 'shadow-[0_0_24px_rgba(59,130,246,0.12)]',
        padding === 'sm'  && 'p-3',
        padding === 'md'  && 'p-4',
        padding === 'lg'  && 'p-6',
        padding === 'none' && '',
        className,
      )}
      {...rest}
    >
      {children}
    </motion.div>
  )
}
