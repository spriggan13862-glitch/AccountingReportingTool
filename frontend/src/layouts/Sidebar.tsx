import { NavLink } from 'react-router-dom'
import { cn } from '@/utils/cn'
import {
  LayoutDashboard,
  Building2,
  BookOpen,
  FileText,
  GitMerge,
  CheckSquare,
  AlertTriangle,
  FilePieChart,
  Paperclip,
  Settings,
  Upload,
  GitPullRequest,
  FolderOpen,
  BarChart2,
  TrendingUp,
  EyeOff,
  Calendar,
  HelpCircle,
  Map,
  ClipboardList,
} from 'lucide-react'

interface NavItem {
  to: string
  label: string
  icon: React.ElementType
  end?: boolean
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: '',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    ],
  },
  {
    label: 'Data Entry',
    items: [
      { to: '/journal-entries', label: 'Journal Entries', icon: BookOpen },
      { to: '/import', label: 'Import Center', icon: Upload },
      { to: '/reconciliations', label: 'Reconciliations', icon: GitPullRequest },
    ],
  },
  {
    label: 'Reporting',
    items: [
      { to: '/financial-statements', label: 'Financial Statements', icon: FileText },
      { to: '/comparative-financials', label: 'Comparative', icon: TrendingUp },
      { to: '/draft-preview', label: 'Draft Preview', icon: EyeOff },
      { to: '/reports', label: 'Reports', icon: FilePieChart },
    ],
  },
  {
    label: 'Close Process',
    items: [
      { to: '/close', label: 'Close Dashboard', icon: ClipboardList },
      { to: '/close/workpapers', label: 'Workpapers', icon: FolderOpen },
      { to: '/variance-analysis', label: 'Variance Analysis', icon: BarChart2 },
    ],
  },
  {
    label: 'Setup',
    items: [
      { to: '/entities', label: 'Entities', icon: Building2 },
      { to: '/periods', label: 'Periods', icon: Calendar },
      { to: '/consolidations', label: 'Consolidations', icon: GitMerge },
      { to: '/documents', label: 'Documents', icon: Paperclip },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/workflow', label: 'Workflow', icon: CheckSquare },
      { to: '/issues', label: 'Issues', icon: AlertTriangle },
      { to: '/help', label: 'Help Center', icon: HelpCircle },
      { to: '/admin', label: 'Admin', icon: Settings },
    ],
  },
]

export function Sidebar() {
  return (
    <aside className="flex h-full w-56 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-14 items-center border-b border-gray-200 px-4">
        <span className="text-sm font-bold tracking-tight text-gray-900">Accounting Tool</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-3">
            {group.label && (
              <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {group.label}
              </p>
            )}
            {group.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  )
}
