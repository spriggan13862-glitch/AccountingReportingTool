import type { LucideIcon } from 'lucide-react'
import {
  BarChart2,
  Brain,
  Building2,
  Calendar,
  FileText,
  FolderOpen,
  GitMerge,
  LayoutDashboard,
  Layers,
  Library,
  Link2,
  Map,
  Package,
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
    label: 'Engagement Overview',
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      { id: 'overview', label: 'Overview', to: '/overview', icon: LayoutDashboard, end: true },
    ],
  },
  {
    id: 'client-books',
    label: 'Client Books',
    icon: Upload,
    defaultOpen: true,
    items: [
      { id: 'import', label: 'Import Center', to: '/import', icon: Upload, badgeKey: 'import-unmapped' },
      { id: 'mapping', label: 'Mapping Center', to: '/mapping', icon: Link2 },
    ],
  },
  {
    id: 'review-adjust',
    label: 'Review & Adjust',
    icon: BarChart2,
    defaultOpen: true,
    items: [
      { id: 'statements', label: 'Financial Statements', to: '/statements', icon: BarChart2, end: true },
      { id: 'statements-crl', label: 'By FSLI', to: '/statements/crl', icon: BarChart2 },
      { id: 'bridge', label: 'Bridge', to: '/bridge', icon: TrendingUp },
      { id: 'adjustments', label: 'Adjustment Workbench', to: '/adjustments', icon: SlidersHorizontal, badgeKey: 'draft-je' },
      { id: 'intelligence', label: 'Intelligence', to: '/intelligence', icon: Brain },
      { id: 'consolidation', label: 'Consolidation', to: '/consolidation', icon: Layers },
    ],
  },
  {
    id: 'deliverables',
    label: 'Deliverables',
    icon: Package,
    defaultOpen: false,
    items: [
      { id: 'deliverables', label: 'Packages', to: '/deliverables', icon: Package, end: true },
      { id: 'exports', label: 'Exports', to: '/exports', icon: FileText },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    icon: Settings2,
    defaultOpen: false,
    items: [
      { id: 'admin-entities', label: 'Entities', to: '/admin/entities', icon: Building2 },
      { id: 'admin-periods', label: 'Periods', to: '/admin/periods', icon: Calendar },
      { id: 'admin-documents', label: 'Documents', to: '/admin/documents', icon: FolderOpen },
      { id: 'admin-settings', label: 'Settings', to: '/admin/settings', icon: Settings2 },
      { id: 'taxonomy-library', label: 'Taxonomy Library', to: '/taxonomy/library', icon: Library },
      { id: 'advanced-taxonomy-override', label: 'Advanced Taxonomy Override', to: '/taxonomy/mapping', icon: Map },
    ],
  },
]
