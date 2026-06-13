import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  BookOpen,
  CheckCircle,
  ChevronRight,
  FileBarChart,
  Search,
  SlidersHorizontal,
  Upload,
  XCircle,
} from 'lucide-react'
import { reviewApi } from '@/api/review'
import { journalEntriesApi } from '@/api/journalEntries'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { LoadingState } from '@/components/ui/LoadingState'

const WORKSPACES = [
  { label: 'Import', description: 'Upload and map trial balances', to: '/client-data/imports', icon: Upload },
  { label: 'Review', description: 'Comparative statements and checks', to: '/review', icon: Search },
  { label: 'Adjustments', description: 'Draft and post journal entries', to: '/workbench/journal-entries', icon: SlidersHorizontal },
  { label: 'Financial Statements', description: 'View finalized output', to: '/financial-impact/statements', icon: FileBarChart },
]

function ContextPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-800">{value}</p>
    </div>
  )
}

function JeCountCard({ label, count, color, to }: { label: string; count: number; color: string; to: string }) {
  return (
    <Link to={to} className={`rounded-lg border bg-white px-4 py-3 hover:shadow-sm transition-shadow ${color}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-gray-900">{count}</p>
    </Link>
  )
}

export function OverviewPage() {
  const { activeEntity, activePeriod, activeScenarioIds, dataView } = useWorkspace()

  const hasContext = !!activeEntity && !!activePeriod

  const { data: reviewData, isLoading: reviewLoading } = useQuery({
    queryKey: ['overview-checks', activeEntity?.id, activePeriod?.end_date, activeScenarioIds, dataView],
    queryFn: () =>
      reviewApi.getStatements({
        entity_id: activeEntity!.id,
        as_of_date: activePeriod!.end_date,
        scenario_ids: activeScenarioIds,
        data_view: dataView,
        include_checks: true,
      }),
    enabled: hasContext,
    staleTime: 60_000,
  })

  const { data: draftJes } = useQuery({
    queryKey: ['je-count-draft', activeEntity?.id],
    queryFn: () =>
      journalEntriesApi.list({ entity_id: activeEntity!.id, status: 'draft', page_size: 1 }),
    enabled: !!activeEntity,
    staleTime: 30_000,
    select: (items) => items.length,
  })

  const { data: postedJes } = useQuery({
    queryKey: ['je-count-posted', activeEntity?.id],
    queryFn: () =>
      journalEntriesApi.list({ entity_id: activeEntity!.id, status: 'posted', page_size: 1 }),
    enabled: !!activeEntity,
    staleTime: 60_000,
    select: (items) => items.length,
  })

  const checks = reviewData?.checks ?? []
  const failedChecks = checks.filter((c) => !c.passed)
  const passedChecks = checks.filter((c) => c.passed)

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Overview</h1>
        <p className="text-sm text-gray-500 mt-0.5">Active engagement context and status</p>
      </div>

      {/* Context cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ContextPill label="Entity" value={activeEntity ? `${activeEntity.code} — ${activeEntity.name}` : 'None selected'} />
        <ContextPill label="Period" value={activePeriod?.period_name ?? 'None selected'} />
        <ContextPill label="Scenarios" value={activeScenarioIds.length > 0 ? `${activeScenarioIds.length} selected` : 'All'} />
        <ContextPill label="Data View" value={{ as_reported: 'As Reported', adjusted: 'Adjusted', pro_forma: 'Pro Forma' }[dataView]} />
      </div>

      {/* JE counts */}
      {activeEntity && (
        <div>
          <h2 className="text-sm font-semibold text-gray-600 mb-2">Journal Entries</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <JeCountCard
              label="Draft"
              count={draftJes ?? 0}
              color="border-amber-200"
              to={`/workbench/journal-entries?status=draft`}
            />
            <JeCountCard
              label="Posted"
              count={postedJes ?? 0}
              color="border-green-200"
              to={`/workbench/journal-entries?status=posted`}
            />
            <Link
              to="/workbench/journal-entries/new"
              className="rounded-lg border border-dashed border-blue-300 bg-blue-50 px-4 py-3 flex items-center gap-2 hover:bg-blue-100 transition-colors"
            >
              <BookOpen className="h-4 w-4 text-blue-500 shrink-0" />
              <span className="text-sm font-medium text-blue-700">New Journal Entry</span>
            </Link>
          </div>
        </div>
      )}

      {/* Checks panel */}
      {hasContext && (
        <div>
          <h2 className="text-sm font-semibold text-gray-600 mb-2">
            Automated Checks
            {reviewLoading && <span className="ml-2 text-xs text-gray-400 font-normal">Loading…</span>}
          </h2>
          {reviewLoading ? (
            <LoadingState />
          ) : (
            <div className="space-y-2">
              {failedChecks.map((check) => (
                <div key={check.name} className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
                  <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-red-800">{check.name}</p>
                    <p className="text-xs text-red-600 mt-0.5">{check.detail}</p>
                  </div>
                </div>
              ))}
              {passedChecks.map((check) => (
                <div key={check.name} className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2">
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-green-700">{check.name}</p>
                </div>
              ))}
              {checks.length === 0 && (
                <p className="text-xs text-gray-400 italic">No checks available</p>
              )}
            </div>
          )}
        </div>
      )}

      {!hasContext && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Context not set</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Select an entity and period in the context bar above to load checks and balances.
            </p>
          </div>
        </div>
      )}

      {/* Workspace quick links */}
      <div>
        <h2 className="text-sm font-semibold text-gray-600 mb-2">Workspaces</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {WORKSPACES.map(({ label, description, to, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 hover:shadow-sm hover:border-gray-300 transition-all"
            >
              <Icon className="h-5 w-5 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{label}</p>
                <p className="text-xs text-gray-500">{description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
