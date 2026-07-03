import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { TransactionsProvider } from './context/TransactionsContext'
import { ModalProvider } from './context/ModalContext'
import { AppShell } from './components/layout/AppShell'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ToastHost } from './components/ui/ToastHost'
import { LockScreen } from './components/ui/LockScreen'
import { isLockEnabled, lockTimeoutMinutes, setAppLocked } from './utils/appLock'

export default function App() {
  // Locked on first open, and re-locked once the app has been backgrounded
  // (home screen / app switch) for at least the configured timeout — a quick
  // switch-away-and-back within that window doesn't re-prompt. The LockScreen
  // is an opaque overlay so the app stays mounted underneath — no reload/
  // re-fetch on every return.
  const [locked, setLocked] = useState(() => {
    const initial = (() => {
      if (!isLockEnabled()) return false
      // Skip the lock when returning from an EnableBanking OAuth redirect —
      // the user just authenticated with their bank, which is equivalent to
      // unlocking the app.
      const params = new URLSearchParams(window.location.search)
      if (params.has('code') && localStorage.getItem('finants_eb_pending')) return false
      return true
    })()
    // Seed the module store synchronously so charts rendering in this same
    // pass already see the locked state (the sync effect below only fires
    // after the first frame).
    setAppLocked(initial)
    return initial
  })

  // Publish lock state so charts can defer their entry animations while the
  // keypad is up (see useAppUnlocked).
  useEffect(() => { setAppLocked(locked) }, [locked])

  useEffect(() => {
    let hiddenAt: number | null = null

    const onHide = () => { hiddenAt = Date.now() }
    const onVisibilityChange = () => {
      if (document.hidden) { onHide(); return }
      if (hiddenAt === null) return
      const elapsedMin = (Date.now() - hiddenAt) / 60_000
      if (isLockEnabled() && elapsedMin >= lockTimeoutMinutes()) setLocked(true)
      hiddenAt = null
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onHide)
    }
  }, [])

  return (
    <ErrorBoundary>
      <ToastHost />
      <HashRouter>
        <ModalProvider>
          <TransactionsProvider>
            <Routes>
              <Route path="/*" element={<AppShell />} />
            </Routes>
          </TransactionsProvider>
        </ModalProvider>
      </HashRouter>
      {locked && <LockScreen onUnlock={() => setLocked(false)} />}
    </ErrorBoundary>
  )
}
