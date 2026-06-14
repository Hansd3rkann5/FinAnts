import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { TransactionsProvider } from './context/TransactionsContext'
import { ModalProvider } from './context/ModalContext'
import { AppShell } from './components/layout/AppShell'
import { setCfJwt } from './utils/cfAuth'

export default function App() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const jwt = params.get('cf_jwt')
    if (jwt) {
      setCfJwt(jwt)
      window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    }
  }, [])

  return (
    <HashRouter>
      <ModalProvider>
        <TransactionsProvider>
          <Routes>
            <Route path="/*" element={<AppShell />} />
          </Routes>
        </TransactionsProvider>
      </ModalProvider>
    </HashRouter>
  )
}
