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
      { id: 'dashboard', label: 'Dashboard', to: '/engagement/dashboard', icon: LayoutDashboard, end: true },
      { id: 'engagement-status', label: 'Engagement Status', to: null, icon: Activity, badge: 'Coming Soon' },
    ],
  },
  {
    id: 'client-data',
    label: 'Client Data',
    icon: Database,
    defaultOpen: true,
    items: [
      { id: 'import-center', label: 'Import Center', to: '/client-data/imports', icon: Upload, end: true },
      { id: 'pdf-import', label: 'PDF Statement', to: '/client-data/imports/pdf', icon: FileText },
      { id: 'coa-import', label: 'COA Import', to: '/client-data/imports/coa', icon: FileSpreadsheet },
      { id: 'documents', label: 'Source Documents', to: '/client-data/documents', icon: FolderOpen },
      { id: 'accounts', label: 'Chart of Accounts', to: '/client-data/chart-of-accounts', icon: List },
      { id: 'taxonomy', label: 'Taxonomy Mapping', to: '/client-data/taxonomy-mapping', icon: GitBranch },
      { id: 'entities', label: 'Entities', to: '/client-data/entities', icon: Building2 },
      { id: 'periods', label: 'Periods', to: '/client-data/periods', icon: Calendar, end: true },
    ],
  },
  {
    id: 'workbench',
    label: 'Adjustment Workbench',
    icon: SlidersHorizontal,
    defaultOpen: true,
    items: [
      { id: 'adjustment-bridge', label: 'Adjustment Bridge', to: '/workbench/adjustment-bridge', icon: GitCompare },
      { id: 'journal-entries', label: 'Journal Entries', to: '/workbench/journal-entries', icon: BookOpen },
      { id: 'draft-preview', label: 'Draft Preview', to: '/workbench/draft-preview', icon: Eye },
      { id: 'reclasses', label: 'Reclasses', to: null, icon: ArrowLeftRight, badge: 'Coming Soon' },
      { id: 'accruals', label: 'Accruals', to: null, icon: Clock, badge: 'Coming Soon' },
      { id: 'eliminations', label: 'Eliminations', to: '/workbench/eliminations', icon: GitMerge },
    ],
  },
  {
    id: 'financial-impact',
    label: 'Financial Impact',
    icon: BarChart2,
    defaultOpen: true,
    items: [
      { id: 'trial-balances', label: 'Trial Balance', to: '/financial-impact/trial-balance', icon: TableProperties },
      { id: 'financial-statements', label: 'Financial Statements', to: '/financial-impact/statements', icon: BarChart3 },
      { id: 'fs-builder', label: 'FS Builder', to: '/financial-impact/builder', icon: Wand2 },
      { id: 'comparatives', label: 'Comparatives', to: '/financial-impact/comparatives', icon: TrendingUp },
      { id: 'variance', label: 'Variance Analysis', to: '/financial-impact/variance', icon: TrendingUp },
    ],
  },
  {
    id: 'deliverables',
    label: 'Deliverables',
    icon: Package,
    defaultOpen: false,
    items: [
      { id: 'close-package', label: 'Close Package', to: '/deliverables/close-package', icon: CheckSquare },
      { id: 'workpapers', label: 'Workpapers', to: '/deliverables/workpapers', icon: FolderOpen },
      { id: 'reconciliations', label: 'Reconciliations', to: '/deliverables/reconciliations', icon: GitPullRequest },
      { id: 'report-builder', label: 'Report Builder', to: '/deliverables/report-builder', icon: FileBarChart },
      { id: 'reports', label: 'Reports', to: '/deliverables/reports', icon: FileBarChart },
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
      { id: 'reporting-settings', label: 'Reporting Settings', to: '/setup/settings', icon: Settings },
      { id: 'admin-users', label: 'Admin / Users', to: '/admin', icon: Users, requiresAdmin: true, badge: 'Admin' },
      { id: 'help', label: 'Help Center', to: '/setup/help', icon: HelpCircle },
    ],
  },
]
