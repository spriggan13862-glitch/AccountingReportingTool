import { useSearchParams } from 'react-router-dom'
import { Building2, Calendar, GitBranch, List, BarChart3, Settings, Layers } from 'lucide-react'
import { EntitiesPage } from './EntitiesPage'
import { PeriodsPage } from './PeriodsPage'
import { ChartOfAccountsPage } from './ChartOfAccountsPage'
import { TaxonomyAdminPage } from './TaxonomyAdminPage'
import { ReportingViewWorkspacePage } from './ReportingViewWorkspacePage'
import { ReportingSettingsPage } from './ReportingSettingsPage'
import { ScenarioManagerPage } from './ScenarioManagerPage'
import { cn } from '@/utils/cn'

const TABS = [
  { id: 'entities',       label: 'Entities',          icon: Building2,  },
  { id: 'periods',        label: 'Periods',            icon: Calendar,   },
  { id: 'scenarios',      label: 'Scenarios',          icon: Layers,     },
  { id: 'coa',            label: 'Chart of Accounts',  icon: List,       },
  { id: 'taxonomy',       label: 'Taxonomy Admin',     icon: GitBranch,  },
  { id: 'reporting-views',label: 'Reporting Views',    icon: BarChart3,  },
  { id: 'settings',       label: 'Settings',           icon: Settings,   },
] as const

type TabId = typeof TABS[number]['id']

export function SetupPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (searchParams.get('tab') ?? 'entities') as TabId

  function setTab(id: TabId) {
    setSearchParams({ tab: id }, { replace: true })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-0 border-b border-slate-200 bg-white px-4 shrink-0">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap',
              tab === id
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
            )}
            data-testid={`setup-tab-${id}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'entities' && <EntitiesPage />}
        {tab === 'periods' && <PeriodsPage />}
        {tab === 'scenarios' && <ScenarioManagerPage />}
        {tab === 'coa' && <ChartOfAccountsPage />}
        {tab === 'taxonomy' && <TaxonomyAdminPage />}
        {tab === 'reporting-views' && <ReportingViewWorkspacePage />}
        {tab === 'settings' && <ReportingSettingsPage />}
      </div>
    </div>
  )
}
