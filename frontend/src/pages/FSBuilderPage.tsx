import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageLayout } from '@/components/ui/PageLayout'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { ScenarioSelect } from '@/components/ui/ScenarioSelect'
import { StepIndicator } from '@/components/import-wizard'
import type { WizardStep } from '@/components/import-wizard'
import { TaxonomyTable } from '@/pages/FinancialStatementsPage'
import { reportingApi } from '@/api/reporting'
import { accountsApi } from '@/api/accounts'
import { ChevronRight, FileText, CheckCircle, Printer, AlertTriangle } from 'lucide-react'

type FSBuilderStep = 'entity' | 'taxonomy' | 'period' | 'scenario' | 'accounts' | 'preview'
type PreviewTab = 'bs' | 'is'

const STEPS: { key: FSBuilderStep; label: string }[] = [
  { key: 'entity',   label: 'Entity' },
  { key: 'taxonomy', label: 'Taxonomy' },
  { key: 'period',   label: 'Period' },
  { key: 'scenario', label: 'Scenario' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'preview',  label: 'Preview' },
]

const STEP_KEYS = STEPS.map((s) => s.key)

const TAXONOMY_OPTIONS = [
  { id: 'income_tax', label: 'Income Tax Basis', desc: 'IRS Schedule format with tax line assignments' },
  { id: 'gaap',       label: 'US GAAP',          desc: 'Generally Accepted Accounting Principles' },
  { id: 'cash',       label: 'Cash Basis',        desc: 'Cash receipts and disbursements' },
  { id: 'custom',     label: 'Custom Taxonomy',   desc: 'Define your own reporting structure' },
]

