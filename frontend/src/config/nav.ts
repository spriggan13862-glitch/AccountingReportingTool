import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BarChart2,
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  CheckSquare,
  Database,
  Eye,
  FileBarChart,
  FolderOpen,
  GitBranch,
  GitCompare,
  GitPullRequest,
  HelpCircle,
  LayoutDashboard,
  List,
  Package,
  LayoutGrid,
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
      { id: 'engagement-status', label: 'Engagement Status', to: null, icon: Activity, badge: 'Coming Soon' },
    ],
  },
  {
    id: 'client-books',
    label: 'Client Books',
    icon: Database,
    defaultOpen: true,
    items: [
      { id: 'import-center', label: 'Import Center', to: '/client-data/imports', icon: Upload, end: true },
      { id: 'documents', label: 'Source Documents', to: '/client-data/documents', icon: FolderOpen },
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
      { id: 'draft-preview', label: 'Draft Preview', to: '/workbench/draft-preview', icon: Eye },
    ],
  },
  {
    id: 'financial-impact',
    label: 'Financial Impact',
    icon: BarChart2,
    defaultOpen: true,
    items: [
      { id: 'financial-impact', label: 'Financial Impact', to: '/financial-impact/statements', icon: BarChart3 },
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
      { id: 'reconciliations', label: 'Reconciliations', to: '/deliverables/reconciliations', icon: GitPullRequest },
      { id: 'advisor-package', label: 'Advisor Package', to: '/deliverables/reports', icon: FileBarChart },
    ],
  },
  {
    id: 'admin',
    label: 'Admin / Setup',
    icon: Settings2,
    defaultOpen: false,
    items: [
      { id: 'accounts', label: 'Chart of Accounts', to: '/client-data/chart-of-accounts', icon: List },
      { id: 'entities', label: 'Entities', to: '/client-data/entities', icon: Building2 },
      { id: 'periods', label: 'Periods', to: '/client-data/periods', icon: Calendar, end: true },
      { id: 'taxonomy', label: 'Taxonomy Admin', to: '/client-data/taxonomy-mapping', icon: GitBranch },
      { id: 'reporting-views', label: 'Reporting Views', to: '/setup/reporting-views', icon: BarChart3 },
      { id: 'reporting-settings', label: 'Settings', to: '/setup/settings', icon: Settings },
      { id: 'admin-users', label: 'Admin / Users', to: '/admin', icon: Users, requiresAdmin: true, badge: 'Admin' },
      { id: 'help', label: 'Help Center', to: '/setup/help', icon: HelpCircle },
    ],
  },
]
