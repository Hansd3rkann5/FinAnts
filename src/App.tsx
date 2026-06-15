import { HashRouter, Routes, Route } from 'react-router-dom'
import { TransactionsProvider } from './context/TransactionsContext'
import { ModalProvider } from './context/ModalContext'
import { AppShell } from './components/layout/AppShell'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ToastHost } from './components/ui/ToastHost'

export default function App() {
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
    </ErrorBoundary>
  )
}
