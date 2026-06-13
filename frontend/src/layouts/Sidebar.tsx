import { useState, useEffect, useMemo } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/utils/cn'
import { NAV_GROUPS } from '@/config/nav'
import { SidebarGroup } from '@/components/navigation/SidebarGroup'
import { useAuth } from '@/providers/AuthProvider'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { useOrg } from '@/providers/OrgProvider'
import { tbImportApi } from '@/api/tbImport'
import { journalEntriesApi } from '@/api/journalEntries'

const LS_KEY = 'sidebar_collapsed'

export function Sidebar() {
  const { user } = useAuth()
  const isAdmin = user?.is_superuser ?? false
  const { org } = useOrg()
  const orgId = org?.id ?? 0
  const { activeEntity } = useWorkspace()

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(LS_KEY) === 'true' } catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, String(collapsed)) } catch { /* ignore */ }
  }, [collapsed])

  const { data: tbBatches } = useQuery({
    queryKey: ['sidebar-tb-batches', orgId],
    queryFn: () => tbImportApi.listBatches(orgId),
    enabled: !!orgId,
    staleTime: 60000,
  })

  const { data: draftJEs } = useQuery({
    queryKey: ['sidebar-draft-je', activeEntity?.id],
    queryFn: () => journalEntriesApi.list({ status: 'draft', entity_id: activeEntity?.id }),
    enabled: !!activeEntity?.id,
    staleTime: 60000,
  })

  const badgeCounts = useMemo<Record<string, number>>(() => ({
    'import-unmapped': (tbBatches ?? []).filter((b) => (b.unmapped_row_count ?? 0) > 0).length,
    'draft-je': draftJEs?.length ?? 0,
  }), [tbBatches, draftJEs])

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200',
        collapsed ? 'w-12' : 'w-56',
      )}
      data-testid="sidebar"
    >
      {/* Header */}
      <div className={cn(
        'flex h-14 items-center border-b border-sidebar-border px-3 justify-between',
        collapsed && 'flex-col justify-center gap-2 py-2 h-auto',
      )}>
        {!collapsed ? (
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-bold text-xs">
              LA
            </div>
            <span className="font-semibold text-xs text-sidebar-foreground truncate">
              Ledger Advisory
            </span>
          </div>
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-bold text-xs">
            LA
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className={cn(
            'flex-shrink-0 rounded p-1 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
            collapsed && 'mt-1',
          )}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          data-testid="sidebar-collapse-btn"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-1.5 py-2 space-y-1" data-testid="sidebar-nav">
        {NAV_GROUPS.map((group, index) => (
          <div key={group.id}>
            {index > 0 && !collapsed && (
              <div className="my-1 border-t border-sidebar-border" />
            )}
            <SidebarGroup
              group={group}
              sidebarCollapsed={collapsed}
              isAdmin={isAdmin}
              badgeCounts={badgeCounts}
            />
          </div>
        ))}
      </nav>
    </aside>
  )
}
