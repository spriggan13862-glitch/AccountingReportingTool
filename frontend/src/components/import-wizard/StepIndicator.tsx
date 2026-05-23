import { Check, AlertCircle } from 'lucide-react'
import type { WizardStep } from './types'

interface Props {
  steps: WizardStep[]
  currentStep: number
  onStepClick?: (idx: number) => void
}

export function StepIndicator({ steps, currentStep, onStepClick }: Props) {
  return (
    <nav aria-label="Import progress" className="flex items-center gap-0 mb-6">
      {steps.map((step, idx) => {
        const isActive = idx === currentStep
        const isDone = idx < currentStep || step.status === 'complete'
        const isError = step.status === 'error'
        const isClickable = onStepClick != null && isDone && !isActive

        return (
          <div key={step.key} className="flex items-center">
            {idx > 0 && (
              <div className={`h-px w-8 mx-1 ${isDone ? 'bg-indigo-400' : 'bg-gray-200'}`} />
            )}
            <div
              className={`flex flex-col items-center gap-1 ${isClickable ? 'cursor-pointer group' : ''}`}
              onClick={() => isClickable && onStepClick?.(idx)}
              role={isClickable ? 'button' : undefined}
              tabIndex={isClickable ? 0 : undefined}
              onKeyDown={(e) => { if (isClickable && e.key === 'Enter') onStepClick?.(idx) }}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  isError
                    ? 'bg-red-100 text-red-600 ring-2 ring-red-400'
                    : isDone
                    ? isClickable
                      ? 'bg-indigo-600 text-white group-hover:bg-indigo-500'
                      : 'bg-indigo-600 text-white'
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
                  isActive
                    ? 'text-indigo-700 font-medium'
                    : isDone
                    ? isClickable
                      ? 'text-indigo-600 underline group-hover:text-indigo-800'
                      : 'text-gray-500'
                    : 'text-gray-400'
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
