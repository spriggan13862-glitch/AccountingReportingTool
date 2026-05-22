import { AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react'
import type { ValidationResult, ImportSummary } from './types'

interface Props {
  summary: ImportSummary
  results: ValidationResult[]
  onEdit?: (rowIndex: number) => void
}

export function ValidationStep({ summary, results, onEdit }: Props) {
  const errors = results.filter((r) => r.severity === 'error')
  const warnings = results.filter((r) => r.severity === 'warning')

  return (
    <div className="flex flex-col gap-4">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3" data-testid="validation-summary">
        <SummaryCard label="Total Rows" value={summary.totalRows} color="gray" />
        <SummaryCard label="Valid" value={summary.validRows} color="green" />
        <SummaryCard label="Errors" value={summary.errorRows} color="red" />
        <SummaryCard label="Warnings" value={summary.warningRows} color="amber" />
      </div>

      {errors.length === 0 && warnings.length === 0 ? (
        <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
          <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-800">All rows valid</p>
            <p className="text-xs text-green-600">{summary.validRows} rows ready to import</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto" data-testid="validation-issues">
          {errors.map((r, i) => (
            <IssueRow key={`e-${i}`} result={r} onEdit={onEdit} />
          ))}
          {warnings.map((r, i) => (
            <IssueRow key={`w-${i}`} result={r} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: 'gray' | 'green' | 'red' | 'amber' }) {
  const colors = {
    gray: 'bg-gray-50 text-gray-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-50 text-amber-700',
  }
  return (
    <div className={`${colors[color]} rounded-lg p-3 text-center`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs mt-0.5">{label}</p>
    </div>
  )
}

function IssueRow({ result, onEdit }: { result: ValidationResult; onEdit?: (row: number) => void }) {
  const isError = result.severity === 'error'
  return (
    <div
      className={`flex items-start gap-3 px-3 py-2 rounded-lg text-sm ${
        isError ? 'bg-red-50 border border-red-100' : 'bg-amber-50 border border-amber-100'
      }`}
    >
      {isError
        ? <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
        : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0">
        <span className={`font-medium ${isError ? 'text-red-700' : 'text-amber-700'}`}>Row {result.rowIndex + 1}</span>
        <span className="text-gray-400 mx-1">·</span>
        <span className="text-gray-500">{result.field}</span>
        <span className="text-gray-400 mx-1">·</span>
        <span className={isError ? 'text-red-600' : 'text-amber-600'}>{result.message}</span>
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={() => onEdit(result.rowIndex)}
          className="text-xs text-indigo-600 hover:underline shrink-0"
        >
          Fix
        </button>
      )}
    </div>
  )
}
