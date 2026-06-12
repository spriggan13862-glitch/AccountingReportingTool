/**
 * Adjustment Bridge — pivot/data-cube workpaper (Tier 1.9 skeleton).
 *
 * Dimensions: entity, period, scenario, account_type, taxonomy_category, source
 * Measures: imported_balance, posted_adjustments, draft_adjustments, adjusted_balance, variance
 *
 * Full cube with drag/drop grouping and saved views is Tier 2.
 * This skeleton provides: slicers, filterable table, compute trigger, saved view list.
 */
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart3,
  BookOpen,
  ChevronDown,
  Filter,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'
import { adjustmentBridgeApi } from '@/api/adjustmentBridge'
import type { AdjustmentBridgeRow, AdjustmentBridgeView } from '@/api/adjustmentBridge'
import { PageLayout } from '@/components/ui/PageLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { WorkspaceContextBar } from '@/components/workspace'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { AccountingDataGrid } from '@/components/data-grid'
import { PeriodSelect } from '@/components/ui/PeriodSelect'
import { ScenarioSelect } from '@/components/ui/ScenarioSelect'
import { periodsApi } from '@/api/periods'
import { useOrg } from '@/providers/OrgProvider'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACCOUNT_TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'expense', label: 'Expense' },
]

const GROUP_DIMENSION_OPTIONS = [
  { value: 'account_type', label: 'Account Type' },
  { value: 'taxonomy_category', label: 'Taxonomy Category' },
  { value: 'fs_line', label: 'FS Line' },
  { value: 'adjustment_type', label: 'Adjustment Type' },
  { value: 'source', label: 'Source' },
  { value: 'consolidation_group', label: 'Consolidation Group' },
]

const MEASURE_OPTIONS = [
  { key: 'imported_balance', label: 'Imported Balance' },
  { key: 'posted_adjustments', label: 'Posted Adj.' },
  { key: 'draft_adjustments', label: 'Draft Adj.' },
  { key: 'excluded_adjustments', label: 'Excluded Adj.' },
  { key: 'adjusted_balance', label: 'Adjusted Balance' },
  { key: 'variance', label: 'Variance' },
  { key: 'prior_period_balance', label: 'Prior Period' },
]

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function fmt(v: string | null | undefined): string {
  if (!v) return '—'
  const n = parseFloat(v)
  if (isNaN(n)) return v
  const abs = Math.abs(n)
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n < 0 ? `(${formatted})` : formatted
}

function groupBy<T>(items: T[], key: keyof T): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const item of items) {
    const k = String((item as Record<string, unknown>)[key as string] ?? '(none)')
    if (!out[k]) out[k] = []
    out[k].push(item)
  }
  return out
}

