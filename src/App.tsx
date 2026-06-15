import { useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { TransactionsProvider } from './context/TransactionsContext'
import { ModalProvider } from './context/ModalContext'
import { AppShell } from './components/layout/AppShell'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ToastHost } from './components/ui/ToastHost'
import { LockScreen } from './components/ui/LockScreen'
import { isLockEnabled } from './utils/appLock'

export default function App() {
  // Gate the whole app (incl. data load) behind the lock until unlocked.
  const [locked, setLocked] = useState(isLockEnabled)

  return (
    <ErrorBoundary>
      <ToastHost />
      {locked ? (
        <LockScreen onUnlock={() => setLocked(false)} />
      ) : (
        <HashRouter>
          <ModalProvider>
            <TransactionsProvider>
              <Routes>
                <Route path="/*" element={<AppShell />} />
              </Routes>
            </TransactionsProvider>
          </ModalProvider>
        </HashRouter>
      )}
    </ErrorBoundary>
  )
}
