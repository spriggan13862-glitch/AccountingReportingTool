import { NavLink } from 'react-router-dom'
import { cn } from '@/utils/cn'
import type { NavBadge, NavItemConfig } from '@/config/nav'

const BADGE_STYLES: Record<NavBadge, string> = {
  'Coming Soon': 'bg-slate-700 text-slate-300',
  'Setup':       'bg-amber-800/60 text-amber-300',
  'Draft':       'bg-indigo-800/60 text-indigo-300',
  'Beta':        'bg-emerald-800/60 text-emerald-300',
  'Admin':       'bg-rose-800/60 text-rose-300',
}

interface SidebarItemProps {
  item: NavItemConfig
  sidebarCollapsed: boolean
}

export function SidebarItem({ item, sidebarCollapsed }: SidebarItemProps) {
  const { label, to, icon: Icon, end, badge } = item
  const isPlaceholder = to === null

  const baseClass = cn(
    'flex items-center rounded-md transition-colors',
    sidebarCollapsed
      ? 'justify-center px-0 py-1.5 w-8 mx-auto'
      : 'gap-2.5 px-3 py-1.5',
    'text-xs font-medium',
  )

  const content = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {!sidebarCollapsed && (
        <span className="flex-1 truncate">{label}</span>
      )}
      {!sidebarCollapsed && badge && (
        <span
          className={cn('ml-auto shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide', BADGE_STYLES[badge])}
          data-testid={`badge-${item.id}`}
        >
          {badge}
        </span>
      )}
    </>
  )

  if (isPlaceholder) {
    return (
      <div
        className={cn(baseClass, 'cursor-default text-sidebar-foreground/35 select-none')}
        title={sidebarCollapsed ? label : undefined}
        data-testid={`nav-item-${item.id}`}
      >
        {content}
      </div>
    )
  }

  return (
    <NavLink
      to={to}
      end={end}
      title={sidebarCollapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          baseClass,
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
            : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
        )
      }
      data-testid={`nav-item-${item.id}`}
    >
      {content}
    </NavLink>
  )
}
