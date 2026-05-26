import { useNavigate, useLocation } from 'react-router-dom'
import { LogOut, Bell, HelpCircle } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { useOrg } from '@/providers/OrgProvider'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { useQuery } from '@tanstack/react-query'
import { entitiesApi } from '@/api/entities'
import { periodsApi } from '@/api/periods'
import { journalEntriesApi } from '@/api/journalEntries'

export function TopNav() {
  const { user, logout } = useAuth()
  const { org } = useOrg()
  const { activeEntity, setActiveEntity } = useWorkspace()
  const navigate = useNavigate()
  const location = useLocation()

  const isImportOrWizard = [
    '/pdf-import',
    '/coa-import',
    '/trial-balance-import',
    '/import'
  ].some((path) => location.pathname === path || location.pathname.startsWith(path + '/'))

  const { data: entities = [] } = useQuery({
    queryKey: ['entities-list'],
    queryFn: () => entitiesApi.list(),
    staleTime: 30_000,
  })

  const { data: periods = [] } = useQuery({
    queryKey: ['periods-list', activeEntity?.id],
    queryFn: () => periodsApi.list(activeEntity!.id),
    enabled: !!activeEntity?.id,
    staleTime: 30_000,
  })

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
        {/* Client (Organization) Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</span>
          <div className="flex h-8 items-center rounded-md border border-gray-300 bg-gray-50 px-3 text-xs font-medium text-gray-700 min-w-[140px]" data-testid="topbar-client">
            {org?.name ?? 'Select Client'}
          </div>
        </div>

        {/* Period Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Period</span>
          {isImportOrWizard ? (
            <div className="flex h-8 items-center rounded-md border border-gray-300 bg-gray-50 px-3 text-xs font-medium text-gray-700 min-w-[120px]" data-testid="topbar-period-read-only">
              {periods[0] ? `${periods[0].fiscal_year}-${String(periods[0].period_number).padStart(2, '0')}` : 'Dec 2024'}
            </div>
          ) : (
            <select
              className="h-8 rounded-md border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[120px]"
              data-testid="topbar-period-select"
              defaultValue=""
            >
              {periods.length > 0 ? (
                periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fiscal_year}-{String(p.period_number).padStart(2, '0')}
                  </option>
                ))
              ) : (
                <option value="">Dec 2024</option>
              )}
            </select>
          )}
        </div>

        {/* Entity Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Entity</span>
          {isImportOrWizard ? (
            <div className="flex h-8 items-center rounded-md border border-gray-300 bg-gray-50 px-3 text-xs font-medium text-gray-700 min-w-[160px]" data-testid="topbar-entity-read-only">
              {activeEntity ? `${activeEntity.code} — ${activeEntity.name}` : 'Select Entity'}
            </div>
          ) : (
            <select
              value={activeEntity?.id ?? ''}
              onChange={(e) => {
                const selected = entities.find((ent) => ent.id === Number(e.target.value))
                if (selected) {
                  setActiveEntity({ id: selected.id, code: selected.code, name: selected.name })
                } else {
                  setActiveEntity(null)
                }
              }}
              className="h-8 rounded-md border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[160px]"
              data-testid="topbar-entity-select"
            >
              <option value="">— Select Entity —</option>
              {entities.map((ent) => (
                <option key={ent.id} value={ent.id}>
                  {ent.code} — {ent.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Status Indicator */}
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
