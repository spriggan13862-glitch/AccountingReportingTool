import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react'
import { periodGovernanceApi } from '@/api/periodGovernance'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { PeriodSelect } from '@/components/ui/PeriodSelect'
import { ScenarioSelect } from '@/components/ui/ScenarioSelect'
import { useOrg } from '@/providers/OrgProvider'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import type { ComparativeReport, ComparativeLine } from '@/types'

function makeFmt(fmtCurrency: (v: number | null | undefined) => string) {
  return (v: string | number | null | undefined) => {
    if (v == null) return '—'
    const val = typeof v === 'string' ? parseFloat(v) : v
    return isNaN(val) ? '—' : fmtCurrency(val)
  }
}

function varianceIcon(line: ComparativeLine) {
  const v = parseFloat(line.amount_variance)
  if (v > 0) return <TrendingUp className="w-3.5 h-3.5 text-green-600" />
  if (v < 0) return <TrendingDown className="w-3.5 h-3.5 text-red-600" />
  return <Minus className="w-3.5 h-3.5 text-gray-400" />
}

function fmtPct(val: string | null) {
  if (val === null) return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

const REPORT_TYPES = [
  { value: 'income_statement', label: 'Income Statement' },
  { value: 'balance_sheet', label: 'Balance Sheet' },
]

export function ComparativeFinancialsPage() {
  const { org } = useOrg()
  const fmtCurrency = useFormatCurrency()
  const fmt = makeFmt(fmtCurrency)
  const [entityId, setEntityId] = useState<number | ''>('')
  const [currentPeriodId, setCurrentPeriodId] = useState<number | ''>('')
  const [comparisonPeriodId, setComparisonPeriodId] = useState<number | ''>('')
  const [scenarioId, setScenarioId] = useState<number | ''>('')
  const [reportType, setReportType] = useState('income_statement')
  const [materiality, setMateriality] = useState('1000')
  const [submitted, setSubmitted] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const { data: report, isFetching, refetch } = useQuery<ComparativeReport>({
    queryKey: ['comparative-report', entityId, currentPeriodId, comparisonPeriodId, reportType, scenarioId, materiality],
    queryFn: () => periodGovernanceApi.buildComparativeReport({
      entity_id: Number(entityId),
      current_period_id: Number(currentPeriodId),
      comparison_period_id: Number(comparisonPeriodId),
      report_type: reportType,
      scenario_id: scenarioId !== '' ? scenarioId : undefined,
      materiality_threshold: materiality,
    }),
    enabled: submitted && !!entityId && !!currentPeriodId && !!comparisonPeriodId,
    retry: false,
  })

  const canRun = !!entityId && !!currentPeriodId && !!comparisonPeriodId

  function reset() { setSubmitted(false) }

  return (
    <PageLayout
      title="Comparative Financials"
      subtitle="Period-over-period variance analysis"
    >
      {apiError && <ErrorBanner message={apiError} />}

      {/* Parameters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Report Parameters</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <EntitySelect
            label="Entity"
            value={entityId}
            onChange={(id) => { setEntityId(id); setCurrentPeriodId(''); setComparisonPeriodId(''); reset() }}
            required
          />
          <PeriodSelect
            label="Current Period"
            entityId={entityId}
            value={currentPeriodId}
            onChange={(id) => { setCurrentPeriodId(id); reset() }}
            required
          />
          <PeriodSelect
            label="Comparison Period"
            entityId={entityId}
            value={comparisonPeriodId}
            onChange={(id) => { setComparisonPeriodId(id); reset() }}
            required
          />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Report Type</label>
            <select value={reportType} onChange={(e) => { setReportType(e.target.value); reset() }}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
              {REPORT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <ScenarioSelect
            label="Scenario (optional)"
            value={scenarioId}
            onChange={(id) => { setScenarioId(id); reset() }}
            placeholder="All scenarios"
          />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Materiality Threshold ($)</label>
            <input type="number" value={materiality} onChange={(e) => setMateriality(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
          </div>
        </div>
        <button
          type="button"
          disabled={!canRun || isFetching}
          onClick={() => { setSubmitted(true); setApiError(null); refetch() }}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          {isFetching ? 'Generating…' : 'Generate Report'}
        </button>
      </div>

      {report && (
        <>
          {/* Header */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-indigo-900 capitalize">
                  {report.report_type.replace(/_/g, ' ')}
                </h2>
                <p className="text-xs text-indigo-700 mt-0.5">
                  {report.current_period_name} vs {report.comparison_period_name}
                </p>
              </div>
              <div className="text-right">
                {report.material_variances_count > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {report.material_variances_count} material variance{report.material_variances_count !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Sections */}
          {report.sections.map((section) => (
            <div key={section.section} className="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <div className="grid grid-cols-5 gap-2 text-xs font-semibold text-gray-500 uppercase">
                  <div className="col-span-2">{section.section}</div>
                  <div className="text-right">{report.current_period_name}</div>
                  <div className="text-right">{report.comparison_period_name}</div>
                  <div className="text-right">Variance</div>
                </div>
              </div>
              <div className="divide-y divide-gray-50">
                {section.lines.map((line) => (
                  <div
                    key={line.account_id}
                    className={`grid grid-cols-5 gap-2 px-4 py-2 text-sm ${line.is_material ? 'bg-orange-50' : ''}`}
                  >
                    <div className="col-span-2">
                      <span className="text-gray-500 text-xs mr-2">{line.account_number}</span>
                      <span className={line.is_material ? 'font-medium text-gray-800' : 'text-gray-700'}>
                        {line.account_name}
                      </span>
                      {line.is_material && <AlertTriangle className="inline w-3 h-3 text-orange-500 ml-1" />}
                    </div>
                    <div className="text-right tabular-nums text-gray-700">{fmt(line.current_amount)}</div>
                    <div className="text-right tabular-nums text-gray-500">{fmt(line.prior_amount)}</div>
                    <div className="text-right tabular-nums flex items-center justify-end gap-1">
                      {varianceIcon(line)}
                      <span className={parseFloat(line.amount_variance) < 0 ? 'text-red-600' : parseFloat(line.amount_variance) > 0 ? 'text-green-700' : 'text-gray-400'}>
                        {fmt(line.amount_variance)}
                      </span>
                      {line.pct_variance && (
                        <span className="text-xs text-gray-400 ml-1">({fmtPct(line.pct_variance)})</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {/* Section totals */}
              <div className="bg-gray-50 border-t border-gray-200 px-4 py-2">
                <div className="grid grid-cols-5 gap-2 text-sm font-semibold">
                  <div className="col-span-2 text-gray-700">Total {section.section}</div>
                  <div className="text-right tabular-nums">{fmt(section.current_total)}</div>
                  <div className="text-right tabular-nums text-gray-500">{fmt(section.prior_total)}</div>
                  <div className="text-right tabular-nums">
                    <span className={parseFloat(section.variance_total) < 0 ? 'text-red-600' : 'text-green-700'}>
                      {fmt(section.variance_total)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <p className="text-xs text-gray-400 text-right mt-2">Generated: {new Date(report.generated_at).toLocaleString()}</p>
        </>
      )}
    </PageLayout>
  )
}