function sumMeasure(rows: AdjustmentBridgeRow[], key: keyof AdjustmentBridgeRow): number {
  return rows.reduce((s, r) => {
    const v = parseFloat(String(r[key] ?? '0'))
    return s + (isNaN(v) ? 0 : v)
  }, 0)
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function SlicerPanel({
  entityId, setEntityId,
  periodId, setPeriodId,
  scenarioId, setScenarioId,
  accountType, setAccountType,
  groupDimension, setGroupDimension,
  columnDimension, setColumnDimension,
  pivotMeasure, setPivotMeasure,
  visibleMeasures, setVisibleMeasures,
  orgId,
}: {
  entityId: number | ''
  setEntityId: (v: number | '') => void
  periodId: number | ''
  setPeriodId: (v: number | '') => void
  scenarioId: number | ''
  setScenarioId: (v: number | '') => void
  accountType: string
  setAccountType: (v: string) => void
  groupDimension: string
  setGroupDimension: (v: string) => void
  columnDimension: string
  setColumnDimension: (v: string) => void
  pivotMeasure: string
  setPivotMeasure: (v: string) => void
  visibleMeasures: string[]
  setVisibleMeasures: (v: string[]) => void
  orgId?: number
}) {
  const [measuresOpen, setMeasuresOpen] = useState(false)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap gap-4 items-end relative z-30">
      <div className="relative z-50">
        <label className="block text-xs font-medium text-gray-600 mb-1">Entity</label>
        <EntitySelect value={entityId} onChange={setEntityId} />
      </div>
      <div className="relative z-50">
        <PeriodSelect
          entityId={entityId}
          value={periodId}
          onChange={setPeriodId}
          label="Period"
        />
      </div>
      <div className="relative z-50">
        <ScenarioSelect
          value={scenarioId}
          onChange={setScenarioId}
          label="Scenario"
          placeholder="All Scenarios"
          organizationId={orgId}
        />
      </div>
      <div className="relative z-40">
        <label className="block text-xs font-medium text-gray-600 mb-1">Account Type</label>
        <select
          value={accountType}
          onChange={(e) => setAccountType(e.target.value)}
          className="text-xs border border-gray-300 rounded px-2 py-1.5 h-[38px] bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
          data-testid="account-type-slicer"
        >
          {ACCOUNT_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="relative z-40">
        <label className="block text-xs font-medium text-gray-600 mb-1">Row By</label>
        <select
          value={groupDimension}
          onChange={(e) => setGroupDimension(e.target.value)}
          className="text-xs border border-gray-300 rounded px-2 py-1.5 h-[38px] bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
          data-testid="group-dimension-select"
        >
          {GROUP_DIMENSION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="relative z-40">
        <label className="block text-xs font-medium text-gray-600 mb-1">Column By</label>
        <select
          value={columnDimension}
          onChange={(e) => setColumnDimension(e.target.value)}
          className="text-xs border border-gray-300 rounded px-2 py-1.5 h-[38px] bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
          data-testid="column-dimension-select"
        >
          <option value="">— none —</option>
          {GROUP_DIMENSION_OPTIONS.filter((o) => o.value !== groupDimension).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {columnDimension && (
        <div className="relative z-40">
          <label className="block text-xs font-medium text-gray-600 mb-1">Pivot Measure</label>
          <select
            value={pivotMeasure}
            onChange={(e) => setPivotMeasure(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1.5 h-[38px] bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
            data-testid="pivot-measure-select"
          >
            {MEASURE_OPTIONS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </div>
      )}
      <div className="relative z-40">
        <label className="block text-xs font-medium text-gray-600 mb-1">Measures</label>
        <button
          type="button"
          onClick={() => setMeasuresOpen(!measuresOpen)}
          className="flex items-center gap-1.5 text-xs font-bold border border-gray-300 rounded px-2 py-1.5 bg-white hover:bg-gray-50 h-[38px]"
        >
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          {visibleMeasures.length} selected
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        </button>
        {measuresOpen && (
          <div className="absolute top-full mt-1 left-0 z-[100] bg-white border border-gray-250 rounded-lg shadow-lg p-2.5 min-w-[180px]">
            {MEASURE_OPTIONS.map((m) => (
              <label key={m.key} className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-700 hover:bg-gray-50 cursor-pointer rounded select-none font-semibold">
                <input
                  type="checkbox"
                  checked={visibleMeasures.includes(m.key)}
                  onChange={(e) => {
                    setVisibleMeasures(
                      e.target.checked
                        ? [...visibleMeasures, m.key]
                        : visibleMeasures.filter((k) => k !== m.key)
                    )
                  }}
                  className="rounded border-slate-350 text-blue-650 focus:ring-blue-550/20"
                />
                {m.label}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SavedViewsPanel({
  entityId,
  activeViewId,
  onActivate,
}: {
  entityId: number
  activeViewId: number | null
  onActivate: (view: AdjustmentBridgeView) => void
}) {
  const qc = useQueryClient()

  const { data: views = [] } = useQuery({
    queryKey: ['ab-views', entityId],
    queryFn: () => adjustmentBridgeApi.listViews(entityId),
    enabled: entityId > 0,
  })

  const deleteMutation = useMutation({
    mutationFn: (viewId: number) => adjustmentBridgeApi.deleteView(viewId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ab-views', entityId] }),
  })

  if (views.length === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <BookOpen className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs font-semibold text-gray-700">Saved Views</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {views.map((v) => (
          <div key={v.id} className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${activeViewId === v.id ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
            <button type="button" onClick={() => onActivate(v)} className="font-medium">
              {v.name}
            </button>
            <button
              type="button"
              onClick={() => deleteMutation.mutate(v.id)}
              className="text-gray-400 hover:text-red-500 transition-colors ml-1"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function AdjustmentBridgePage() {
  const qc = useQueryClient()
  const { org } = useOrg()
  const navigate = useNavigate()

  const [entityId, setEntityId] = useState<number | ''>('')
  const [periodId, setPeriodId] = useState<number | ''>('')
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10))
  const [scenarioId, setScenarioId] = useState<number | ''>('')
  const [accountType, setAccountType] = useState('')
  const [groupDimension, setGroupDimension] = useState<keyof AdjustmentBridgeRow>('account_type')
  const [columnDimension, setColumnDimension] = useState('')
  const [pivotMeasure, setPivotMeasure] = useState('adjusted_balance')
  const [visibleMeasures, setVisibleMeasures] = useState(['imported_balance', 'posted_adjustments', 'adjusted_balance', 'variance'])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [activeViewId, setActiveViewId] = useState<number | null>(null)
  const [saveViewName, setSaveViewName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  const ready = entityId !== '' && !!periodEnd

  const { data: periods = [] } = useQuery({
    queryKey: ['periods-list', entityId],
    queryFn: () => periodsApi.list(entityId as number),
    enabled: !!entityId,
  })

  // Default to first period if none selected
  useEffect(() => {
    if (ready && periods.length > 0 && periodId === '') {
      const sorted = [...periods].sort((a, b) => b.start_date.localeCompare(a.start_date))
      setPeriodId(sorted[0].id)
      setPeriodEnd(sorted[0].end_date)
    }
  }, [periods, ready, periodId])

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['ab-rows', entityId, periodEnd, accountType, scenarioId],
    queryFn: () =>
      adjustmentBridgeApi.rows({
        entity_id: entityId as number,
        period_end: periodEnd,
        account_type: accountType || undefined,
        scenario_id: scenarioId !== '' ? (scenarioId as number) : undefined,
      }),
    enabled: ready,
  })

  const computeMutation = useMutation({
    mutationFn: () => adjustmentBridgeApi.compute(entityId as number, periodEnd, scenarioId !== '' ? (scenarioId as number) : undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ab-rows', entityId, periodEnd, accountType, scenarioId] })
    },
  })

  const saveViewMutation = useMutation({
    mutationFn: () =>
      adjustmentBridgeApi.createView({
        entity_id: entityId as number,
        name: saveViewName,
        row_dimensions: [groupDimension],
        column_dimensions: columnDimension ? [columnDimension] : [],
        visible_measures: visibleMeasures,
        slicer_config: { account_type: accountType, period_end: periodEnd, scenario_id: scenarioId, pivot_measure: pivotMeasure },
      }),
    onSuccess: (view) => {
      qc.invalidateQueries({ queryKey: ['ab-views', entityId as number] })
      setActiveViewId(view.id)
      setShowSaveInput(false)
      setSaveViewName('')
    },
  })

  function activateView(view: AdjustmentBridgeView) {
    setActiveViewId(view.id)
    if (view.row_dimensions?.[0]) setGroupDimension(view.row_dimensions[0] as keyof AdjustmentBridgeRow)
    if (view.column_dimensions?.[0]) setColumnDimension(view.column_dimensions[0])
    else setColumnDimension('')
    if (view.visible_measures) setVisibleMeasures(view.visible_measures)
    if (view.slicer_config) {
      const sc = view.slicer_config as Record<string, string>
      if (sc.account_type !== undefined) setAccountType(sc.account_type)
      if (sc.pivot_measure !== undefined) setPivotMeasure(sc.pivot_measure)
      if (sc.period_end !== undefined) {
        setPeriodEnd(sc.period_end)
        const matched = periods.find(p => p.end_date === sc.period_end)
        if (matched) setPeriodId(matched.id)
      }
      if (sc.scenario_id !== undefined) {
        setScenarioId(sc.scenario_id ? Number(sc.scenario_id) : '')
      }
    }
  }

  function toggleGroup(group: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  const grouped = groupBy(rows, groupDimension)

  const pivotSummaryData = useMemo(() => {
    const summaryRows = Object.entries(grouped).map(([groupName, groupRows]) => {
      const sums: Record<string, number> = {}
      visibleMeasures.forEach((m) => {
        sums[m] = sumMeasure(groupRows, m as keyof AdjustmentBridgeRow)
      })
      return {
        groupName,
        ...sums,
      }
    })

    const grandTotals: Record<string, number> = {}
    visibleMeasures.forEach((m) => {
      grandTotals[m] = sumMeasure(rows, m as keyof AdjustmentBridgeRow)
    })

    return {
      summaryRows,
      grandTotals,
    }
  }, [grouped, rows, visibleMeasures])

  const pivotMatrix = useMemo(() => {
    if (!columnDimension || rows.length === 0) return null
    const rowValues = [...new Set(rows.map((r) => String(r[groupDimension] ?? '(none)')))]
    const colValues = [...new Set(rows.map((r) => String(r[columnDimension as keyof AdjustmentBridgeRow] ?? '(none)')))].sort()
    const matrix: Record<string, Record<string, number>> = {}
    const rowTotals: Record<string, number> = {}
    const colTotals: Record<string, number> = {}
    let grandTotal = 0
    for (const row of rows) {
      const rv = String(row[groupDimension] ?? '(none)')
      const cv = String(row[columnDimension as keyof AdjustmentBridgeRow] ?? '(none)')
      const val = parseFloat(String(row[pivotMeasure as keyof AdjustmentBridgeRow] ?? '0'))
      const safeVal = isNaN(val) ? 0 : val
      if (!matrix[rv]) matrix[rv] = {}
      matrix[rv][cv] = (matrix[rv][cv] ?? 0) + safeVal
      rowTotals[rv] = (rowTotals[rv] ?? 0) + safeVal
      colTotals[cv] = (colTotals[cv] ?? 0) + safeVal
      grandTotal += safeVal
    }
    return { rowValues, colValues, matrix, rowTotals, colTotals, grandTotal }
  }, [rows, groupDimension, columnDimension, pivotMeasure])

  const measureCols = MEASURE_OPTIONS.filter((m) => visibleMeasures.includes(m.key)).map((m) => ({
    key: m.key,
    header: m.label,
    sortable: true,
    sortValue: (r: AdjustmentBridgeRow) => parseFloat(String(r[m.key as keyof AdjustmentBridgeRow] ?? '0')) || 0,
    className: 'text-right font-mono text-xs',
    render: (r: AdjustmentBridgeRow) => (
      <span className={parseFloat(String(r[m.key as keyof AdjustmentBridgeRow] ?? '0')) < 0 ? 'text-red-650 font-semibold' : ''}>
        {fmt(String(r[m.key as keyof AdjustmentBridgeRow] ?? ''))}
      </span>
    ),
  }))

  return (
    <PageLayout
      title="Adjustment Bridge"
      subtitle="Pivot workpaper — imported balances vs. posted/draft adjustments"
      breadcrumb={<Breadcrumb items={[{ label: 'Workbench', href: '/workbench' }, { label: 'Adjustment Bridge' }]} />}
      contextBar={<WorkspaceContextBar />}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/workbench/journal-entries/new')}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
          >
            New Journal Entry
          </button>
          <button
            type="button"
            onClick={() => navigate('/workbench/draft-preview')}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            Draft Preview
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Slicers */}
        <SlicerPanel
          entityId={entityId}
          setEntityId={setEntityId}
          periodId={periodId}
          setPeriodId={(id) => {
            setPeriodId(id)
            const p = periods.find(x => x.id === id)
            if (p) setPeriodEnd(p.end_date)
          }}
          scenarioId={scenarioId}
          setScenarioId={setScenarioId}
          accountType={accountType}
          setAccountType={setAccountType}
          groupDimension={groupDimension as string}
          setGroupDimension={(v) => setGroupDimension(v as keyof AdjustmentBridgeRow)}
          columnDimension={columnDimension}
          setColumnDimension={setColumnDimension}
          pivotMeasure={pivotMeasure}
          setPivotMeasure={setPivotMeasure}
          visibleMeasures={visibleMeasures}
          setVisibleMeasures={setVisibleMeasures}
          orgId={org?.id}
        />

        {/* Saved views */}
        {entityId !== '' && (
          <SavedViewsPanel
            entityId={entityId as number}
            activeViewId={activeViewId}
            onActivate={activateView}
          />
        )}

        {/* Actions bar */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!ready || computeMutation.isPending}
            onClick={() => computeMutation.mutate()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            data-testid="compute-bridge-btn"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${computeMutation.isPending ? 'animate-spin' : ''}`} />
            {computeMutation.isPending ? 'Computing…' : 'Compute / Refresh'}
          </button>
          {computeMutation.isSuccess && (
            <span className="text-xs text-green-600 font-medium">
              ✓ {computeMutation.data?.rows_computed} rows computed
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            {showSaveInput ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={saveViewName}
                  onChange={(e) => setSaveViewName(e.target.value)}
                  placeholder="View name…"
                  className="text-xs border border-gray-300 rounded px-2 py-1.5 w-36"
                  data-testid="save-view-name-input"
                  onKeyDown={(e) => { if (e.key === 'Enter' && saveViewName.trim()) saveViewMutation.mutate() }}
                />
                <button
                  type="button"
                  disabled={!saveViewName.trim() || saveViewMutation.isPending}
                  onClick={() => saveViewMutation.mutate()}
                  className="text-xs px-2 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Save
                </button>
                <button type="button" onClick={() => setShowSaveInput(false)} className="text-xs text-gray-500 hover:text-gray-700">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowSaveInput(true)}
                className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50"
                data-testid="save-view-btn"
              >
                <Save className="w-3.5 h-3.5" />
                Save View
              </button>
            )}
          </div>
        </div>

        {/* Pivot Summary Table — 2D when column dimension set, 1D otherwise */}
        {ready && rows.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs mb-4">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                {pivotMatrix ? '2D Pivot Table' : 'Pivot Summary Table'}
              </h3>
              <span className="text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                {pivotMatrix ? `${MEASURE_OPTIONS.find(m => m.key === pivotMeasure)?.label ?? pivotMeasure}` : 'Pivot View'}
              </span>
            </div>
            <div className="overflow-x-auto">
              {pivotMatrix ? (
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2 text-left">
                        {GROUP_DIMENSION_OPTIONS.find(o => o.value === groupDimension)?.label || groupDimension}
                        {' '}<span className="text-slate-300 font-normal normal-case">↓</span>
                        {' / '}{GROUP_DIMENSION_OPTIONS.find(o => o.value === columnDimension)?.label || columnDimension}
                        {' '}<span className="text-slate-300 font-normal normal-case">→</span>
                      </th>
                      {pivotMatrix.colValues.map((cv) => (
                        <th key={cv} className="px-4 py-2 text-right capitalize">{cv}</th>
                      ))}
                      <th className="px-4 py-2 text-right bg-slate-50/50 text-slate-700">Row Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pivotMatrix.rowValues.map((rv) => (
                      <tr key={rv} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2 font-bold text-slate-750 capitalize">{rv}</td>
                        {pivotMatrix.colValues.map((cv) => {
                          const val = pivotMatrix.matrix[rv]?.[cv] ?? 0
                          return (
                            <td key={cv} className={`px-4 py-2 text-right font-mono ${val !== 0 ? (val < 0 ? 'text-red-650 font-semibold' : 'text-slate-650 font-semibold') : 'text-slate-300'}`}>
                              {val !== 0 ? fmt(val.toString()) : '—'}
                            </td>
                          )
                        })}
                        <td className="px-4 py-2 text-right font-mono font-bold text-slate-800 bg-slate-50/50">
                          {fmt((pivotMatrix.rowTotals[rv] ?? 0).toString())}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50/80 border-t-2 border-slate-250 font-extrabold text-slate-900">
                      <td className="px-4 py-2.5">Col Totals</td>
                      {pivotMatrix.colValues.map((cv) => {
                        const val = pivotMatrix.colTotals[cv] ?? 0
                        return (
                          <td key={cv} className={`px-4 py-2.5 text-right font-mono ${val < 0 ? 'text-red-650' : 'text-slate-900'}`}>
                            {fmt(val.toString())}
                          </td>
                        )
                      })}
                      <td className="px-4 py-2.5 text-right font-mono bg-indigo-50 text-indigo-900 font-black">
                        {fmt(pivotMatrix.grandTotal.toString())}
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2 text-left capitalize">
                        {GROUP_DIMENSION_OPTIONS.find(o => o.value === groupDimension)?.label || groupDimension}
                      </th>
                      {MEASURE_OPTIONS.filter(m => visibleMeasures.includes(m.key)).map(m => (
                        <th key={m.key} className="px-4 py-2 text-right">{m.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pivotSummaryData.summaryRows.map((row) => (
                      <tr key={row.groupName} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2 font-bold text-slate-750 capitalize">{row.groupName}</td>
                        {MEASURE_OPTIONS.filter(m => visibleMeasures.includes(m.key)).map(m => {
                          const val = row[m.key] as number || 0
                          return (
                            <td key={m.key} className={`px-4 py-2 text-right font-mono ${val < 0 ? 'text-red-650 font-semibold' : 'text-slate-650 font-semibold'}`}>
                              {fmt(val.toString())}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                    <tr className="bg-slate-50/80 border-t-2 border-slate-250 font-extrabold text-slate-900">
                      <td className="px-4 py-2.5">Grand Total</td>
                      {MEASURE_OPTIONS.filter(m => visibleMeasures.includes(m.key)).map(m => {
                        const val = pivotSummaryData.grandTotals[m.key] || 0
                        return (
                          <td key={m.key} className={`px-4 py-2.5 text-right font-mono ${val < 0 ? 'text-red-650' : 'text-slate-900'}`}>
                            {fmt(val.toString())}
                          </td>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Cube grid */}
        {!ready ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <BarChart3 className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500 font-medium">Select entity and period to load the Adjustment Bridge</p>
            <p className="text-xs text-gray-400 mt-1">Then click <strong>Compute / Refresh</strong> to build the cube from your chart of accounts and journal entries.</p>
          </div>
        ) : isLoading ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <BarChart3 className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500 font-medium">No rows found</p>
            <p className="text-xs text-gray-400 mt-1">Click <strong>Compute / Refresh</strong> to build rows from your chart of accounts and journal entries.</p>
            <button
              type="button"
              onClick={() => computeMutation.mutate()}
              className="mt-3 px-4 py-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Compute Bridge
            </button>
          </div>
        ) : (
          <div className="space-y-2" data-testid="adjustment-bridge-grid">
            {Object.entries(grouped).map(([group, groupRows]) => {
              const isExpanded = expandedGroups.has(group)
              const totalAdjusted = sumMeasure(groupRows, 'adjusted_balance')
              const totalImported = sumMeasure(groupRows, 'imported_balance')
              const totalVariance = sumMeasure(groupRows, 'variance')

              return (
                <div key={group} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    className="w-full px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2 hover:bg-gray-100 text-left"
                    data-testid={`ab-group-${group}`}
                  >
                    <span className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>›</span>
                    <span className="text-xs font-semibold text-gray-700 capitalize">{group}</span>
                    <span className="text-xs text-gray-400 ml-1">({groupRows.length} accounts)</span>
                    <span className="ml-auto flex items-center gap-6 text-xs font-mono">
                      {visibleMeasures.includes('imported_balance') && (
                        <span className="text-gray-500">Imported: {fmt(String(totalImported))}</span>
                      )}
                      {visibleMeasures.includes('adjusted_balance') && (
                        <span className="text-gray-700 font-semibold">Adjusted: {fmt(String(totalAdjusted))}</span>
                      )}
                      {visibleMeasures.includes('variance') && (
                        <span className={totalVariance !== 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                          Var: {fmt(String(totalVariance))}
                        </span>
                      )}
                    </span>
                  </button>

                  {isExpanded && (
                    <AccountingDataGrid
                      columns={[
                        {
                          key: 'account_number',
                          header: 'Acct #',
                          sortable: true,
                          sortValue: (r) => r.account_number ?? '',
                          className: 'font-mono text-xs',
                          render: (r) => <span>{r.account_number ?? '—'}</span>,
                        },
                        {
                          key: 'account_name',
                          header: 'Account',
                          sortable: true,
                          sortValue: (r) => r.account_name ?? '',
                          render: (r) => <span>{r.account_name ?? '—'}</span>,
                        },
                        {
                          key: 'taxonomy_category',
                          header: 'Taxonomy',
                          sortable: true,
                          sortValue: (r) => r.taxonomy_category ?? '',
                          className: 'text-xs text-indigo-600 font-mono',
                          render: (r) => <span>{r.taxonomy_category ?? '—'}</span>,
                        },
                        ...measureCols,
                      ]}
                      data={groupRows}
                      rowKey={(r) => r.id}
                      selectionEnabled={false}
                      pageSize={50}
                      exportFilename={`adjustment_bridge_${group}`}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="text-xs text-gray-400 text-center py-2">
          Adjustment Bridge — set Column By for 2D pivot. Multi-period comparison and Excel export coming in a future release.
        </div>
      </div>
    </PageLayout>
  )
}
