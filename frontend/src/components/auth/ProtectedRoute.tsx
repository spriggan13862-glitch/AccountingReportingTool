import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/providers/AuthProvider'

interface ProtectedRouteProps {
  children: React.ReactNode
  /** Optional required role. If omitted, any authenticated user may access. */
  requiredRole?: string
}

/**
 * Wraps a route so it is only accessible to authenticated users.
 * Unauthenticated visitors are redirected to /login with a `next` param.
 * Role-restricted routes redirect to /unauthorized when the role is absent.
 */
export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-sm text-gray-500">Verifying session…</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ next: location.pathname }} replace />
  }

  if (requiredRole && !user?.is_superuser) {
    // Role enforcement is supplemental — the backend is authoritative.
    // This only controls navigation; the API will reject unauthorized mutations.
    return <Navigate to="/unauthorized" replace />
  }

  return <>{children}</>
}
