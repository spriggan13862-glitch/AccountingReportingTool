import type { LucideIcon } from 'lucide-react'
import {
  BarChart2,
  BookOpen,
  CheckSquare,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Layers,
  Link2,
  Package,
  Search,
  Settings2,
  SlidersHorizontal,
  TrendingUp,
  Upload,
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
  badgeKey?: 'import-unmapped' | 'draft-je'
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
    id: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      { id: 'overview', label: 'Overview', to: '/overview', icon: LayoutDashboard, end: true },
    ],
  },
  {
    id: 'import',
    label: 'Import',
    icon: Upload,
    defaultOpen: true,
    items: [
      { id: 'import-center', label: 'Import Center', to: '/client-data/imports', icon: Upload, badgeKey: 'import-unmapped' },
    ],
  },
  {
    id: 'review',
    label: 'Review',
    icon: Search,
    defaultOpen: true,
    items: [
      { id: 'review', label: 'Statements', to: '/review', icon: BarChart2, end: true },
      { id: 'review-tb', label: 'Trial Balance', to: '/review/trial-balance', icon: FileText },
      { id: 'review-comparatives', label: 'Comparatives', to: '/review/comparatives', icon: TrendingUp },
      { id: 'review-issues', label: 'Issue Library', to: '/review/issues', icon: BookOpen },
    ],
  },
  {
    id: 'adjustments',
    label: 'Adjustments',
    icon: SlidersHorizontal,
    defaultOpen: true,
    items: [
      { id: 'adjustments', label: 'Bridge & AJEs', to: '/adjustments', icon: SlidersHorizontal, end: true, badgeKey: 'draft-je' },
      { id: 'journal-entries', label: 'Journal Entries', to: '/adjustments/journal-entries', icon: FileText },
      { id: 'consolidations', label: 'Consolidations', to: '/adjustments/consolidations', icon: Layers },
    ],
  },
  {
    id: 'deliverables',
    label: 'Deliverables',
    icon: Package,
    defaultOpen: false,
    items: [
      { id: 'deliverables-workspace', label: 'Packages', to: '/deliverables/workspace', icon: Package, end: true },
      { id: 'deliverables-workpapers', label: 'Workpapers', to: '/deliverables/workpapers', icon: FolderOpen },
      { id: 'deliverables-reconciliations', label: 'Reconciliations', to: '/deliverables/reconciliations', icon: Link2 },
      { id: 'deliverables-close', label: 'Close Package', to: '/deliverables/close-package', icon: CheckSquare },
      { id: 'deliverables-reports', label: 'Reports', to: '/deliverables/reports', icon: BarChart2 },
    ],
  },
  {
    id: 'setup',
    label: 'Setup',
    icon: Settings2,
    defaultOpen: false,
    items: [
      { id: 'setup', label: 'Setup', to: '/setup', icon: Settings2 },
    ],
  },
]
