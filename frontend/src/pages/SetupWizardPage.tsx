import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle, ArrowRight, Building2, Upload, FileSearch, FileCheck, AlertCircle, Rocket, List } from 'lucide-react'
import { useOrg } from '@/providers/OrgProvider'

const STORAGE_KEY = 'setup_wizard_dismissed'

interface StepDef {
  key: string
  icon: React.ReactNode
  title: string
  description: string
  action: string
  route: string
}

const STEPS: StepDef[] = [
  {
    key: 'entity_created',
    icon: <Building2 className="w-5 h-5" />,
    title: 'Create your first entity',
    description: 'Define the legal entities or cost centers you report on.',
    action: 'Go to Entities',
    route: '/entities',
  },
  {
    key: 'coa_uploaded',
    icon: <Upload className="w-5 h-5" />,
    title: 'Upload your Chart of Accounts',
    description: 'Import your QuickBooks or custom COA to define account structure before importing trial balances.',
    action: 'Import COA',
    route: '/coa-import',
  },
  {
    key: 'coa_applied',
    icon: <List className="w-5 h-5" />,
    title: 'Review auto-classification',
    description: 'Verify account types, detail types, and reporting taxonomy assignments.',
    action: 'Review COA',
    route: '/accounts',
  },
  {
    key: 'tb_uploaded',
    icon: <FileCheck className="w-5 h-5" />,
    title: 'Upload a trial balance',
    description: 'Import a trial balance — accounts will auto-map to your COA.',
    action: 'Start Import',
    route: '/import/new',
  },
  {
    key: 'mapping_exceptions_resolved',
    icon: <AlertCircle className="w-5 h-5" />,
    title: 'Resolve mapping exceptions',
    description: 'Handle any accounts that could not be auto-mapped to your COA.',
    action: 'Open Import Center',
    route: '/import',
  },
  {
    key: 'first_report_generated',
    icon: <Rocket className="w-5 h-5" />,
    title: 'Generate your first report',
    description: 'Run a financial statement to verify your data is complete.',
    action: 'Open Reports',
    route: '/financial-statements',
  },
]

export function SetupWizardPage() {
  const navigate = useNavigate()
  const { org } = useOrg()
  const orgId = org?.id ?? 0
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true')

  const { data: status, isLoading } = useQuery({
    queryKey: ['onboarding-status', orgId],
    queryFn: async () => {
      const res = await fetch('/api/v1/setup/onboarding-status')
      if (!res.ok) throw new Error('Failed to load onboarding status')
      return res.json() as Promise<{
        entity_count: number
        active_entity_count: number
        import_batch_count: number
        pending_imports: number
        posted_imports: number
        unmapped_line_count: number
        has_journal_entries: boolean
        coa_batch_count: number
        coa_applied_count: number
        setup_steps_complete: string[]
        setup_progress: number
      }>
    },
    enabled: !!orgId,
  })

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, 'true')
    setDismissed(true)
  }

  if (dismissed) return null

  const complete = status?.setup_steps_complete ?? []
  const progress = status?.setup_progress ?? 0

  const nextStep = STEPS.find((s) => !complete.includes(s.key))

  return (
    <div className="bg-white border border-indigo-100 rounded-xl shadow-sm mb-6 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-base">Getting started</h2>
          <p className="text-indigo-200 text-xs mt-0.5">Complete these steps to activate your accounting platform</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-white text-lg font-bold">{progress}%</p>
            <p className="text-indigo-200 text-xs">{complete.length} of 6 done</p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="text-indigo-200 hover:text-white text-xs underline"
          >
            Dismiss
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-indigo-100">
        <div
          className="h-full bg-indigo-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps */}
      {isLoading ? (
        <p className="px-6 py-4 text-sm text-gray-400">Loading setup status…</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {STEPS.map((step, idx) => {
            const done = complete.includes(step.key)
            const isCurrent = step.key === nextStep?.key
            return (
              <div
                key={step.key}
                className={`flex items-center gap-4 px-6 py-3 ${isCurrent ? 'bg-indigo-50' : done ? 'opacity-60' : ''}`}
              >
                {/* Step number / check */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold
                  ${done ? 'bg-emerald-100 text-emerald-600' : isCurrent ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}
                >
                  {done ? <CheckCircle className="w-5 h-5" /> : <span>{idx + 1}</span>}
                </div>

                {/* Icon */}
                <div className={`flex-shrink-0 ${done ? 'text-emerald-500' : isCurrent ? 'text-indigo-500' : 'text-gray-300'}`}>
                  {step.icon}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${done ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
                    {step.title}
                  </p>
                  {!done && (
                    <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
                  )}
                </div>

                {/* CTA */}
                {isCurrent && (
                  <button
                    type="button"
                    onClick={() => navigate(step.route)}
                    className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 font-medium"
                  >
                    {step.action} <ArrowRight className="w-3 h-3" />
                  </button>
                )}
                {done && (
                  <span className="flex-shrink-0 text-xs text-emerald-600 font-medium">Complete</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Completion banner */}
      {progress === 100 && (
        <div className="px-6 py-3 bg-emerald-50 border-t border-emerald-100 flex items-center justify-between">
          <p className="text-sm text-emerald-700 font-medium">
            Setup complete! Your accounting platform is fully operational.
          </p>
          <button type="button" onClick={dismiss} className="text-xs text-emerald-600 underline">
            Hide this panel
          </button>
        </div>
      )}
    </div>
  )
}
