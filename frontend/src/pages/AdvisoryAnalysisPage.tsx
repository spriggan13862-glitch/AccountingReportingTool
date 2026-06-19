import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  BarChart3, Download, Loader, ChevronDown, ChevronRight,
  TrendingUp, ClipboardCheck, Building2, Calculator,
} from 'lucide-react'
import { useFormatCurrencyCompact } from '@/hooks/useFormatCurrency'
import { PageLayout } from '@/components/ui/PageLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { WorkspaceCrossLinks } from '@/components/ui/WorkspaceCrossLinks'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { listAdvisorScenarios } from '@/api/advisorScenarios'
import {
  getEBITDABridge,
  getQoESchedule,
  getSBAAddback,
  getDSCR,
  downloadAdvisoryExport,
  type EBITDABridge,
  type QoESchedule,
  type SBAAddbackSchedule,
  type DSCRResult,
  type AdjustmentLineItem,
} from '@/api/advisoryAnalysis'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtAmtFactory() {
  const fmt = useFormatCurrencyCompact()
  return (val: string | null | undefined) => {
    const n = parseFloat(String(val ?? '0'))
    if (isNaN(n)) return '—'
    return fmt(n)
  }
}

function fmtDollarFactory() {
  const fmt = useFormatCurrencyCompact()
  return (val: string | null | undefined) => {
    const n = parseFloat(String(val ?? '0'))
    if (isNaN(n)) return '—'
    return fmt(n)
  }
}

type TabId = 'ebitda' | 'qoe' | 'sba' | 'dscr'

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'ebitda', label: 'EBITDA Bridge', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { id: 'qoe', label: 'QoE Schedule', icon: <ClipboardCheck className="w-3.5 h-3.5" /> },
  { id: 'sba', label: 'SBA Addbacks', icon: <Building2 className="w-3.5 h-3.5" /> },
  { id: 'dscr', label: 'DSCR', icon: <Calculator className="w-3.5 h-3.5" /> },
]

// ---------------------------------------------------------------------------
// Line items table shared by QoE and SBA
// ---------------------------------------------------------------------------

