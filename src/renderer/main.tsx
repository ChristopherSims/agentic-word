import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { PopupApp } from './PopupApp'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/global.css'

// Global error handler to capture renderer errors
window.onerror = (msg, source, lineno, colno, err) => {
  console.error('Global error:', msg, source, lineno, colno, err)
}
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason)
})

const hash = window.location.hash.replace('#', '')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    {hash === '/settings' || hash === '/help' ? <PopupApp mode={hash === '/settings' ? 'settings' : 'help'} /> : <App />}
  </ErrorBoundary>
)
