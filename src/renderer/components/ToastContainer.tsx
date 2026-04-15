import React, { type FC } from 'react'
import { useAppStore } from '../store/app-store'

export const ToastContainer: FC = () => {
  const { toasts, removeToast } = useAppStore()

  if (toasts.length === 0) return null

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} onClick={() => removeToast(t.id)}>
          <span className="toast-icon">{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : t.type === 'warning' ? '⚠' : 'ℹ'}</span>
          <span className="toast-message">{t.message}</span>
        </div>
      ))}
    </div>
  )
}
