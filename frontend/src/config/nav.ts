import type { LucideIcon } from 'lucide-react'
import {
  BarChart2,
  LayoutDashboard,
  Package,
  Search,
  Settings2,
  SlidersHorizontal,
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
      { id: 'review', label: 'Review Workspace', to: '/review', icon: Search, end: true },
    ],
  },
  {
    id: 'adjustments',
    label: 'Adjustments',
    icon: SlidersHorizontal,
    defaultOpen: true,
    items: [
      { id: 'adjustments', label: 'Adjustments', to: '/adjustments', icon: SlidersHorizontal, end: true, badgeKey: 'draft-je' },
    ],
  },
  {
    id: 'deliverables',
    label: 'Deliverables',
    icon: Package,
    defaultOpen: true,
    items: [
      { id: 'deliverables-workspace', label: 'Deliverables Workspace', to: '/deliverables/workspace', icon: Package, end: true },
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
