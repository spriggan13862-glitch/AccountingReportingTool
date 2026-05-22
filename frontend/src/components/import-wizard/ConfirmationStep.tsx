import { CheckCircle, Download } from 'lucide-react'
import type { ImportSummary } from './types'

interface Props {
  summary: ImportSummary
  entityName?: string
  importType?: string
  onDownloadLog?: () => void
  children?: React.ReactNode
}

export function ConfirmationStep({ summary, entityName, importType = 'records', onDownloadLog, children }: Props) {
  return (
    <div className="flex flex-col items-center gap-6 py-4" data-testid="confirmation-step">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle className="w-9 h-9 text-green-500" />
      </div>

      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900">Import Complete</h3>
        {entityName && (
          <p className="text-sm text-gray-500 mt-1">Imported into <span className="font-medium">{entityName}</span></p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
        <StatCard label={`${importType} imported`} value={summary.validRows} color="green" />
        <StatCard label="Skipped" value={summary.skippedRows} color="gray" />
        <StatCard label="Errors" value={summary.errorRows} color={summary.errorRows > 0 ? 'red' : 'gray'} />
      </div>

      {children}

      {onDownloadLog && (
        <button
          type="button"
          onClick={onDownloadLog}
          className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800"
        >
          <Download className="w-4 h-4" />
          Download import log
        </button>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: 'green' | 'gray' | 'red' }) {
  const colors = {
    green: 'bg-green-50 text-green-700',
    gray: 'bg-gray-50 text-gray-500',
    red: 'bg-red-50 text-red-700',
  }
  return (
    <div className={`${colors[color]} rounded-lg p-3 text-center`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs mt-0.5">{label}</p>
    </div>
  )
}
