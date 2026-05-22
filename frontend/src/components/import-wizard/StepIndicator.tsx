import { Check, AlertCircle } from 'lucide-react'
import type { WizardStep } from './types'

interface Props {
  steps: WizardStep[]
  currentStep: number
}

export function StepIndicator({ steps, currentStep }: Props) {
  return (
    <nav aria-label="Import progress" className="flex items-center gap-0 mb-6">
      {steps.map((step, idx) => {
        const isActive = idx === currentStep
        const isDone = idx < currentStep || step.status === 'complete'
        const isError = step.status === 'error'

        return (
          <div key={step.key} className="flex items-center">
            {idx > 0 && (
              <div className={`h-px w-8 mx-1 ${isDone ? 'bg-indigo-400' : 'bg-gray-200'}`} />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  isError
                    ? 'bg-red-100 text-red-600 ring-2 ring-red-400'
                    : isDone
                    ? 'bg-indigo-600 text-white'
                    : isActive
                    ? 'bg-white text-indigo-600 ring-2 ring-indigo-500'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {isError ? (
                  <AlertCircle className="w-4 h-4" />
                ) : isDone ? (
                  <Check className="w-4 h-4" />
                ) : (
                  idx + 1
                )}
              </div>
              <span
                className={`text-xs whitespace-nowrap ${
                  isActive ? 'text-indigo-700 font-medium' : isDone ? 'text-gray-500' : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        )
      })}
    </nav>
  )
}
