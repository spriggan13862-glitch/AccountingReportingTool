import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { reportingApi } from '@/api/reporting'
import { financialStatementsApi } from '@/api/financialStatements'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { ScenarioSelect } from '@/components/ui/ScenarioSelect'
import { DrilldownPanel } from '@/components/reports/DrilldownPanel'
import type { TaxonomyFsLine, CashFlowSection, CashFlowLine } from '@/types'

type Tab = 'BS' | 'IS' | 'CF'

const fmt = (v: string | number) =>
  parseFloat(String(v)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const isDev = import.meta.env.DEV

// ---------------------------------------------------------------------------
// TaxonomyTable
// ---------------------------------------------------------------------------

function TaxonomyTable({ rows, isLoading, entityId }: { rows: TaxonomyFsLine[]; isLoading: boolean; entityId: number | '' }) {
  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <RefreshCw className="w-5 h-5 text-gray-300 animate-spin mx-auto mb-2" />
        <p className="text-sm text-gray-400">Loading statement…</p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center">
        <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-700 mb-1">No taxonomy lines configured</p>
        <div className="text-xs text-gray-500 max-w-sm mx-auto space-y-1">
          <p>Taxonomy lines are not yet seeded for this installation. This usually resolves automatically when you:</p>
          <ol className="list-decimal list-inside mt-2 space-y-1 text-left">
            <li>Import a Chart of Accounts (COA Import page)</li>
            <li>Or visit the <strong>Reporting Taxonomy</strong> page to initialize lines</li>
            <li>Then click <strong>Inherit Taxonomy</strong> on this page</li>
          </ol>
        </div>
      </div>
    )
  }

  const unmapped = rows.filter((r) => r.account_count === 0 && !r.is_subtotal)
  const allZero = rows.every((r) => parseFloat(r.display_balance) === 0)
  const mappedCount = rows.reduce((s, r) => s + (r.is_subtotal ? 0 : r.account_count), 0)

  return (
    <div>
      {allZero && mappedCount === 0 && (
        <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">No accounts mapped to taxonomy lines.</p>
            <p className="mt-0.5">Import a Chart of Accounts or assign reporting lines on the Chart of Accounts page, then click <strong>Inherit Taxonomy</strong>.</p>
          </div>
        </div>
      )}
      {allZero && mappedCount > 0 && (
        <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Accounts are mapped ({mappedCount}) but all balances are $0.</p>
            <p className="mt-0.5">No posted trial balance data found for this entity and date. Import a trial balance or post journal entries to a scenario first.</p>
          </div>
        </div>
      )}
      {!allZero && unmapped.length > 0 && (
        <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {unmapped.length} taxonomy line{unmapped.length !== 1 ? 's' : ''} have no mapped accounts — run <strong>Inherit Taxonomy</strong> to propagate from parent accounts.
        </div>
      )}

      <table className="w-full text-sm" data-testid="taxonomy-table">
        <tbody>
          {rows.map((row) => {
            const indent = row.hierarchy_depth * 16
            const isHeader = row.hierarchy_depth === 0
            const isSubtotal = row.is_subtotal
            const balance = parseFloat(row.display_balance)
            const isEmpty = balance === 0 && row.account_count === 0

            return (
              <tr
                key={row.taxonomy_id}
                className={
                  isHeader
                    ? 'bg-gray-50 border-t border-b font-semibold'
                    : isSubtotal
                    ? 'border-t font-medium'
                    : isEmpty
                    ? 'text-gray-400'
                    : ''
                }
              >
                <td className="py-1.5" style={{ paddingLeft: `${indent + 12}px` }}>
                  {row.name}
                  {row.account_count > 0 && (
                    <span className="ml-1.5 text-xs text-gray-400">({row.account_count})</span>
                  )}
                </td>
                <td className="py-1.5 text-right tabular-nums pr-4 w-36">
                  {(isHeader && !isSubtotal) ? '' : fmt(row.display_balance)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {unmapped.length > 0 && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
          <strong>{unmapped.length} taxonomy line(s)</strong> have no mapped accounts and show $0.
          Use <strong>Inherit Taxonomy</strong> or assign accounts in the Chart of Accounts page.
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CashFlowStatement
// ---------------------------------------------------------------------------

function CashFlowStatement({ entityId, asOfDate, scenarioIds }: { entityId: number; asOfDate: string; scenarioIds: number[] }) {
  const { data: fsData, isLoading, error } = useQuery({
    queryKey: ['fs-cf', entityId, asOfDate, scenarioIds],
    queryFn: () =>
      financialStatementsApi
        .getCashFlow(entityId, asOfDate, asOfDate, scenarioIds)
        .then((r) => r.data),
    enabled: !!entityId && !!asOfDate,
  })

  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <RefreshCw className="w-5 h-5 text-gray-300 animate-spin mx-auto mb-2" />
        <p className="text-sm text-gray-400">Loading cash flow…</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="py-10 text-center">
        <AlertTriangle className="w-5 h-5 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-500">Failed to load cash flow statement.</p>
        <p className="text-xs text-gray-400 mt-1">Ensure journal entries are posted and periods are configured.</p>
      </div>
    )
  }
  if (!fsData) return null

  function renderSection(section: CashFlowSection) {
    return (
      <div key={section.label} className="mb-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-1 border-b pb-1">{section.label}</h4>
        <table className="w-full text-sm">
          <tbody>
            {section.lines.map((line: CashFlowLine, i: number) => (
              <tr key={i} className={line.is_subtotal ? 'font-medium border-t' : ''}>
                <td className={`py-1 ${!line.is_subtotal ? 'pl-4' : ''}`}>{line.label}</td>
                <td className="py-1 text-right tabular-nums">{fmt(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div>
      {[fsData.operating, fsData.investing, fsData.financing].map(renderSection)}
      <div className="border-t pt-2 font-semibold flex justify-between px-0">
        <span>Net Change in Cash</span>
        <span className="tabular-nums">{fmt(fsData.net_change)}</span>
      </div>
      {fsData.warnings.map((w: string, i: number) => (
        <p key={i} className="text-xs text-amber-600 mt-1">{w}</p>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// InheritFeedback
// ---------------------------------------------------------------------------

interface InheritResult { updated: number; already_set: number; no_ancestor: number }

function InheritFeedback({ data }: { data: InheritResult }) {
  const { updated, already_set, no_ancestor } = data

  if (updated > 0) {
    return (
      <div className="text-xs text-emerald-600 self-end pb-2 font-medium" data-testid="inherit-result">
        ✓ Inherited: {updated} account{updated !== 1 ? 's' : ''} classified
        {already_set > 0 && <span className="text-gray-400 font-normal ml-1">({already_set} already set)</span>}
      </div>
    )
  }

  if (no_ancestor > 0 && updated === 0) {
    return (
      <div className="text-xs text-amber-600 self-end pb-2" data-testid="inherit-result">
        <span className="font-medium">No eligible parent mappings found.</span>
        {' '}{no_ancestor} account{no_ancestor !== 1 ? 's' : ''} have no ancestor with a reporting line.
        Assign reporting lines to parent accounts first, then re-run Inherit.
      </div>
    )
  }

  if (already_set > 0 && updated === 0 && no_ancestor === 0) {
    return (
      <div className="text-xs text-gray-500 self-end pb-2" data-testid="inherit-result">
        ✓ All {already_set} account{already_set !== 1 ? 's' : ''} already have reporting lines — nothing to inherit.
      </div>
    )
  }

  return (
    <div className="text-xs text-gray-400 self-end pb-2" data-testid="inherit-result">
      Inherited: 0 accounts updated
    </div>
  )
}

// ---------------------------------------------------------------------------
// StatementDebugPanel (dev only)
// ---------------------------------------------------------------------------

function StatementDebugPanel({
  entityId, asOfDate, scenarioId, bsRows, isRows,
}: {
  entityId: number | ''; asOfDate: string; scenarioId: number | '';
  bsRows: TaxonomyFsLine[]; isRows: TaxonomyFsLine[];
}) {
  const [open, setOpen] = useState(false)

  const bsUnmapped = bsRows.filter((r) => r.account_count === 0 && !r.is_subtotal).length
  const isUnmapped = isRows.filter((r) => r.account_count === 0 && !r.is_subtotal).length
  const bsTotal = bsRows.reduce((s, r) => s + (r.is_subtotal ? 0 : r.account_count), 0)
  const isTotal = isRows.reduce((s, r) => s + (r.is_subtotal ? 0 : r.account_count), 0)

  return (
    <div className="mt-6 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500" data-testid="debug-panel">
      <button
        className="w-full flex items-center gap-1 px-3 py-2 hover:bg-gray-50"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="font-mono font-semibold text-gray-400 uppercase tracking-wide">Statement Debug</span>
        <span className="ml-auto text-gray-300">dev only</span>
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-1 font-mono border-t border-dashed border-gray-200">
          <p>entity_id: <strong>{entityId || '—'}</strong></p>
          <p>as_of_date: <strong>{asOfDate || '—'}</strong></p>
          <p>scenario_id: <strong>{scenarioId || 'all'}</strong></p>
          <p className="mt-1">BS rows loaded: <strong>{bsRows.length}</strong> | mapped accounts: <strong>{bsTotal}</strong> | unmapped lines: <strong className={bsUnmapped > 0 ? 'text-amber-500' : ''}>{bsUnmapped}</strong></p>
          <p>IS rows loaded: <strong>{isRows.length}</strong> | mapped accounts: <strong>{isTotal}</strong> | unmapped lines: <strong className={isUnmapped > 0 ? 'text-amber-500' : ''}>{isUnmapped}</strong></p>
          <p className="text-gray-300 mt-1">Tip: Run "Inherit Taxonomy" if accounts exist but all balances are $0.</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FinancialStatementsPage
// ---------------------------------------------------------------------------

export function FinancialStatementsPage() {
  const [entityId, setEntityId] = useState<number | ''>('')
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10))
  const [scenarioId, setScenarioId] = useState<number | ''>('')
  const [tab, setTab] = useState<Tab>('BS')
  const [drilldownCode, setDrilldownCode] = useState<string | null>(null)

  const scenarioIds = scenarioId !== '' ? [scenarioId] : []
  const ready = entityId !== '' && !!asOfDate

  const { data: bsRows = [], isLoading: bsLoading } = useQuery({
    queryKey: ['taxonomy-bs', entityId, asOfDate, scenarioIds],
    queryFn: () => reportingApi.taxonomyBalanceSheet(entityId as number, asOfDate, scenarioIds),
    enabled: ready && tab === 'BS',
  })

  const { data: isRows = [], isLoading: isLoading_ } = useQuery({
    queryKey: ['taxonomy-is', entityId, asOfDate, scenarioIds],
    queryFn: () => reportingApi.taxonomyIncomeStatement(entityId as number, asOfDate, scenarioIds),
    enabled: ready && tab === 'IS',
  })

  const inheritMutation = useMutation({
    mutationFn: () => reportingApi.inheritTaxonomy(entityId as number),
  })

  const { data: drilldown } = useQuery({
    queryKey: ['drilldown', entityId, asOfDate, drilldownCode, scenarioIds],
    queryFn: () =>
      financialStatementsApi
        .getDrilldown(entityId as number, asOfDate, scenarioIds, drilldownCode!)
        .then((r) => r.data),
    enabled: !!drilldownCode && ready,
  })

  const handleExport = () => {
    if (!ready) return
    const url = financialStatementsApi.getClosePackageUrl(entityId as number, asOfDate, scenarioIds)
    window.open(url, '_blank')
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'BS', label: 'Balance Sheet' },
    { key: 'IS', label: 'Income Statement' },
    { key: 'CF', label: 'Cash Flow' },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Financial Statements</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Taxonomy-based reporting · {scenarioId === '' ? <span className="text-gray-400">All scenarios</span> : `Scenario ${scenarioId}`}
          </p>
        </div>
        <div className="flex gap-2">
          {ready && (
            <>
              <button
                onClick={() => inheritMutation.mutate()}
                disabled={inheritMutation.isPending}
                className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
                title="Propagate taxonomy classification from parent accounts to children that have none"
              >
                {inheritMutation.isPending ? 'Inheriting…' : 'Inherit Taxonomy'}
              </button>
              <button
                onClick={handleExport}
                className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50"
              >
                Export Close Package
              </button>
            </>
          )}
        </div>
      </div>

      {/* Parameters bar */}
      <div className="bg-white border rounded-lg p-4 mb-5 flex flex-wrap gap-4 items-end">
        <EntitySelect value={entityId} onChange={setEntityId} label="Entity" required />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">As-of Date</label>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <ScenarioSelect
          value={scenarioId}
          onChange={setScenarioId}
          label="Scenario"
          placeholder="All scenarios (default: Actual)"
        />

        {/* Inherit feedback */}
        {inheritMutation.data && <InheritFeedback data={inheritMutation.data as InheritResult} />}
      </div>

      {!ready && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium mb-2">Select an entity and date</p>
          <p className="text-sm">Choose an entity and reporting date to generate financial statements.</p>
        </div>
      )}

      {ready && (
        <div className="bg-white border rounded-lg overflow-hidden">
          {/* Tabs */}
          <div className="border-b flex">
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-5 py-3 text-sm font-medium transition-colors ${
                  tab === key
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
                data-testid={`tab-${key}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {tab === 'BS' && (
              <TaxonomyTable rows={bsRows} isLoading={bsLoading} entityId={entityId} />
            )}
            {tab === 'IS' && (
              <TaxonomyTable rows={isRows} isLoading={isLoading_} entityId={entityId} />
            )}
            {tab === 'CF' && (
              <CashFlowStatement
                entityId={entityId as number}
                asOfDate={asOfDate}
                scenarioIds={scenarioIds}
              />
            )}
          </div>
        </div>
      )}

      {drilldownCode && (
        <DrilldownPanel
          drilldown={drilldown ?? null}
          onClose={() => setDrilldownCode(null)}
        />
      )}

      {isDev && ready && (
        <StatementDebugPanel
          entityId={entityId}
          asOfDate={asOfDate}
          scenarioId={scenarioId}
          bsRows={bsRows}
          isRows={isRows}
        />
      )}
    </div>
  )
}
