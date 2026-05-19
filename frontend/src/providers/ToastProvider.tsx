import { createContext, useCallback, useContext, useState, useEffect } from 'react'
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastCtx {
  toasts: Toast[]
  toast: (message: string, type?: ToastType, duration?: number) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastCtx | null>(null)

let _counter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = `toast-${++_counter}`
    setToasts((prev) => [...prev, { id, type, message, duration }])
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration)
    }
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx.toast
}

// ---------------------------------------------------------------------------

function ToastContainer({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  )
}

const ICON_MAP: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />,
  error:   <XCircle className="w-4 h-4 text-red-600 shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />,
  info:    <Info className="w-4 h-4 text-blue-500 shrink-0" />,
}

const STYLE_MAP: Record<ToastType, string> = {
  success: 'bg-white border border-green-200',
  error:   'bg-white border border-red-200',
  warning: 'bg-white border border-orange-200',
  info:    'bg-white border border-blue-200',
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg ${STYLE_MAP[toast.type]}`}>
      {ICON_MAP[toast.type]}
      <p className="flex-1 text-sm text-gray-800">{toast.message}</p>
      <button type="button" onClick={onDismiss} className="text-gray-400 hover:text-gray-600 shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
