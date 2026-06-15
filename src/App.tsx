import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { TransactionsProvider } from './context/TransactionsContext'
import { ModalProvider } from './context/ModalContext'
import { AppShell } from './components/layout/AppShell'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ToastHost } from './components/ui/ToastHost'
import { LockScreen } from './components/ui/LockScreen'
import { isLockEnabled } from './utils/appLock'

export default function App() {
  // Locked on first open, and re-locked whenever the app is backgrounded
  // (home screen / app switch). The LockScreen is an opaque overlay so the app
  // stays mounted underneath — no reload/re-fetch on every return.
  const [locked, setLocked] = useState(isLockEnabled)

  useEffect(() => {
    const relock = () => { if (document.hidden && isLockEnabled()) setLocked(true) }
    document.addEventListener('visibilitychange', relock)
    window.addEventListener('pagehide', relock)
    return () => {
      document.removeEventListener('visibilitychange', relock)
      window.removeEventListener('pagehide', relock)
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