function LineItemsTable({ items, totalLabel, total }: {
  items: AdjustmentLineItem[]
  totalLabel: string
  total: string
}) {
  const fmtAmt = fmtAmtFactory()
  return (
    <div data-testid="line-items-table">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center" data-testid="empty-items">
          <BarChart3 className="w-7 h-7 text-slate-200 mb-2" />
          <p className="text-sm font-medium text-slate-500">No adjustments found</p>
          <p className="text-xs text-slate-400 mt-1">
            Add items to a QoE or SBA package and include it in a scenario.
          </p>
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-3 py-2 font-semibold text-slate-600">JE #</th>
              <th className="text-left px-3 py-2 font-semibold text-slate-600">Date</th>
              <th className="text-left px-3 py-2 font-semibold text-slate-600">Description</th>
              <th className="text-left px-3 py-2 font-semibold text-slate-600">Package</th>
              <th className="text-left px-3 py-2 font-semibold text-slate-600">Category</th>
              <th className="text-right px-3 py-2 font-semibold text-slate-600">EBITDA Impact</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.je_id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-mono text-slate-700">{item.je_number}</td>
                <td className="px-3 py-2 text-slate-500">{item.entry_date}</td>
                <td className="px-3 py-2 text-slate-700 max-w-xs truncate">{item.description}</td>
                <td className="px-3 py-2 text-slate-500">{item.package_name}</td>
                <td className="px-3 py-2 text-slate-400 italic">{item.overlay_group ?? '—'}</td>
                <td className={`px-3 py-2 text-right font-mono font-semibold ${
                  parseFloat(item.ebitda_impact) >= 0 ? 'text-green-700' : 'text-red-600'
                }`}>
                  {fmtAmt(item.ebitda_impact)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 border-t-2 border-slate-300">
              <td colSpan={5} className="px-3 py-2 font-semibold text-slate-700">{totalLabel}</td>
              <td className={`px-3 py-2 text-right font-bold font-mono text-base ${
                parseFloat(total) >= 0 ? 'text-green-700' : 'text-red-600'
              }`}>
                {fmtAmt(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// EBITDA Bridge tab
// ---------------------------------------------------------------------------

function EBITDABridgeTab({ bridge }: { bridge: EBITDABridge }) {
  const fmtAmt = fmtAmtFactory()
  const fmtDollar = fmtDollarFactory()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(cat: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  return (
    <div data-testid="ebitda-bridge-table" className="space-y-1">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-3 py-2 font-semibold text-slate-600 w-8"></th>
            <th className="text-left px-3 py-2 font-semibold text-slate-600">Category / Item</th>
            <th className="text-right px-3 py-2 font-semibold text-slate-600">EBITDA Impact</th>
          </tr>
        </thead>
        <tbody>
          {/* Base EBITDA */}
          <tr className="border-b border-slate-200 bg-slate-50">
            <td className="px-3 py-2"></td>
            <td className="px-3 py-2 font-semibold text-slate-700">Base EBITDA</td>
            <td className="px-3 py-2 text-right font-bold font-mono text-slate-700">
              {fmtDollar(bridge.base_ebitda)}
            </td>
          </tr>

          {bridge.sections.map((section) => (
            <>
              {/* Section header */}
              <tr
                key={`hdr-${section.category}`}
                className="border-b border-slate-100 bg-indigo-50 cursor-pointer hover:bg-indigo-100"
                onClick={() => toggle(section.category)}
              >
                <td className="px-3 py-2 text-indigo-500">
                  {expanded.has(section.category)
                    ? <ChevronDown className="w-3 h-3" />
                    : <ChevronRight className="w-3 h-3" />}
                </td>
                <td className="px-3 py-2 font-semibold text-indigo-700">
                  {section.category}
                  <span className="ml-2 text-[10px] font-normal text-indigo-400">
                    {section.items.length} item{section.items.length !== 1 ? 's' : ''}
                  </span>
                </td>
                <td className={`px-3 py-2 text-right font-bold font-mono ${
                  parseFloat(section.subtotal) >= 0 ? 'text-green-700' : 'text-red-600'
                }`}>
                  {fmtAmt(section.subtotal)}
                </td>
              </tr>

              {/* Expanded line items */}
              {expanded.has(section.category) && section.items.map((item) => (
                <tr key={`item-${item.je_id}`} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 pl-8 text-slate-600">
                    <span className="font-mono text-slate-500 mr-2">{item.je_number}</span>
                    <span className="text-slate-400 mr-2">{item.entry_date}</span>
                    {item.description}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${
                    parseFloat(item.ebitda_impact) >= 0 ? 'text-green-600' : 'text-red-500'
                  }`}>
                    {fmtAmt(item.ebitda_impact)}
                  </td>
                </tr>
              ))}
            </>
          ))}

          {/* Total adjustments */}
          <tr className="border-b border-slate-200 bg-slate-50">
            <td className="px-3 py-2"></td>
            <td className="px-3 py-2 font-semibold text-slate-700">Total Adjustments</td>
            <td className={`px-3 py-2 text-right font-bold font-mono ${
              parseFloat(bridge.total_adjustments) >= 0 ? 'text-green-700' : 'text-red-600'
            }`}>
              {fmtAmt(bridge.total_adjustments)}
            </td>
          </tr>

          {/* Adjusted EBITDA */}
          <tr className="bg-indigo-700">
            <td className="px-3 py-3"></td>
            <td className="px-3 py-3 font-bold text-white text-sm">Adjusted EBITDA</td>
            <td className="px-3 py-3 text-right font-bold font-mono text-white text-sm">
              {fmtDollar(bridge.adjusted_ebitda)}
            </td>
          </tr>
        </tbody>
      </table>

      {bridge.sections.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center" data-testid="empty-bridge">
          <TrendingUp className="w-7 h-7 text-slate-200 mb-2" />
          <p className="text-sm font-medium text-slate-500">No adjustments in selected scenarios</p>
          <p className="text-xs text-slate-400 mt-1">Add packages with adjustments to your scenarios.</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DSCR tab
// ---------------------------------------------------------------------------

function DSCRTab({
  dscr,
  annualDebtService,
  onDebtServiceChange,
}: {
  dscr: DSCRResult | null
  annualDebtService: number
  onDebtServiceChange: (val: number) => void
}) {
  const fmtDollar = fmtDollarFactory()
  const dscrVal = dscr ? parseFloat(dscr.dscr ?? '0') : null
  const coverageColor =
    dscrVal === null ? 'text-slate-500'
    : dscrVal >= 1.25 ? 'text-green-700'
    : dscrVal >= 1.0 ? 'text-amber-600'
    : 'text-red-600'

  return (
    <div data-testid="dscr-panel" className="space-y-6 max-w-lg">
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-slate-700">
          Annual Debt Service ($)
        </label>
        <input
          type="number"
          min={0}
          step={1000}
          value={annualDebtService}
          onChange={(e) => onDebtServiceChange(Number(e.target.value))}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          data-testid="debt-service-input"
          placeholder="e.g. 250000"
        />
        <p className="text-[10px] text-slate-400">
          Enter the total annual principal + interest payments for DSCR calculation.
        </p>
      </div>

      {dscr && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
            <p className="text-xs font-semibold text-slate-700">Debt Service Coverage Ratio</p>
          </div>
          <div className="divide-y divide-slate-100">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-slate-600">Adjusted EBITDA</span>
              <span className="text-xs font-semibold font-mono text-slate-800">
                {fmtDollar(dscr.adjusted_ebitda)}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-slate-600">Annual Debt Service</span>
              <span className="text-xs font-semibold font-mono text-slate-800">
                {fmtDollar(dscr.annual_debt_service)}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 bg-indigo-50">
              <span className="text-sm font-bold text-indigo-700">DSCR</span>
              <span className={`text-2xl font-bold font-mono ${coverageColor}`} data-testid="dscr-value">
                {dscr.dscr !== null ? `${parseFloat(dscr.dscr).toFixed(2)}x` : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-slate-600">Assessment</span>
              <span className={`text-xs font-semibold ${coverageColor}`} data-testid="dscr-coverage-note">
                {dscr.coverage_note}
              </span>
            </div>
          </div>
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200">
            <p className="text-[10px] text-slate-400">
              SBA 7(a) requires minimum DSCR of 1.25x. Calculation: Adjusted EBITDA ÷ Annual Debt Service.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function AdvisoryAnalysisPage() {
  const fmtAmt = fmtAmtFactory()
  const [activeTab, setActiveTab] = useState<TabId>('ebitda')
  const [entityId, setEntityId] = useState<number | ''>('')
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<number[]>([])
  const [baseEbitda, setBaseEbitda] = useState(0)
  const [annualDebtService, setAnnualDebtService] = useState(0)

  const { data: scenarios = [] } = useQuery({
    queryKey: ['advisor-scenarios'],
    queryFn: listAdvisorScenarios,
  })

  const canRun = entityId !== ''

  const ebitdaMut = useMutation({
    mutationFn: () => getEBITDABridge(entityId as number, selectedScenarioIds, baseEbitda),
  })
  const qoeMut = useMutation({
    mutationFn: () => getQoESchedule(entityId as number, selectedScenarioIds),
  })
  const sbaMut = useMutation({
    mutationFn: () => getSBAAddback(entityId as number, selectedScenarioIds),
  })
  const dscrMut = useMutation({
    mutationFn: () => getDSCR(entityId as number, selectedScenarioIds, baseEbitda, annualDebtService),
  })

  function handleRun() {
    if (!canRun) return
    ebitdaMut.mutate()
    qoeMut.mutate()
    sbaMut.mutate()
    dscrMut.mutate()
  }

  const isRunning = ebitdaMut.isPending || qoeMut.isPending || sbaMut.isPending || dscrMut.isPending
  const hasResults = ebitdaMut.data !== undefined

  return (
    <PageLayout title="Advisory Analysis">
      <Breadcrumb
        items={[
          { label: 'Adjustment Workbench', href: '/workbench/adjustment-workspace' },
          { label: 'Advisory Analysis' },
        ]}
      />
      <WorkspaceCrossLinks current="analysis" />

      <div data-testid="advisory-analysis-page" className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-800">Advisory Analysis</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              EBITDA bridge · QoE · SBA addbacks · DSCR
            </p>
          </div>
          {hasResults && (
            <button
              onClick={() =>
                downloadAdvisoryExport(entityId as number, selectedScenarioIds, baseEbitda, annualDebtService)
              }
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors"
              data-testid="export-btn"
            >
              <Download className="w-3.5 h-3.5" /> Export Excel
            </button>
          )}
        </div>

        {/* Controls */}
        <div
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          data-testid="analysis-controls"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                Entity
              </label>
              <EntitySelect
                value={entityId}
                onChange={setEntityId}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                Base EBITDA ($)
              </label>
              <input
                type="number"
                value={baseEbitda}
                onChange={(e) => setBaseEbitda(Number(e.target.value))}
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                data-testid="base-ebitda-input"
                placeholder="0"
              />
            </div>
          </div>

          {/* Scenario selection */}
          {scenarios.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                Scenarios
              </label>
              <div className="flex flex-wrap gap-2">
                {scenarios.map((s) => {
                  const selected = selectedScenarioIds.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      onClick={() =>
                        setSelectedScenarioIds((prev) =>
                          selected ? prev.filter((id) => id !== s.id) : [...prev, s.id],
                        )
                      }
                      className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                        selected
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'
                      }`}
                      data-testid={`scenario-chip-${s.id}`}
                    >
                      {s.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <button
            onClick={handleRun}
            disabled={!canRun || isRunning}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            data-testid="run-analysis-btn"
          >
            {isRunning ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <BarChart3 className="w-3.5 h-3.5" />}
            Run Analysis
          </button>
        </div>

        {/* Tabs + results */}
        {!hasResults ? (
          <div
            className="flex flex-col items-center justify-center py-16 text-center bg-white border border-slate-200 rounded-xl"
            data-testid="configure-state"
          >
            <BarChart3 className="w-10 h-10 text-slate-200 mb-3" />
            <p className="text-sm font-medium text-slate-500">
              Select an entity and run the analysis
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Choose scenarios and click Run Analysis to see the EBITDA bridge, QoE schedule, SBA addbacks, and DSCR.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-slate-200 bg-slate-50" data-testid="analysis-tabs">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  data-testid={`tab-${tab.id}`}
                  className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-indigo-600 text-indigo-700 bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {activeTab === 'ebitda' && ebitdaMut.data && (
                <EBITDABridgeTab bridge={ebitdaMut.data} />
              )}
              {activeTab === 'qoe' && qoeMut.data && (
                <div data-testid="qoe-panel">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-slate-500">
                      {qoeMut.data.count} QoE adjustment{qoeMut.data.count !== 1 ? 's' : ''}
                    </p>
                    <p className={`text-xs font-bold font-mono ${
                      parseFloat(qoeMut.data.total) >= 0 ? 'text-green-700' : 'text-red-600'
                    }`}>
                      Total: {fmtAmt(qoeMut.data.total)}
                    </p>
                  </div>
                  <LineItemsTable
                    items={qoeMut.data.items}
                    totalLabel="QoE Total"
                    total={qoeMut.data.total}
                  />
                </div>
              )}
              {activeTab === 'sba' && sbaMut.data && (
                <div data-testid="sba-panel">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-slate-500">
                      {sbaMut.data.count} SBA addback{sbaMut.data.count !== 1 ? 's' : ''}
                    </p>
                    <p className={`text-xs font-bold font-mono ${
                      parseFloat(sbaMut.data.total) >= 0 ? 'text-green-700' : 'text-red-600'
                    }`}>
                      Total: {fmtAmt(sbaMut.data.total)}
                    </p>
                  </div>
                  <p className="text-[10px] text-slate-400 italic mb-3">{sbaMut.data.note}</p>
                  <LineItemsTable
                    items={sbaMut.data.items}
                    totalLabel="SBA Addback Total"
                    total={sbaMut.data.total}
                  />
                </div>
              )}
              {activeTab === 'dscr' && (
                <DSCRTab
                  dscr={dscrMut.data ?? null}
                  annualDebtService={annualDebtService}
                  onDebtServiceChange={setAnnualDebtService}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  )
}