export function FSBuilderPage() {
  const [stepIdx, setStepIdx]     = useState(0)
  const [entityId, setEntityId]   = useState<number | ''>('')
  const [taxonomyId, setTaxonomyId] = useState<string>('income_tax')
  const [period, setPeriod]       = useState<string>('')
  const [scenarioId, setScenarioId] = useState<number | ''>('')
  const [previewTab, setPreviewTab] = useState<PreviewTab>('bs')

  const wizardSteps: WizardStep[] = STEPS.map((s, i) => ({
    key: s.key,
    label: s.label,
    status: i < stepIdx ? 'complete' : i === stepIdx ? 'active' : 'pending',
  }))

  function next() { setStepIdx((v) => Math.min(v + 1, STEPS.length - 1)) }
  function back() { setStepIdx((v) => Math.max(v - 1, 0)) }

  const currentStep = STEP_KEYS[stepIdx]
  const scenarioIds = scenarioId !== '' ? [scenarioId] : []

  // Step 5: accounts mapping summary
  const { data: allAccounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['fs-builder-accounts', entityId],
    queryFn: () => accountsApi.list(entityId as number),
    enabled: currentStep === 'accounts' && entityId !== '',
  })

  const mappingSummary = useMemo(() => {
    const mapped = allAccounts.filter((a) => a.fs_statement)
    const unmapped = allAccounts.filter((a) => !a.fs_statement)
    const byStatement: Record<string, number> = {}
    for (const a of mapped) {
      const key = a.fs_statement ?? 'Unclassified'
      byStatement[key] = (byStatement[key] ?? 0) + 1
    }
    return { mapped: mapped.length, unmapped: unmapped.length, byStatement, total: allAccounts.length }
  }, [allAccounts])

  // Step 6: live FS data
  const { data: bsRows = [], isLoading: bsLoading } = useQuery({
    queryKey: ['fs-builder-bs', entityId, period, scenarioIds],
    queryFn: () => reportingApi.taxonomyBalanceSheet(entityId as number, period, scenarioIds),
    enabled: currentStep === 'preview' && entityId !== '' && period !== '',
  })

  const { data: isRows = [], isLoading: isLoading_ } = useQuery({
    queryKey: ['fs-builder-is', entityId, period, scenarioIds],
    queryFn: () => reportingApi.taxonomyIncomeStatement(entityId as number, period, scenarioIds),
    enabled: currentStep === 'preview' && entityId !== '' && period !== '',
  })

  function handleExportPDF() {
    window.print()
  }

  return (
    <PageLayout
      title="Financial Statement Builder"
      subtitle="Configure and preview a custom financial statement output"
    >
      <StepIndicator
        steps={wizardSteps}
        currentStep={stepIdx}
        onStepClick={(idx) => { if (idx < stepIdx) setStepIdx(idx) }}
      />

      {/* Step: Entity */}
      {currentStep === 'entity' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-800">Step 1 — Select entity</h2>
          <p className="text-xs text-gray-500">Choose the reporting entity for this financial statement.</p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Entity *</label>
            <EntitySelect value={entityId} onChange={setEntityId} />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!entityId}
              onClick={next}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step: Taxonomy */}
      {currentStep === 'taxonomy' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-800">Step 2 — Select reporting taxonomy</h2>
          <p className="text-xs text-gray-500">Choose the taxonomy that defines your financial statement structure.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TAXONOMY_OPTIONS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTaxonomyId(t.id)}
                className={`text-left p-4 border-2 rounded-lg transition-colors ${
                  taxonomyId === t.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <p className="text-sm font-semibold text-gray-800">{t.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>
          <div className="flex justify-between">
            <button type="button" onClick={back} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Back</button>
            <button type="button" onClick={next} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step: Period */}
      {currentStep === 'period' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-800">Step 3 — Select reporting period</h2>
          <p className="text-xs text-gray-500">Choose the period end date for this financial statement.</p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Period end date *</label>
            <input
              type="date"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <p className="text-xs text-gray-400 italic">Period selection from linked periods will be available in a future release.</p>
          <div className="flex justify-between">
            <button type="button" onClick={back} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Back</button>
            <button
              type="button"
              disabled={!period}
              onClick={next}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step: Scenario */}
      {currentStep === 'scenario' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-800">Step 4 — Select scenario</h2>
          <p className="text-xs text-gray-500">Choose which posted scenario to include in this statement.</p>
          <ScenarioSelect
            value={scenarioId}
            onChange={setScenarioId}
            label="Scenario"
            placeholder="All scenarios (no filter)"
          />
          <p className="text-xs text-gray-400 italic">Leave blank to include all posted scenarios. Budget and forecast scenarios pull from the planning module.</p>
          <div className="flex justify-between">
            <button type="button" onClick={back} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Back</button>
            <button type="button" onClick={next} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step: Mapped Accounts */}
      {currentStep === 'accounts' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-800">Step 5 — Account mapping coverage</h2>
          <p className="text-xs text-gray-500">
            Review how many accounts in this entity are mapped to a reporting taxonomy line.
            Unmapped accounts will not appear in the statement.
          </p>
          {accountsLoading ? (
            <div className="py-8 text-center text-sm text-gray-400">Loading accounts…</div>
          ) : mappingSummary.total === 0 ? (
            <div className="border border-gray-200 rounded-lg p-8 text-center text-gray-400 bg-gray-50">
              <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-amber-400" />
              <p className="text-sm">No accounts found for this entity.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
                  <p className="text-2xl font-bold text-gray-800">{mappingSummary.total}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Total Accounts</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-700">{mappingSummary.mapped}</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Mapped</p>
                </div>
                <div className={`rounded-lg border p-4 text-center ${mappingSummary.unmapped > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
                  <p className={`text-2xl font-bold ${mappingSummary.unmapped > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{mappingSummary.unmapped}</p>
                  <p className={`text-xs mt-0.5 ${mappingSummary.unmapped > 0 ? 'text-amber-600' : 'text-gray-400'}`}>Unmapped</p>
                </div>
              </div>
              {Object.keys(mappingSummary.byStatement).length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Statement</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-600">Accounts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {Object.entries(mappingSummary.byStatement).map(([stmt, count]) => (
                        <tr key={stmt}>
                          <td className="px-4 py-2 text-gray-700">{stmt}</td>
                          <td className="px-4 py-2 text-right text-gray-500 font-mono">{count}</td>
                        </tr>
                      ))}
                      {mappingSummary.unmapped > 0 && (
                        <tr>
                          <td className="px-4 py-2 text-amber-600 italic">Unclassified (no FS line)</td>
                          <td className="px-4 py-2 text-right text-amber-600 font-mono">{mappingSummary.unmapped}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {mappingSummary.unmapped > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  {mappingSummary.unmapped} account{mappingSummary.unmapped !== 1 ? 's' : ''} without an FS taxonomy mapping will not appear in the preview. Assign them in the Chart of Accounts.
                </p>
              )}
            </div>
          )}
          <div className="flex justify-between">
            <button type="button" onClick={back} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Back</button>
            <button type="button" onClick={next} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
              Preview Statement <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {currentStep === 'preview' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <h2 className="text-sm font-semibold text-gray-800">Step 6 — Statement preview</h2>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-500 flex flex-wrap gap-x-6 gap-y-1">
            <span><span className="font-medium text-gray-700">Entity:</span> {entityId || '—'}</span>
            <span><span className="font-medium text-gray-700">Taxonomy:</span> {TAXONOMY_OPTIONS.find((t) => t.id === taxonomyId)?.label ?? taxonomyId}</span>
            <span><span className="font-medium text-gray-700">Period:</span> {period || '—'}</span>
            <span><span className="font-medium text-gray-700">Scenario:</span> {scenarioId !== '' ? `#${scenarioId}` : 'All'}</span>
          </div>

          {/* Tab switcher */}
          <div className="flex border-b border-gray-200 gap-0" id="fs-print-area">
            {([['bs', 'Balance Sheet'], ['is', 'Income Statement']] as [PreviewTab, string][]).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setPreviewTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  previewTab === tab
                    ? 'border-blue-500 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="print:block">
            {previewTab === 'bs' && (
              <TaxonomyTable
                rows={bsRows}
                isLoading={bsLoading}
                entityId={entityId}
              />
            )}
            {previewTab === 'is' && (
              <TaxonomyTable
                rows={isRows}
                isLoading={isLoading_}
                entityId={entityId}
              />
            )}
          </div>

          <div className="flex justify-between items-center">
            <button type="button" onClick={back} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Back</button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExportPDF}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                <Printer className="w-4 h-4" /> Print / Export PDF
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-green-600 text-white text-sm rounded opacity-50 cursor-not-allowed"
                disabled
                title="Statement persistence coming in a future release"
              >
                Save Statement
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  )
}
