import { useState } from 'react'
import type { ColumnMapping, ValidationResult } from './types'

interface Props<T extends Record<string, unknown>> {
  rows: T[]
  mappings: ColumnMapping[]
  validationResults: ValidationResult[]
  onRowEdit?: (index: number, field: string, value: string) => void
  renderCell?: (field: string, value: unknown, rowIndex: number) => React.ReactNode
}

export function ReviewStep<T extends Record<string, unknown>>({
  rows,
  mappings,
  validationResults,
  onRowEdit,
  renderCell,
}: Props<T>) {
  const [editingCell, setEditingCell] = useState<{ row: number; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')

  const activeMappings = mappings.filter((m) => m.targetField)
  const errsByRow = new Map<number, ValidationResult[]>()
  for (const r of validationResults) {
    if (!errsByRow.has(r.rowIndex)) errsByRow.set(r.rowIndex, [])
    errsByRow.get(r.rowIndex)!.push(r)
  }

  function startEdit(rowIndex: number, field: string, currentValue: string) {
    if (!onRowEdit) return
    setEditingCell({ row: rowIndex, field })
    setEditValue(currentValue)
  }

  function commitEdit() {
    if (!editingCell || !onRowEdit) return
    onRowEdit(editingCell.row, editingCell.field, editValue)
    setEditingCell(null)
  }

  return (
    <div className="flex flex-col gap-2" data-testid="review-step">
      <p className="text-sm text-gray-600">{rows.length} rows ready for review. Rows with issues are highlighted.</p>
      <div className="overflow-auto max-h-96 border border-gray-200 rounded-lg">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-2 py-2 text-left font-semibold text-gray-500 w-10">#</th>
              {activeMappings.map((m) => (
                <th key={m.targetField} className="px-3 py-2 text-left font-semibold text-gray-500">
                  {m.targetField}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => {
              const rowIssues = errsByRow.get(rowIdx) ?? []
              const hasError = rowIssues.some((r) => r.severity === 'error')
              const hasWarning = rowIssues.some((r) => r.severity === 'warning')
              return (
                <tr
                  key={rowIdx}
                  className={`border-b border-gray-100 ${
                    hasError ? 'bg-red-50' : hasWarning ? 'bg-amber-50' : 'hover:bg-gray-50'
                  }`}
                  data-testid={`review-row-${rowIdx}`}
                >
                  <td className="px-2 py-1.5 text-gray-400">{rowIdx + 1}</td>
                  {activeMappings.map((m) => {
                    const field = m.targetField!
                    const raw = row[m.sourceColumn] as string ?? ''
                    const isEditing = editingCell?.row === rowIdx && editingCell?.field === field
                    const cellIssue = rowIssues.find((r) => r.field === field)
                    return (
                      <td
                        key={field}
                        className={`px-3 py-1.5 ${cellIssue?.severity === 'error' ? 'text-red-700' : cellIssue?.severity === 'warning' ? 'text-amber-700' : ''}`}
                        title={cellIssue?.message}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingCell(null) }}
                            className="border border-indigo-400 rounded px-1 py-0.5 w-full"
                          />
                        ) : renderCell ? (
                          <span onDoubleClick={() => startEdit(rowIdx, field, raw)}>{renderCell(field, raw, rowIdx)}</span>
                        ) : (
                          <span
                            className={onRowEdit ? 'cursor-pointer hover:underline' : ''}
                            onDoubleClick={() => startEdit(rowIdx, field, raw)}
                          >
                            {raw || <span className="text-gray-300 italic">—</span>}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
