import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '@/utils/notify'

interface Props { children: ReactNode }
interface State { hasError: boolean }

// Catches render-time crashes so the app shows a recoverable fallback instead
// of a white screen, and logs the error to the persisted error log.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError('render', error)
    console.error('[render] component stack:', info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-bg-base text-white px-6 text-center">
        <span className="text-4xl">🐜</span>
        <p className="text-sm text-white/70">Etwas ist schiefgelaufen.</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-pill bg-white/10 border border-white/15 px-5 py-2 text-sm font-medium hover:bg-white/20 transition-colors"
        >
          Neu laden
        </button>
      </div>
    )
  }
}
