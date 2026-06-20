import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, RefreshCw } from 'lucide-react'
import { consolidationApi, type ConsolidatedStatementsResult } from '@/api/consolidation'
import { entitiesApi } from '@/api/entities'
import { PageLayout } from '@/components/ui/PageLayout'
import type { Entity } from '@/types'

const SECTIONS = ['Assets', 'Liabilities', 'Equity', 'Revenue', 'Expenses']

const fmt = (val: number | undefined) => {
  if (val === undefined || val === 0) return '—'
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function ResultsTable({
  result,
  entityIds,
  entities,
}: {
  result: ConsolidatedStatementsResult
  entityIds: number[]
  entities: Entity[]
}) {
  const entityMap = Object.fromEntries(entities.map((e) => [e.id, e.name]))
  const allLineIds = Array.from(
    new Set([
      ...Object.values(result.entity_balances).flatMap((lb) => Object.keys(lb)),
      ...Object.keys(result.consolidated),
      ...Object.keys(result.eliminated),
    ]),
  )

  if (allLineIds.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        No taxonomy line balances found for the selected entities and period.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-left border-collapse">
        <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
          <tr>
            <th className="px-3 py-2 font-semibold text-gray-600 min-w-[180px]">Taxonomy Line</th>
            {entityIds.map((eid) => (
              <th key={eid} className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">
                {entityMap[eid] ?? `Entity ${eid}`}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-semibold text-amber-700 bg-amber-50 whitespace-nowrap">
              Eliminations
            </th>
            <th className="px-3 py-2 text-right font-semibold text-blue-700 bg-blue-50 whitespace-nowrap">
              Consolidated
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {SECTIONS.map((section) => {
            const sectionLines = allLineIds.filter((_) => true)
            const sectionTotal: Record<string, number> = {}

            return (
              <tr key={`section-${section}`} className="hidden">
                <td>{section}</td>
              </tr>
            )
          })}
          {allLineIds.map((lineId) => {
            const elimBal = result.eliminated[lineId]
            return (
              <tr key={lineId} className="hover:bg-gray-50">
                <td className="px-3 py-1.5 text-gray-700 font-mono text-[11px]">Line {lineId}</td>
                {entityIds.map((eid) => {
                  const bal = result.entity_balances[eid]?.[lineId]
                  return (
                    <td key={eid} className="px-3 py-1.5 text-right font-mono text-gray-700">
                      {fmt(bal)}
                    </td>
                  )
                })}
                <td className="px-3 py-1.5 text-right font-mono text-amber-700 bg-amber-50">
                  {fmt(elimBal)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-semibold text-blue-700 bg-blue-50">
                  {fmt(result.consolidated[lineId])}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
          <tr>
            <td className="px-3 py-2 text-xs text-gray-600 uppercase tracking-wider">Total</td>
            {entityIds.map((eid) => {
              const total = Object.values(result.entity_balances[eid] ?? {}).reduce(
                (s, v) => s + v,
                0,
              )
              return (
                <td key={eid} className="px-3 py-2 text-right font-mono text-gray-800">
                  {fmt(total)}
                </td>
              )
            })}
            <td className="px-3 py-2 text-right font-mono text-amber-700 bg-amber-50">
              {fmt(Object.values(result.eliminated).reduce((s, v) => s + v, 0))}
            </td>
            <td className="px-3 py-2 text-right font-mono text-blue-700 bg-blue-50">
              {fmt(Object.values(result.consolidated).reduce((s, v) => s + v, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export function ConsolidationPage() {
  const [selectedEntityIds, setSelectedEntityIds] = useState<number[]>([])
  const [periodId, setPeriodId] = useState<string>('')
  const [viewId, setViewId] = useState<string>('')
  const [includeEliminations, setIncludeEliminations] = useState(true)
  const [submitted, setSubmitted] = useState(false)

  const entitiesQuery = useQuery({
    queryKey: ['entities'],
    queryFn: () => entitiesApi.list(),
  })

  const entities: Entity[] = entitiesQuery.data ?? []

  const canSubmit = selectedEntityIds.length > 0 && periodId !== '' && viewId !== ''

  const statementsQuery = useQuery({
    queryKey: ['consolidation-statements', selectedEntityIds, periodId, viewId, includeEliminations],
    queryFn: () =>
      consolidationApi.statements({
        entity_ids: selectedEntityIds,
        period_id: parseInt(periodId),
        view_id: parseInt(viewId),
        include_eliminations: includeEliminations,
      }),
    enabled: submitted && canSubmit,
    retry: false,
  })

  const toggleEntity = (id: number) => {
    setSelectedEntityIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
    setSubmitted(false)
  }

  return (
    <PageLayout
      title="Consolidation"
      subtitle="Multi-entity consolidation using per-entity FSLI view mappings"
    >
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">Select Entities *</label>
          {entitiesQuery.isLoading && (
            <p className="text-xs text-gray-400">Loading entities…</p>
          )}
          {!entitiesQuery.isLoading && entities.length === 0 && (
            <p className="text-xs text-gray-400">No entities found.</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {entities.map((entity) => (
              <label
                key={entity.id}
                className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedEntityIds.includes(entity.id)}
                  onChange={() => toggleEntity(entity.id)}
                  className="rounded border-gray-300"
                />
                <span className="truncate">{entity.name}</span>
                {entity.entity_type === 'elimination' && (
                  <span className="text-[10px] text-amber-600 font-medium">(elim)</span>
                )}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Period ID *</label>
            <input
              type="number"
              value={periodId}
              onChange={(e) => { setPeriodId(e.target.value); setSubmitted(false) }}
              placeholder="e.g. 1"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reporting View ID *</label>
            <input
              type="number"
              value={viewId}
              onChange={(e) => { setViewId(e.target.value); setSubmitted(false) }}
              placeholder="e.g. 1"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div className="flex items-center gap-2 pb-0.5">
            <input
              type="checkbox"
              id="include-eliminations"
              checked={includeEliminations}
              onChange={(e) => { setIncludeEliminations(e.target.checked); setSubmitted(false) }}
              className="rounded border-gray-300"
            />
            <label htmlFor="include-eliminations" className="text-sm text-gray-700 cursor-pointer">
              Include eliminations
            </label>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => setSubmitted(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50"
          >
            <ChevronRight className="w-4 h-4" /> Build Consolidated Statements
          </button>
        </div>
      </div>

      {submitted && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 text-sm font-medium text-gray-700">
            Results — {selectedEntityIds.length} entit{selectedEntityIds.length === 1 ? 'y' : 'ies'}
          </div>
          <div className="p-4">
            {statementsQuery.isFetching && (
              <div className="py-10 flex items-center justify-center gap-2 text-gray-400 text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" /> Building consolidated statements…
              </div>
            )}
            {statementsQuery.error && (
              <div className="py-4 text-sm text-rose-600 text-center">
                Failed to build consolidated statements. Check that the period and view IDs are valid.
              </div>
            )}
            {!statementsQuery.isFetching && !statementsQuery.error && statementsQuery.data && (
              <ResultsTable
                result={statementsQuery.data}
                entityIds={selectedEntityIds}
                entities={entities}
              />
            )}
          </div>
        </div>
      )}

      {!submitted && (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-10 text-center text-gray-400 text-sm">
          Select entities, a period, and a reporting view, then click{' '}
          <span className="font-semibold">Build Consolidated Statements</span>.
        </div>
      )}
    </PageLayout>
  )
}
