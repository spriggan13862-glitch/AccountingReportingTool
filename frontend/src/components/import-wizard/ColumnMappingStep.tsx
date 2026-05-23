import type { ColumnMapping } from './types'

interface TargetField {
  key: string
  label: string
  required?: boolean
  description?: string
}

interface Props {
  rawHeaders: string[]
  targetFields: TargetField[]
  mappings: ColumnMapping[]
  onMappingChange: (sourceColumn: string, targetField: string | null) => void
  previewRows?: Record<string, string>[]
}

export function ColumnMappingStep({ rawHeaders, targetFields, mappings, onMappingChange, previewRows = [] }: Props) {
  const usedTargets = new Set(mappings.map((m) => m.targetField).filter(Boolean))
  const mappingMap = Object.fromEntries(mappings.map((m) => [m.sourceColumn, m.targetField]))

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-600">
        Map your file's columns to the required fields. Required fields are marked with *.
      </p>

      <table className="w-full text-sm border-collapse" data-testid="column-mapping-table">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide w-1/3">Source Column</th>
            <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide w-8">→</th>
            <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Target Field</th>
          </tr>
        </thead>
        <tbody>
          {rawHeaders.map((col) => {
            const currentTarget = mappingMap[col] ?? null
            return (
              <tr key={col} className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">{col}</span>
                  {previewRows[0]?.[col] !== undefined && (
                    <span className="ml-2 text-xs text-gray-400 italic truncate max-w-[120px] inline-block align-middle">
                      e.g. {previewRows[0][col]}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 text-gray-300">→</td>
                <td className="py-2">
                  <select
                    value={currentTarget ?? ''}
                    onChange={(e) => onMappingChange(col, e.target.value || null)}
                    className="border border-gray-300 rounded px-2 py-1 text-sm w-full max-w-xs focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                    data-testid={`mapping-select-${col}`}
                  >
                    <option value="">— skip —</option>
                    {targetFields.map((f) => (
                      <option
                        key={f.key}
                        value={f.key}
                        disabled={usedTargets.has(f.key) && currentTarget !== f.key}
                      >
                        {f.label}{f.required ? ' *' : ''}
                        {usedTargets.has(f.key) && currentTarget !== f.key ? ' (in use)' : ''}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="text-xs text-gray-400">
        {targetFields.filter((f) => f.required && !usedTargets.has(f.key)).length > 0 && (
          <span className="text-amber-600 font-medium">
            Required fields not yet mapped:{' '}
            {targetFields.filter((f) => f.required && !usedTargets.has(f.key)).map((f) => f.label).join(', ')}
          </span>
        )}
      </div>
    </div>
  )
}
