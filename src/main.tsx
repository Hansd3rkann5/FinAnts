import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Polyfill crypto.randomUUID for iOS < 15.4
if (!('randomUUID' in crypto)) {
  (crypto as { randomUUID?: () => string }).randomUUID = function () {
    const b = crypto.getRandomValues(new Uint8Array(16))
    b[6] = (b[6] & 0x0f) | 0x40
    b[8] = (b[8] & 0x3f) | 0x80
    const h = [...b].map(x => x.toString(16).padStart(2, '0'))
    return `${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-${h.slice(8,10).join('')}-${h.slice(10).join('')}` as `${string}-${string}-${string}-${string}-${string}`
  }
}

function syncKeyboardHeight() {
  const vv = window.visualViewport
  const h = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0
  document.documentElement.style.setProperty('--keyboard-height', `${h}px`)
}

function scrollFocusedAboveKeyboard() {
  const vv = window.visualViewport
  if (!vv) return
  const focused = document.activeElement as HTMLElement
  if (!focused || (focused.tagName !== 'INPUT' && focused.tagName !== 'TEXTAREA')) return

  const rect = focused.getBoundingClientRect()
  const overlap = rect.bottom - vv.height + 8  // 8 px gap above keyboard
  if (overlap <= 0) return

  let el: HTMLElement | null = focused.parentElement
  while (el && el !== document.body) {
    const style = getComputedStyle(el)
    if (
      el.scrollHeight > el.clientHeight &&
      (style.overflowY === 'auto' || style.overflowY === 'scroll')
    ) {
      el.scrollTop += overlap
      return
    }
    el = el.parentElement
  }
}

window.visualViewport?.addEventListener('resize', () => {
  syncKeyboardHeight()
  // Wait for iOS keyboard animation to settle before measuring
  setTimeout(scrollFocusedAboveKeyboard, 150)
})
window.visualViewport?.addEventListener('scroll', syncKeyboardHeight)
syncKeyboardHeight()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
