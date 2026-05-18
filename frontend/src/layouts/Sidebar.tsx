import { NavLink } from 'react-router-dom'
import { cn } from '@/utils/cn'
import {
  LayoutDashboard,
  Building2,
  BookOpen,
  BarChart2,
  FileText,
  GitMerge,
  CheckSquare,
  AlertTriangle,
  FilePieChart,
  Paperclip,
  Settings,
} from 'lucide-react'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/entities', label: 'Entities', icon: Building2 },
  { to: '/journal-entries', label: 'Journal Entries', icon: BookOpen },
  { to: '/trial-balances', label: 'Trial Balances', icon: BarChart2 },
  { to: '/financial-statements', label: 'Financial Statements', icon: FileText },
  { to: '/consolidations', label: 'Consolidations', icon: GitMerge },
  { to: '/workflow', label: 'Workflow', icon: CheckSquare },
  { to: '/issues', label: 'Issues', icon: AlertTriangle },
  { to: '/reports', label: 'Reports', icon: FilePieChart },
  { to: '/documents', label: 'Documents', icon: Paperclip },
  { to: '/admin', label: 'Admin', icon: Settings },
]

export function Sidebar() {
  return (
    <aside className="flex h-full w-56 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-14 items-center border-b border-gray-200 px-4">
        <span className="text-sm font-bold tracking-tight text-gray-900">Accounting Tool</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
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
      </nav>
    </aside>
  )
}
