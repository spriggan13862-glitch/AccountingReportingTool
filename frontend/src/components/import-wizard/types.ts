export type WizardStepStatus = 'pending' | 'active' | 'complete' | 'error'

export interface WizardStep {
  key: string
  label: string
  status: WizardStepStatus
}

export interface ColumnMapping {
  sourceColumn: string
  targetField: string | null
}

export interface ValidationResult {
  rowIndex: number
  field: string
  message: string
  severity: 'error' | 'warning'
}

export interface ImportSummary {
  totalRows: number
  validRows: number
  errorRows: number
  warningRows: number
  skippedRows: number
}

export interface WizardState<TPreview = Record<string, string>> {
  step: number
  fileName: string | null
  rawHeaders: string[]
  rawRows: TPreview[]
  columnMappings: ColumnMapping[]
  validationResults: ValidationResult[]
  summary: ImportSummary | null
}
