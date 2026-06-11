import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  ArrowLeftRight,
  BarChart2,
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  CheckSquare,
  Clock,
  Database,
  Eye,
  FileBarChart,
  FileOutput,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  GitBranch,
  GitCompare,
  GitMerge,
  GitPullRequest,
  HelpCircle,
  LayoutDashboard,
  List,
  Package,
  Settings,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  TableProperties,
  TrendingUp,
  Upload,
  Users,
  Wand2,
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
      { id: 'dashboard', label: 'Dashboard', to: '/', icon: LayoutDashboard, end: true },
      { id: 'engagement-status', label: 'Engagement Status', to: null, icon: Activity, badge: 'Coming Soon' },
    ],
  },
  {
    id: 'client-data',
    label: 'Client Data',
    icon: Database,
    defaultOpen: true,
    items: [
      { id: 'import-center', label: 'Import Center', to: '/import', icon: Upload },
      { id: 'pdf-import', label: 'PDF Statement', to: '/pdf-import', icon: FileText },
      { id: 'coa-import', label: 'COA Import', to: '/coa-import', icon: FileSpreadsheet },
      { id: 'documents', label: 'Source Documents', to: '/documents', icon: FolderOpen },
      { id: 'accounts', label: 'Chart of Accounts', to: '/accounts', icon: List },
      { id: 'taxonomy', label: 'Taxonomy Mapping', to: '/taxonomy-admin', icon: GitBranch },
      { id: 'entities', label: 'Entities', to: '/entities', icon: Building2 },
      { id: 'periods', label: 'Periods', to: '/periods', icon: Calendar },
    ],
  },
  {
    id: 'workbench',
    label: 'Adjustment Workbench',
    icon: SlidersHorizontal,
    defaultOpen: true,
    items: [
      { id: 'adjustment-bridge', label: 'Adjustment Bridge', to: '/adjustment-bridge', icon: GitCompare },
      { id: 'journal-entries', label: 'Journal Entries', to: '/journal-entries', icon: BookOpen },
      { id: 'draft-preview', label: 'Draft Preview', to: '/draft-preview', icon: Eye },
      { id: 'reclasses', label: 'Reclasses', to: null, icon: ArrowLeftRight, badge: 'Coming Soon' },
      { id: 'accruals', label: 'Accruals', to: null, icon: Clock, badge: 'Coming Soon' },
      { id: 'eliminations', label: 'Eliminations', to: '/consolidations', icon: GitMerge },
    ],
  },
  {
    id: 'financial-impact',
    label: 'Financial Impact',
    icon: BarChart2,
    defaultOpen: true,
    items: [
      { id: 'trial-balances', label: 'Trial Balance', to: '/trial-balances', icon: TableProperties },
      { id: 'financial-statements', label: 'Financial Statements', to: '/financial-statements', icon: BarChart3 },
      { id: 'fs-builder', label: 'FS Builder', to: '/fs-builder', icon: Wand2 },
      { id: 'comparatives', label: 'Comparatives', to: '/comparative-financials', icon: TrendingUp },
      { id: 'variance', label: 'Variance Analysis', to: '/variance-analysis', icon: TrendingUp },
    ],
  },
  {
    id: 'deliverables',
    label: 'Deliverables',
    icon: Package,
    defaultOpen: false,
    items: [
      { id: 'close-package', label: 'Close Package', to: '/close', icon: CheckSquare },
      { id: 'workpapers', label: 'Workpapers', to: '/close/workpapers', icon: FolderOpen },
      { id: 'reconciliations', label: 'Reconciliations', to: '/reconciliations', icon: GitPullRequest },
      { id: 'report-builder', label: 'Report Builder', to: '/report-builder', icon: FileBarChart },
      { id: 'reports', label: 'Reports', to: '/reports', icon: FileBarChart },
      { id: 'je-export', label: 'JE Export', to: null, icon: FileOutput, badge: 'Coming Soon' },
      { id: 'advisor-report', label: 'Advisor Report', to: null, icon: FileText, badge: 'Coming Soon' },
      { id: 'audit-support', label: 'Audit Support Package', to: null, icon: ShieldCheck, badge: 'Coming Soon' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin / Setup',
    icon: Settings2,
    defaultOpen: false,
    items: [
      { id: 'reporting-settings', label: 'Reporting Settings', to: '/reporting-settings', icon: Settings },
      { id: 'admin-users', label: 'Admin / Users', to: '/admin', icon: Users, requiresAdmin: true, badge: 'Admin' },
      { id: 'help', label: 'Help Center', to: '/help', icon: HelpCircle },
    ],
  },
]
