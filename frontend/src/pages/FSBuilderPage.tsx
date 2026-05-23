import { useState } from 'react'
import { PageLayout } from '@/components/ui/PageLayout'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { StepIndicator } from '@/components/import-wizard'
import type { WizardStep } from '@/components/import-wizard'
import { ChevronRight, FileText, CheckCircle } from 'lucide-react'

type FSBuilderStep = 'entity' | 'taxonomy' | 'period' | 'scenario' | 'accounts' | 'preview'

const STEPS: { key: FSBuilderStep; label: string }[] = [
  { key: 'entity',   label: 'Entity' },
  { key: 'taxonomy', label: 'Taxonomy' },
  { key: 'period',   label: 'Period' },
  { key: 'scenario', label: 'Scenario' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'preview',  label: 'Preview' },
]

const STEP_KEYS = STEPS.map((s) => s.key)

export function FSBuilderPage() {
  const [stepIdx, setStepIdx] = useState(0)
  const [entityId, setEntityId] = useState<number | ''>('')
  const [taxonomyId, setTaxonomyId] = useState<string>('income_tax')
  const [period, setPeriod] = useState<string>('')
  const [scenario, setScenario] = useState<string>('actual')

  const wizardSteps: WizardStep[] = STEPS.map((s, i) => ({
    key: s.key,
    label: s.label,
    status: i < stepIdx ? 'complete' : i === stepIdx ? 'active' : 'pending',
  }))

  function next() { setStepIdx((v) => Math.min(v + 1, STEPS.length - 1)) }
  function back() { setStepIdx((v) => Math.max(v - 1, 0)) }

  const currentStep = STEP_KEYS[stepIdx]

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
            {[
              { id: 'income_tax', label: 'Income Tax Basis', desc: 'IRS Schedule format with tax line assignments' },
              { id: 'gaap', label: 'US GAAP', desc: 'Generally Accepted Accounting Principles' },
              { id: 'cash', label: 'Cash Basis', desc: 'Cash receipts and disbursements' },
              { id: 'custom', label: 'Custom Taxonomy', desc: 'Define your own reporting structure' },
            ].map((t) => (
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
          <p className="text-xs text-gray-500">Choose the period or date range for this financial statement.</p>
          <div className="space-y-3">
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
          </div>
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
          <p className="text-xs text-gray-500">Choose whether to use actual posted amounts, a budget, or a forecast.</p>
          <div className="flex flex-wrap gap-3">
            {['actual', 'budget', 'forecast', 'prior_year'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScenario(s)}
                className={`px-4 py-2 rounded-full text-sm font-medium border capitalize transition-colors ${
                  scenario === s
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 italic">Budget and forecast scenarios will pull from planning module when available.</p>
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
          <h2 className="text-sm font-semibold text-gray-800">Step 5 — Review mapped accounts</h2>
          <p className="text-xs text-gray-500">
            Accounts in the selected entity will be grouped by their reporting taxonomy line.
            Unmapped accounts will appear in an "Unclassified" section.
          </p>
          <div className="border border-gray-200 rounded-lg p-8 text-center text-gray-400 bg-gray-50">
            <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Account mapping preview will load here.</p>
            <p className="text-xs mt-1">Entity, taxonomy, and period must be configured via the API to show live data.</p>
          </div>
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
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <h2 className="text-sm font-semibold text-gray-800">Step 6 — Statement preview</h2>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-500 space-y-1">
            <p><span className="font-medium text-gray-700">Entity:</span> {entityId || '—'}</p>
            <p><span className="font-medium text-gray-700">Taxonomy:</span> {taxonomyId}</p>
            <p><span className="font-medium text-gray-700">Period:</span> {period || '—'}</p>
            <p><span className="font-medium text-gray-700">Scenario:</span> {scenario}</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-8 text-center text-gray-400 bg-gray-50">
            <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Financial statement preview will render here once the reporting engine is connected.</p>
            <p className="text-xs mt-1">Balance Sheet → Income Statement → Cash Flow layout with drill-down by account.</p>
          </div>
          <div className="flex justify-between">
            <button type="button" onClick={back} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Back</button>
            <div className="flex gap-2">
              <button type="button" className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50 opacity-50 cursor-not-allowed" disabled>
                Export PDF
              </button>
              <button type="button" className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 opacity-50 cursor-not-allowed" disabled>
                Save Statement
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  )
}
