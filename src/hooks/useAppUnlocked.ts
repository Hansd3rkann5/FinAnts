import { useSyncExternalStore } from 'react'
import { subscribeAppLocked, isAppLocked } from '@/utils/appLock'

// True once the LockScreen overlay is gone. Charts combine this with their
// useInView gate (`isAnimationActive={inView && unlocked}`) so their
// main-thread-heavy entry animations wait until the user is actually in
// the app instead of competing with the PIN keypad for input handling.
export function useAppUnlocked(): boolean {
  return useSyncExternalStore(subscribeAppLocked, () => !isAppLocked())
}
