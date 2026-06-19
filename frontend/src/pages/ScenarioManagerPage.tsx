import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Layers, GitCompare, BarChart3, Plus, Trash2, Download,
  ChevronDown, ChevronRight, Check, X, Loader,
} from 'lucide-react'
import { PageLayout } from '@/components/ui/PageLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { WorkspaceCrossLinks } from '@/components/ui/WorkspaceCrossLinks'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { adjustmentWorkspaceApi, type AdjustmentPackage } from '@/api/adjustmentWorkspace'
import { useFormatCurrencyCompact } from '@/hooks/useFormatCurrency'
import {
  listAdvisorScenarios,
  createAdvisorScenario,
  deleteAdvisorScenario,
  addPackageToScenario,
  removePackageFromScenario,
  togglePackageInScenario,
  compareScenarios,
  downloadScenarioExport,
  ADVISOR_SCENARIO_TYPE_LABELS,
  PACKAGE_TYPE_LABELS,
  type AdvisorScenario,
  type AdvisorScenarioType,
  type ScenarioComparisonResult,
} from '@/api/advisorScenarios'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PACKAGE_TYPE_COLORS: Record<string, string> = {
  audit: 'bg-blue-100 text-blue-700',
  management: 'bg-indigo-100 text-indigo-700',
  tax: 'bg-purple-100 text-purple-700',
  qoe: 'bg-teal-100 text-teal-700',
  sba: 'bg-green-100 text-green-700',
  client_posting: 'bg-slate-100 text-slate-700',
  seller: 'bg-orange-100 text-orange-700',
  buyer: 'bg-amber-100 text-amber-700',
}

const SCENARIO_TYPE_COLORS: Record<string, string> = {
  as_reported: 'bg-slate-100 text-slate-600',
  management: 'bg-indigo-100 text-indigo-700',
  management_tax: 'bg-purple-100 text-purple-700',
  management_tax_qoe: 'bg-violet-100 text-violet-700',
  sba: 'bg-green-100 text-green-700',
  custom: 'bg-amber-100 text-amber-700',
}

