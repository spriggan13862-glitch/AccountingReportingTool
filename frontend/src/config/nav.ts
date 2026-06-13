import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BarChart2,
  BarChart3,
  BookOpen,
  Brain,
  Building2,
  Calendar,
  Clock,
  Database,
  Eye,
  FolderOpen,
  GitBranch,
  GitCompare,
  HelpCircle,
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
  AlertTriangle,
  CalendarCheck,
  FlaskConical,
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
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      { id: 'dashboard', label: 'Dashboard', to: '/engagement/dashboard', icon: LayoutDashboard, end: true },
    ],
  },
  {
    id: 'workbench',
    label: 'Adjustment Workspace',
    icon: SlidersHorizontal,
    defaultOpen: true,
    items: [
      { id: 'adjustment-workspace', label: 'Adjustment Workspace', to: '/workbench/adjustment-workspace', icon: Layers },
      { id: 'adjustment-bridge', label: 'Adjustment Bridge', to: '/workbench/adjustment-bridge', icon: GitCompare },
      { id: 'journal-entries', label: 'Journal Entries', to: '/workbench/journal-entries', icon: BookOpen },
      { id: 'draft-preview', label: 'Draft Preview', to: '/workbench/draft-preview', icon: Eye },
      { id: 'scenarios', label: 'Scenario Manager', to: '/workbench/scenarios', icon: GitCompare },
    ],
  },
  {
    id: 'intelligence',
    label: 'Accounting Intelligence',
    icon: Brain,
    defaultOpen: true,
    items: [
      { id: 'quarterly-review', label: 'Quarterly Review', to: '/intelligence/quarterly-review', icon: CalendarCheck },
      { id: 'issue-repository', label: 'Issue Repository', to: '/intelligence/issue-repository', icon: AlertTriangle },
      { id: 'financial-diagnostics', label: 'Financial Diagnostics', to: '/intelligence/financial-diagnostics', icon: Activity },
      { id: 'rule-harness', label: 'Rule Harness', to: '/intelligence/rule-harness', icon: FlaskConical },
    ],
  },
  {
    id: 'financial-impact',
    label: 'Financial Impact',
    icon: BarChart2,
    defaultOpen: true,
    items: [
      { id: 'financial-impact', label: 'Financial Impact Workspace', to: '/financial-impact/statements', icon: BarChart3 },
    ],
  },
  {
    id: 'client-books',
    label: 'Client Books',
    icon: Database,
    defaultOpen: false,
    items: [
      { id: 'import-center', label: 'Import Center', to: '/client-data/imports', icon: Upload, end: true },
      { id: 'documents', label: 'Source Documents', to: '/client-data/documents', icon: FolderOpen },
    ],
  },
  {
    id: 'deliverables',
    label: 'Deliverables',
    icon: Package,
    defaultOpen: false,
    items: [
      { id: 'deliverables-workspace', label: 'Deliverables Workspace', to: '/deliverables/workspace', icon: LayoutGrid },
    ],
  },
  {
    id: 'setup',
    label: 'Setup',
    icon: Settings2,
    defaultOpen: false,
    items: [
      { id: 'accounts', label: 'Chart of Accounts', to: '/client-data/chart-of-accounts', icon: List },
      { id: 'taxonomy', label: 'Taxonomy Admin', to: '/client-data/taxonomy-mapping', icon: GitBranch },
      { id: 'reporting-views', label: 'Reporting Views', to: '/setup/reporting-views', icon: BarChart3 },
      { id: 'entities', label: 'Entities', to: '/client-data/entities', icon: Building2 },
      { id: 'periods', label: 'Periods', to: '/client-data/periods', icon: Calendar },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: Users,
    defaultOpen: false,
    items: [
      { id: 'admin-users', label: 'Users', to: '/admin', icon: Users, requiresAdmin: true, badge: 'Admin' },
      { id: 'reporting-settings', label: 'Settings', to: '/setup/settings', icon: Settings },
      { id: 'help', label: 'Help', to: '/setup/help', icon: HelpCircle },
    ],
  },
]
