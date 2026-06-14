import { HashRouter, Routes, Route } from 'react-router-dom'
import { TransactionsProvider } from './context/TransactionsContext'
import { ModalProvider } from './context/ModalContext'
import { AppShell } from './components/layout/AppShell'

export default function App() {
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