const IMPACT_METRICS = [
  { key: 'ni_impact' as const, label: 'Net Income Impact' },
  { key: 'ebitda_impact' as const, label: 'EBITDA Impact' },
  { key: 'asset_impact' as const, label: 'Asset Impact' },
  { key: 'liability_impact' as const, label: 'Liability Impact' },
  { key: 'equity_impact' as const, label: 'Equity Impact' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useFmtImpact() {
  const fmt = useFormatCurrencyCompact()
  return (val: number) => (val >= 0 ? '+' : '') + fmt(val)
}

// ---------------------------------------------------------------------------
// Packages tab
// ---------------------------------------------------------------------------

const PKG_TYPE_OPTIONS = [
  { value: 'audit', label: 'Audit Adjustments' },
  { value: 'management', label: 'Management Adjustments' },
  { value: 'tax', label: 'Tax Adjustments' },
  { value: 'qoe', label: 'QoE Adjustments' },
  { value: 'sba', label: 'SBA Adjustments' },
  { value: 'client_posting', label: 'Client Posting Package' },
]

function PackagesTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('audit')

  const { data: packages = [], isLoading } = useQuery({
    queryKey: ['packages'],
    queryFn: () => adjustmentWorkspaceApi.listPackages(),
  })

  const createMut = useMutation({
    mutationFn: () => adjustmentWorkspaceApi.createPackage({ name: newName, package_type: newType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['packages'] })
      setShowForm(false)
      setNewName('')
      setNewType('audit')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => adjustmentWorkspaceApi.deletePackage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['packages'] }),
  })

  return (
    <div data-testid="packages-panel" className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{packages.length} package{packages.length !== 1 ? 's' : ''}</p>
        <button
          data-testid="create-package-btn"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-3 h-3" /> New Package
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-700">Create Package</p>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Package name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              data-testid="new-package-name"
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              data-testid="new-package-type"
            >
              {PKG_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => newName.trim() && createMut.mutate()}
              disabled={!newName.trim() || createMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              {createMut.isPending ? <Loader className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Create
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader className="w-5 h-5 animate-spin text-indigo-400" />
        </div>
      )}

      {!isLoading && packages.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center" data-testid="empty-packages">
          <Layers className="w-8 h-8 text-slate-200 mb-2" />
          <p className="text-sm font-medium text-slate-500">No packages yet</p>
          <p className="text-xs text-slate-400 mt-1">Create a package to group adjustments for review and delivery.</p>
        </div>
      )}

      <div className="space-y-2">
        {packages.map((pkg) => (
          <div
            key={pkg.id}
            data-testid={`package-row-${pkg.id}`}
            className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-slate-700 truncate">{pkg.name}</p>
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${PACKAGE_TYPE_COLORS[pkg.package_type] ?? 'bg-slate-100 text-slate-600'}`}>
                  {PACKAGE_TYPE_LABELS[pkg.package_type] ?? pkg.package_type}
                </span>
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
                  pkg.status === 'finalized' ? 'bg-green-100 text-green-700'
                  : pkg.status === 'review' ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-500'
                }`}>
                  {pkg.status}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">{pkg.member_count} adjustment{pkg.member_count !== 1 ? 's' : ''}</p>
            </div>
            <button
              onClick={() => deleteMut.mutate(pkg.id)}
              disabled={deleteMut.isPending}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
              title="Delete package"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scenarios tab
// ---------------------------------------------------------------------------

const SCENARIO_TYPE_OPTIONS: Array<{ value: AdvisorScenarioType; label: string }> = [
  { value: 'as_reported', label: 'As Reported' },
  { value: 'management', label: 'Management Adjustments' },
  { value: 'management_tax', label: 'Management + Tax' },
  { value: 'management_tax_qoe', label: 'Management + Tax + QoE' },
  { value: 'sba', label: 'SBA Adjusted' },
  { value: 'custom', label: 'Custom' },
]

function ScenarioPackageToggle({
  scenario,
  packages,
  onToggle,
  onRemove,
  onAdd,
}: {
  scenario: AdvisorScenario
  packages: AdjustmentPackage[]
  onToggle: (pkgId: number, included: boolean) => void
  onRemove: (pkgId: number) => void
  onAdd: (pkgId: number) => void
}) {
  const linkedIds = new Set(scenario.packages.map((p) => p.package_id))
  const unlinkedPackages = packages.filter((p) => !linkedIds.has(p.id))

  return (
    <div className="mt-2 space-y-1.5">
      {scenario.packages.map((sp) => (
        <div key={sp.id} className="flex items-center gap-2 pl-4">
          <button
            onClick={() => onToggle(sp.package_id, !sp.included)}
            className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors ${
              sp.included ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 border border-slate-300'
            }`}
            data-testid={`pkg-toggle-${scenario.id}-${sp.package_id}`}
          >
            {sp.included && <Check className="w-3 h-3" />}
          </button>
          <span className={`text-xs ${sp.included ? 'text-slate-700' : 'text-slate-400 line-through'}`}>
            {sp.package_name}
          </span>
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${PACKAGE_TYPE_COLORS[sp.package_type] ?? 'bg-slate-100 text-slate-600'}`}>
            {PACKAGE_TYPE_LABELS[sp.package_type] ?? sp.package_type}
          </span>
          <button
            onClick={() => onRemove(sp.package_id)}
            className="ml-auto p-1 text-slate-300 hover:text-red-400 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      {unlinkedPackages.length > 0 && (
        <div className="pl-4">
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) onAdd(Number(e.target.value))
              e.target.value = ''
            }}
            className="text-[10px] border border-dashed border-slate-300 rounded-lg px-2 py-1 text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            data-testid={`add-pkg-select-${scenario.id}`}
          >
            <option value="">+ Add package…</option>
            {unlinkedPackages.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

function ScenariosTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<AdvisorScenarioType>('custom')
  const [expanded, setExpanded] = useState<number | null>(null)

  const { data: scenarios = [], isLoading: loadingScenarios } = useQuery({
    queryKey: ['advisor-scenarios'],
    queryFn: listAdvisorScenarios,
  })

  const { data: packages = [] } = useQuery({
    queryKey: ['packages'],
    queryFn: () => adjustmentWorkspaceApi.listPackages(),
  })

  const createMut = useMutation({
    mutationFn: () => createAdvisorScenario({ name: newName, scenario_type: newType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['advisor-scenarios'] })
      setShowForm(false)
      setNewName('')
      setNewType('custom')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteAdvisorScenario(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['advisor-scenarios'] }),
  })

  const toggleMut = useMutation({
    mutationFn: ({ scenId, pkgId, included }: { scenId: number; pkgId: number; included: boolean }) =>
      togglePackageInScenario(scenId, pkgId, included),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['advisor-scenarios'] }),
  })

  const removePkgMut = useMutation({
    mutationFn: ({ scenId, pkgId }: { scenId: number; pkgId: number }) =>
      removePackageFromScenario(scenId, pkgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['advisor-scenarios'] }),
  })

  const addPkgMut = useMutation({
    mutationFn: ({ scenId, pkgId }: { scenId: number; pkgId: number }) =>
      addPackageToScenario(scenId, pkgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['advisor-scenarios'] }),
  })

  return (
    <div data-testid="scenarios-panel" className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{scenarios.length} scenario{scenarios.length !== 1 ? 's' : ''}</p>
        <button
          data-testid="create-scenario-btn"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-3 h-3" /> New Scenario
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-700">Create Comparison Scenario</p>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Scenario name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              data-testid="new-scenario-name"
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as AdvisorScenarioType)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              data-testid="new-scenario-type"
            >
              {SCENARIO_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => newName.trim() && createMut.mutate()}
              disabled={!newName.trim() || createMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              {createMut.isPending ? <Loader className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Create
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        </div>
      )}

      {loadingScenarios && (
        <div className="flex items-center justify-center py-8">
          <Loader className="w-5 h-5 animate-spin text-indigo-400" />
        </div>
      )}

      {!loadingScenarios && scenarios.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center" data-testid="empty-scenarios">
          <GitCompare className="w-8 h-8 text-slate-200 mb-2" />
          <p className="text-sm font-medium text-slate-500">No scenarios yet</p>
          <p className="text-xs text-slate-400 mt-1">Create a comparison scenario to combine adjustment packages.</p>
        </div>
      )}

      <div className="space-y-2">
        {scenarios.map((scen) => (
          <div
            key={scen.id}
            data-testid={`scenario-row-${scen.id}`}
            className="bg-white border border-slate-200 rounded-lg overflow-hidden"
          >
            <div className="flex items-start gap-3 px-4 py-3">
              <button
                onClick={() => setExpanded(expanded === scen.id ? null : scen.id)}
                className="flex-shrink-0 mt-0.5 p-0.5 text-slate-400 hover:text-slate-600"
              >
                {expanded === scen.id
                  ? <ChevronDown className="w-3.5 h-3.5" />
                  : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-semibold text-slate-700">{scen.name}</p>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${SCENARIO_TYPE_COLORS[scen.scenario_type] ?? 'bg-slate-100 text-slate-600'}`}>
                    {ADVISOR_SCENARIO_TYPE_LABELS[scen.scenario_type]}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {scen.packages.filter((p) => p.included).length} package{scen.packages.filter((p) => p.included).length !== 1 ? 's' : ''} included
                </p>
              </div>
              <button
                onClick={() => downloadScenarioExport(scen.id, 0)}
                className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                data-testid={`export-scenario-${scen.id}`}
                title="Export scenario as Excel"
              >
                <Download className="w-3 h-3" /> Export
              </button>
              <button
                onClick={() => deleteMut.mutate(scen.id)}
                className="flex-shrink-0 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {expanded === scen.id && (
              <div className="px-4 pb-3 border-t border-slate-100 pt-2">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Package Composition</p>
                <ScenarioPackageToggle
                  scenario={scen}
                  packages={packages}
                  onToggle={(pkgId, included) => toggleMut.mutate({ scenId: scen.id, pkgId, included })}
                  onRemove={(pkgId) => removePkgMut.mutate({ scenId: scen.id, pkgId })}
                  onAdd={(pkgId) => addPkgMut.mutate({ scenId: scen.id, pkgId })}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Compare tab
// ---------------------------------------------------------------------------

function CompareTab() {
  const [entityId, setEntityId] = useState<number | ''>('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [result, setResult] = useState<ScenarioComparisonResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: scenarios = [] } = useQuery({
    queryKey: ['advisor-scenarios'],
    queryFn: listAdvisorScenarios,
  })

  const fmtImpact = useFmtImpact()

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function runComparison() {
    if (!entityId || selectedIds.size === 0) return
    setLoading(true)
    setError(null)
    try {
      const res = await compareScenarios([...selectedIds], entityId as number)
      setResult(res)
    } catch {
      setError('Comparison failed. Check your selections.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div data-testid="compare-panel" className="space-y-4">
      {/* Controls */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Comparison Settings</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Entity</label>
            <EntitySelect value={entityId} onChange={(v) => setEntityId(v ?? '')} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Scenarios to compare</label>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {scenarios.length === 0 && (
                <p className="text-xs text-slate-400 italic">No scenarios available.</p>
              )}
              {scenarios.map((s) => (
                <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(s.id)}
                    onChange={() => toggleSelect(s.id)}
                    className="rounded border-slate-300 text-indigo-600"
                    data-testid={`compare-check-${s.id}`}
                  />
                  <span className="text-xs text-slate-700">{s.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={runComparison}
          disabled={!entityId || selectedIds.size === 0 || loading}
          data-testid="run-comparison-btn"
          className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <BarChart3 className="w-3.5 h-3.5" />}
          {loading ? 'Comparing…' : 'Compare Scenarios'}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      {/* Empty state before comparison */}
      {!result && !loading && (
        <div className="flex flex-col items-center justify-center py-10 text-center" data-testid="compare-empty">
          <BarChart3 className="w-8 h-8 text-slate-200 mb-2" />
          <p className="text-sm font-medium text-slate-500">No comparison yet</p>
          <p className="text-xs text-slate-400 mt-1">Select an entity and scenarios, then run the comparison.</p>
        </div>
      )}

      {/* Comparison table */}
      {result && result.scenarios.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden" data-testid="impact-table">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Impact Summary</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-2.5 text-slate-500 font-medium w-48">Metric</th>
                  {result.scenarios.map((s) => (
                    <th key={s.scenario_id} className="text-right px-4 py-2.5 text-slate-700 font-semibold">
                      {s.scenario_name}
                      <div className="text-[9px] font-normal text-slate-400 mt-0.5">
                        {s.packages.length > 0 ? s.packages.join(', ') : 'No packages'}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {IMPACT_METRICS.map((metric, ri) => (
                  <tr key={metric.key} className={ri % 2 === 0 ? '' : 'bg-slate-50'}>
                    <td className="px-4 py-2.5 text-slate-600 font-medium">{metric.label}</td>
                    {result.scenarios.map((s) => {
                      const val = Number(s.impact[metric.key] ?? 0)
                      return (
                        <td
                          key={s.scenario_id}
                          className={`px-4 py-2.5 text-right font-mono ${
                            val > 0 ? 'text-green-600' : val < 0 ? 'text-red-600' : 'text-slate-400'
                          }`}
                        >
                          {fmtImpact(val)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type Tab = 'packages' | 'scenarios' | 'compare'

const TABS: Array<{ id: Tab; label: string; icon: typeof Layers }> = [
  { id: 'packages', label: 'Packages', icon: Layers },
  { id: 'scenarios', label: 'Scenarios', icon: GitCompare },
  { id: 'compare', label: 'Compare', icon: BarChart3 },
]

export function ScenarioManagerPage() {
  const [activeTab, setActiveTab] = useState<Tab>('packages')

  return (
    <PageLayout
      title="Scenario Manager"
      subtitle="Group adjustments into packages and compare advisory scenarios"
      breadcrumb={
        <Breadcrumb items={[
          { label: 'Workbench', href: '/workbench/adjustment-workspace' },
          { label: 'Scenario Manager' },
        ]} />
      }
      actions={<WorkspaceCrossLinks current="adjustment" />}
    >
      <div className="space-y-5" data-testid="scenario-manager-page">

        {/* Tab bar */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              data-testid={`tab-${id}`}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === id
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'packages' && <PackagesTab />}
        {activeTab === 'scenarios' && <ScenariosTab />}
        {activeTab === 'compare' && <CompareTab />}

      </div>
    </PageLayout>
  )
}
