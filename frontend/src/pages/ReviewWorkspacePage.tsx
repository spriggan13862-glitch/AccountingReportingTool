import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle, XCircle, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { reviewApi, type CheckResult, type VarianceRow } from '@/api/review'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import type { FsLine } from '@/types'

type StatementTab = 'BS' | 'IS' | 'CF'

const TABS: { value: StatementTab; label: string }[] = [
  { value: 'BS', label: 'Balance Sheet' },
  { value: 'IS', label: 'Income Statement' },
  { value: 'CF', label: 'Cash Flow' },
]

function CheckBadge({ check }: { check: CheckResult }) {
  return (
    <div className={`flex items-start gap-2 rounded-md border p-3 ${check.passed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
      {check.passed
        ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
        : <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />}
      <div>
        <p className={`text-xs font-medium ${check.passed ? 'text-green-800' : 'text-red-800'}`}>{check.name}</p>
        <p className={`text-xs mt-0.5 ${check.passed ? 'text-green-600' : 'text-red-600'}`}>{check.detail}</p>
      </div>
    </div>
  )
}

function VarianceTable({
  rows,
  onDrilldown,
}: {
  rows: VarianceRow[]
  onDrilldown?: (code: string) => void
}) {
  if (rows.length === 0) return <p className="text-xs text-gray-400 italic py-4 text-center">No data</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-gray-500">
            <th className="pb-2 text-left font-medium">Line</th>
            <th className="pb-2 text-right font-medium w-28">Prior</th>
            <th className="pb-2 text-right font-medium w-28">Current</th>
            <th className="pb-2 text-right font-medium w-24">$ Change</th>
            <th className="pb-2 text-right font-medium w-20">% Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.code}
              className={`border-b border-gray-50 hover:bg-gray-50 ${row.flag ? 'bg-amber-50' : ''}`}
            >
              <td className="py-1.5">
                <button
                  type="button"
                  className="flex items-center gap-1 text-left hover:text-blue-600 group"
                  onClick={() => onDrilldown?.(row.code)}
                >
                  <span className="font-mono text-gray-400 w-16 shrink-0">{row.code}</span>
                  <span className="text-gray-700 group-hover:text-blue-600">{row.name}</span>
                  <ChevronRight className="h-3 w-3 text-gray-300 group-hover:text-blue-400 shrink-0" />
                </button>
              </td>
              <td className="py-1.5 text-right tabular-nums text-gray-600">{row.prior_balance.toFixed(2)}</td>
              <td className="py-1.5 text-right tabular-nums text-gray-800 font-medium">{row.current_balance.toFixed(2)}</td>
              <td className={`py-1.5 text-right tabular-nums ${row.amount_delta >= 0 ? 'text-gray-700' : 'text-red-600'}`}>
                {row.amount_delta >= 0 ? '+' : ''}{row.amount_delta.toFixed(2)}
              </td>
              <td className={`py-1.5 text-right tabular-nums ${row.flag ? 'font-semibold text-amber-700' : 'text-gray-500'}`}>
                {row.pct_delta != null
                  ? `${row.pct_delta >= 0 ? '+' : ''}${row.pct_delta.toFixed(1)}%`
                  : '—'}
                {row.flag && <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatementTable({ rows }: { rows: FsLine[] }) {
  if (rows.length === 0) return <p className="text-xs text-gray-400 italic py-4 text-center">No data</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-gray-500">
            <th className="pb-2 text-left font-medium">Line</th>
            <th className="pb-2 text-right font-medium w-32">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.line_id} className={`border-b border-gray-50 ${row.is_subtotal ? 'bg-gray-50 font-semibold' : ''}`}>
              <td className={`py-1.5 ${row.parent_line_id ? 'pl-4' : ''}`}>
                <span className="font-mono text-gray-400 w-16 inline-block shrink-0">{row.code}</span>
                <span className="text-gray-700">{row.name}</span>
              </td>
              <td className="py-1.5 text-right tabular-nums text-gray-800">
                {Number(row.display_balance).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ReviewWorkspacePage() {
  const navigate = useNavigate()
  const { activeEntity, activePeriod, activeScenarioIds, dataView } = useWorkspace()
  const [tab, setTab] = useState<StatementTab>('BS')
  const [view, setView] = useState<'variance' | 'current' | 'prior'>('variance')

  const enabled = !!activeEntity && !!activePeriod

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['review-statements', activeEntity?.id, activePeriod?.end_date, activeScenarioIds, dataView, tab],
    queryFn: () =>
      reviewApi.getStatements({
        entity_id: activeEntity!.id,
        as_of_date: activePeriod!.end_date,
        scenario_ids: activeScenarioIds,
        data_view: dataView,
        statement: tab,
        include_checks: true,
      }),
    enabled,
    staleTime: 30_000,
  })

  const varianceRows = data?.variance.filter((r) => r.statement === tab) ?? []
  const currentRows = data?.current.filter((r) => r.statement === tab) ?? []
  const priorRows = data?.prior.filter((r) => r.statement === tab) ?? []
  const checks = data?.checks ?? []
  const failedChecks = checks.filter((c) => !c.passed).length

  function handleDrilldown(code: string) {
    if (!activeEntity) return
    navigate(`/workbench/journal-entries?entity_id=${activeEntity.id}`)
  }

  if (!enabled) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-700">Select an entity and period in the context bar above</p>
          <p className="text-xs text-gray-400 mt-1">Review requires both entity and period to be set</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 gap-4 p-4 lg:p-6">
      {/* Main panel */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Review</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {activeEntity?.code} · {activePeriod?.period_name}
            {failedChecks > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                <XCircle className="h-3 w-3" />{failedChecks} check{failedChecks !== 1 ? 's' : ''} failed
              </span>
            )}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200">
          {TABS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === value
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1 pb-1">
            {(['variance', 'current', 'prior'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded px-2 py-0.5 text-xs font-medium capitalize transition-colors ${
                  view === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {v === 'variance' ? 'Comparison' : v === 'current' ? 'Current' : 'Prior'}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 flex-1 overflow-auto">
          {isLoading && <LoadingState />}
          {isError && <ErrorState message={(error as Error).message} />}
          {data && !isLoading && (
            view === 'variance'
              ? <VarianceTable rows={varianceRows} onDrilldown={handleDrilldown} />
              : view === 'current'
                ? <StatementTable rows={currentRows} />
                : <StatementTable rows={priorRows} />
          )}
        </div>
      </div>

      {/* Right panel — Checks */}
      <div className="w-72 shrink-0 flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Automated Checks</h2>
          <p className="text-xs text-gray-400">Run against current period</p>
        </div>
        <div className="flex flex-col gap-2">
          {isLoading && <p className="text-xs text-gray-400">Loading checks…</p>}
          {checks.length === 0 && !isLoading && (
            <p className="text-xs text-gray-400 italic">No checks available</p>
          )}
          {checks.map((check) => (
            <CheckBadge key={check.name} check={check} />
          ))}
        </div>
      </div>
    </div>
  )
}
