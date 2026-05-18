import { useNavigate } from 'react-router-dom'
import { LogOut, UserCircle } from 'lucide-react'
import { OrgHeader } from '@/components/ui/OrgHeader'
import { useAuth } from '@/providers/AuthProvider'

export function TopNav() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
      <OrgHeader />

      <div className="flex items-center gap-2">
        {user && (
          <>
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600">
              <UserCircle className="h-5 w-5 text-gray-400" />
              <span className="hidden sm:inline max-w-[160px] truncate" title={user.email}>
                {user.full_name}
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </>
        )}
      </div>
    </header>
  )
}
