import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import { SidebarItem } from './SidebarItem'
import type { NavGroupConfig } from '@/config/nav'

function lsKey(groupId: string) {
  return `sidebar_group_${groupId}`
}

function groupIsActive(group: NavGroupConfig, pathname: string): boolean {
  return group.items.some((item) => {
    if (!item.to) return false
    if (item.end) return pathname === item.to
    return pathname === item.to || pathname.startsWith(item.to + '/')
  })
}

interface SidebarGroupProps {
  group: NavGroupConfig
  sidebarCollapsed: boolean
  isAdmin: boolean
  badgeCounts?: Record<string, number>
}

export function SidebarGroup({ group, sidebarCollapsed, isAdmin, badgeCounts }: SidebarGroupProps) {
  const { pathname } = useLocation()
  const active = groupIsActive(group, pathname)

  const [open, setOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(lsKey(group.id))
      if (stored !== null) return stored === 'true'
    } catch { /* ignore */ }
    return group.defaultOpen
  })

  // Auto-expand when navigating into a group
  useEffect(() => {
    if (active && !open) setOpen(true)
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = () => {
    setOpen((v) => {
      const next = !v
      try { localStorage.setItem(lsKey(group.id), String(next)) } catch { /* ignore */ }
      return next
    })
  }

  const visibleItems = group.items.filter(
    (item) => !item.requiresAdmin || isAdmin,
  )

  const GroupIcon = group.icon

  // Collapsed sidebar: show group icon only
  if (sidebarCollapsed) {
    return (
      <div
        className={cn(
          'flex justify-center py-1',
          active && 'border-l-2 border-sidebar-primary',
        )}
        title={group.label}
        data-testid={`nav-group-${group.id}`}
      >
        <div
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
            active
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/45',
          )}
        >
          <GroupIcon className="h-4 w-4" />
        </div>
      </div>
    )
  }

  // Single-item group: render the item directly as a top-level link (no expand/collapse)
  if (visibleItems.length === 1 && visibleItems[0].to) {
    const item = visibleItems[0]
    const count = item.badgeKey ? (badgeCounts?.[item.badgeKey] ?? 0) : 0
    return (
      <div data-testid={`nav-group-${group.id}`}>
        <NavLink
          to={item.to}
          end={item.end}
          data-testid={`nav-item-${item.id}`}
          className={({ isActive }) =>
            cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
            )
          }
        >
          <GroupIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left">{group.label}</span>
          {count > 0 && (
            <span
              className="shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500 text-white text-[9px] font-bold px-1"
              data-testid={`count-badge-${item.id}`}
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </NavLink>
      </div>
    )
  }

  // Multi-item group: collapsible header + items
  return (
    <div data-testid={`nav-group-${group.id}`}>
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors',
          active
            ? 'text-sidebar-foreground'
            : 'text-sidebar-foreground/45 hover:text-sidebar-foreground',
        )}
        aria-expanded={open}
        data-testid={`nav-group-toggle-${group.id}`}
      >
        <GroupIcon className="h-3 w-3 shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
      </button>

      {open && (
        <div className="mt-0.5 space-y-0.5 pb-1" data-testid={`nav-group-items-${group.id}`}>
          {visibleItems.map((item) => (
            <SidebarItem
              key={item.id}
              item={item}
              sidebarCollapsed={false}
              badgeCount={item.badgeKey ? (badgeCounts?.[item.badgeKey] ?? 0) : 0}
            />
          ))}
        </div>
      )}
    </div>
  )
}
