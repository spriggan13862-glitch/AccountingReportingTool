import type { ReactNode } from 'react'
import { StepIndicator } from './StepIndicator'
import type { WizardStep } from './types'

interface Props {
  title: string
  steps: WizardStep[]
  currentStep: number
  children: ReactNode
  footer?: ReactNode
}

export function WizardLayout({ title, steps, currentStep, children, footer }: Props) {
  return (
    <div className="flex flex-col gap-0 min-h-0">
      <div className="px-6 pt-6 pb-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
        <StepIndicator steps={steps} currentStep={currentStep} />
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {children}
      </div>

      {footer && (
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
          {footer}
        </div>
      )}
    </div>
  )
}
