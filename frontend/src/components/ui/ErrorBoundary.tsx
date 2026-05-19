import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
          <p className="text-sm font-semibold text-gray-800">Something went wrong</p>
          <p className="text-xs text-gray-500 mt-1 max-w-xs">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 flex items-center gap-1.5 px-3 py-2 text-sm text-indigo-600 border border-indigo-300 rounded hover:bg-indigo-50"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
