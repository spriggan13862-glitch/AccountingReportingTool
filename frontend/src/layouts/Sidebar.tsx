import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/utils/cn'
import {
  LayoutDashboard,
  BookOpen,
  Upload,
  List,
  GitBranch,
  GitCompare,
  BarChart3,
  HelpCircle,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Building2,
  FileSpreadsheet,
  FileSearch,
  Calendar,
  GitMerge,
  GitPullRequest,
  Paperclip,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

interface NavItem {
  to: string
  label: string
  icon: React.ElementType
  end?: boolean
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/import', label: 'Import Center', icon: Upload },
  { to: '/accounts', label: 'Chart of Accounts', icon: List },
  { to: '/taxonomy-admin', label: 'Taxonomy Mapping', icon: GitBranch },
  { to: '/journal-entries', label: 'Journal Entries', icon: BookOpen },
  { to: '/adjustment-bridge', label: 'Adjustment Bridge', icon: GitCompare },
  { to: '/financial-statements', label: 'Reports Preview', icon: BarChart3 },
  { to: '/help', label: 'Help Center', icon: HelpCircle },
  { to: '/reporting-settings', label: 'Settings', icon: Settings },
]

const secondaryItems = [
  { to: '/entities', label: 'Entities', icon: Building2 },
  { to: '/periods', label: 'Periods', icon: Calendar },
  { to: '/consolidations', label: 'Consolidations', icon: GitMerge },
  { to: '/reconciliations', label: 'Reconciliations', icon: GitPullRequest },
  { to: '/documents', label: 'Documents', icon: Paperclip },
]

const LS_KEY = 'sidebar_collapsed'

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(LS_KEY) === 'true' } catch { return false }
  })
  const [showOther, setShowOther] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, String(collapsed)) } catch { /* ignore */ }
  }, [collapsed])

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200',
        collapsed ? 'w-12' : 'w-56',
      )}
    >
      {/* Header */}
      <div className={cn(
        "flex h-14 items-center border-b border-sidebar-border px-3 justify-between",
        collapsed && "flex-col justify-center gap-2 py-2 h-auto"
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
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-1.5 py-2 space-y-1">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center rounded-md transition-colors',
                collapsed ? 'justify-center px-0 py-1.5' : 'gap-2.5 px-3 py-1.5',
                'text-sm font-medium',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && label}
          </NavLink>
        ))}

        {/* Separator / Collapsible Secondary Items */}
        {!collapsed && (
          <div className="pt-2 mt-2 border-t border-sidebar-border">
            <button
              onClick={() => setShowOther(!showOther)}
              className="flex w-full items-center justify-between px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45 hover:text-sidebar-foreground transition-colors"
            >
              <span>Admin & Setup</span>
              {showOther ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            {showOther && (
              <div className="mt-1 space-y-0.5">
                {secondaryItems.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-xs transition-colors',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                          : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground',
                      )
                    }
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>
    </aside>
  )
}
