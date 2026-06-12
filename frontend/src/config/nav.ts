import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BarChart2,
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  CheckSquare,
  Database,
  FolderOpen,
  GitBranch,
  GitCompare,
  LayoutDashboard,
  LayoutGrid,
  List,
  Package,
  Settings,
  Settings2,
  SlidersHorizontal,
  Upload,
  Users,
  Layers,
} from 'lucide-react'

export type NavBadge = 'Setup' | 'Draft' | 'Beta' | 'Coming Soon' | 'Admin'

export interface NavItemConfig {
  id: string
  label: string
  to: string | null
  icon: LucideIcon
  end?: boolean
  badge?: NavBadge
  requiresAdmin?: boolean
}

export interface NavGroupConfig {
  id: string
  label: string
  icon: LucideIcon
  defaultOpen: boolean
  items: NavItemConfig[]
}

export const NAV_GROUPS: NavGroupConfig[] = [
  {
    id: 'engagement',
    label: 'Engagement Overview',
    icon: Briefcase,
    defaultOpen: true,
    items: [
      { id: 'dashboard', label: 'Dashboard', to: '/engagement/dashboard', icon: LayoutDashboard, end: true },
    ],
  },
  {
    id: 'client-data',
    label: 'Client Data',
    icon: Database,
    defaultOpen: false,
    items: [
      { id: 'import-center', label: 'Import Center', to: '/client-data/imports', icon: Upload, end: true },
    ],
  },
  {
    id: 'workbench',
    label: 'Adjustment Workbench',
    icon: SlidersHorizontal,
    defaultOpen: true,
    items: [
      { id: 'adjustment-workspace', label: 'Adjustment Workspace', to: '/workbench/adjustment-workspace', icon: Layers },
      { id: 'adjustment-bridge', label: 'Adjustment Bridge', to: '/workbench/adjustment-bridge', icon: GitCompare },
      { id: 'journal-entries', label: 'Journal Entries', to: '/workbench/journal-entries', icon: BookOpen },
    ],
  },
  {
    id: 'analysis',
    label: 'Analysis Workspace',
    icon: BarChart2,
    defaultOpen: true,
    items: [
      { id: 'analysis-workspace', label: 'Analysis Workspace', to: '/financial-impact/statements', icon: BarChart3 },
    ],
  },
  {
    id: 'deliverables',
    label: 'Deliverables',
    icon: Package,
    defaultOpen: false,
    items: [
      { id: 'deliverables-workspace', label: 'Deliverables Workspace', to: '/deliverables/workspace', icon: LayoutGrid },
      { id: 'close-package', label: 'Close Package', to: '/deliverables/close-package', icon: CheckSquare },
      { id: 'workpapers', label: 'Workpapers', to: '/deliverables/workpapers', icon: FolderOpen },
    ],
  },
  {
    id: 'setup',
    label: 'Setup',
    icon: Settings2,
    defaultOpen: false,
    items: [
      { id: 'accounts', label: 'Chart of Accounts', to: '/client-data/chart-of-accounts', icon: List },
      { id: 'entities', label: 'Entities', to: '/client-data/entities', icon: Building2 },
      { id: 'taxonomy', label: 'Taxonomy Admin', to: '/client-data/taxonomy-mapping', icon: GitBranch },
      { id: 'reporting-views', label: 'Reporting Views', to: '/setup/reporting-views', icon: BarChart3 },
      { id: 'reporting-settings', label: 'Settings', to: '/setup/settings', icon: Settings },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    icon: Users,
    defaultOpen: false,
    items: [
      { id: 'admin-users', label: 'Admin / Users', to: '/admin', icon: Users, requiresAdmin: true, badge: 'Admin' },
    ],
  },
]
