import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'

export function QuickBooksCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const success = params.get('success') === '1'
  const error = params.get('error')

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/quickbooks/connect', { replace: true })
    }, 2500)
    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-8 py-10 max-w-sm w-full text-center">
        {!success && !error && (
          <>
            <Loader2 className="h-10 w-10 text-blue-500 animate-spin mx-auto mb-4" />
            <p className="text-sm text-gray-600">Connecting to QuickBooks…</p>
          </>
        )}
        {success && (
          <>
            <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-4" />
            <p className="text-base font-semibold text-gray-900 mb-1">Connected!</p>
            <p className="text-sm text-gray-500">Redirecting you back…</p>
          </>
        )}
        {error && (
          <>
            <XCircle className="h-10 w-10 text-red-500 mx-auto mb-4" />
            <p className="text-base font-semibold text-gray-900 mb-1">Connection failed</p>
            <p className="text-sm text-red-600 break-all">{decodeURIComponent(error)}</p>
            <p className="text-xs text-gray-400 mt-2">Redirecting you back…</p>
          </>
        )}
      </div>
    </div>
  )
}
