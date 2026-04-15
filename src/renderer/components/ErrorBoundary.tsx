import React, { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('React Error Boundary caught:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, color: '#f38ba8', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          <h2 style={{ color: '#f38ba8' }}>Renderer Error</h2>
          <p>{this.state.error?.message}</p>
          <details style={{ marginTop: 12, fontSize: 12, color: '#a6adc8' }}>
            <summary>Stack trace</summary>
            {this.state.error?.stack}
          </details>
          <button
            style={{ marginTop: 16, padding: '8px 16px', background: '#89b4fa', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
