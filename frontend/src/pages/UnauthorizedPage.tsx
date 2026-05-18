import { useNavigate } from 'react-router-dom'
import { ShieldOff } from 'lucide-react'

export function UnauthorizedPage() {
  const navigate = useNavigate()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-24 text-center">
      <ShieldOff className="h-12 w-12 text-gray-300" />
      <h1 className="text-lg font-semibold text-gray-800">Access Denied</h1>
      <p className="max-w-xs text-sm text-gray-500">
        You don't have permission to view this page. Contact your administrator
        if you believe this is an error.
      </p>
      <button
        onClick={() => navigate('/')}
        className="mt-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
      >
        Back to Dashboard
      </button>
    </div>
  )
}
