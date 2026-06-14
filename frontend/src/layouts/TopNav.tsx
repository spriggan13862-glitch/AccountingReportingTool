import { useNavigate } from 'react-router-dom'
import { LogOut, Bell, HelpCircle } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { useOrg } from '@/providers/OrgProvider'
import { useQuery } from '@tanstack/react-query'
import { journalEntriesApi } from '@/api/journalEntries'

export function TopNav() {
  const { user, logout } = useAuth()
  const { org } = useOrg()
  const navigate = useNavigate()

  const { data: jes = [] } = useQuery({
    queryKey: ['jes-list'],
    queryFn: () => journalEntriesApi.list(),
    staleTime: 30_000,
  })

  const draftCount = jes.filter((j) => j.status === 'draft').length

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  // Get user initials for avatar
  const initials = user?.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'U'

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Client (Organization) — read-only display */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</span>
          <div className="flex h-8 items-center rounded-md border border-gray-300 bg-gray-50 px-3 text-xs font-medium text-gray-700 min-w-[140px]" data-testid="topbar-client">
            {org?.name ?? 'Select Client'}
          </div>
        </div>

        {/* Draft AJE count badge */}
        {draftCount > 0 && (
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            {draftCount} Draft Entr{draftCount !== 1 ? 'ies' : 'y'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          title="Help"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
        <button
          type="button"
          className="relative rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          title="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-0.5 top-0.5 flex h-2.5 w-2.5 rounded-full bg-red-500" />
        </button>

        {user && (
          <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
            {/* Round Initials Avatar */}
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-xs"
              title={`${user.full_name} (${user.email})`}
            >
              {initials}
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline font-medium">Sign out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
