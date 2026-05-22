import { useState, useCallback } from 'react'
import type { ColumnMapping, ValidationResult, ImportSummary, WizardState } from './types'

interface UseImportWizardOptions {
  totalSteps: number
}

export function useImportWizard({ totalSteps }: UseImportWizardOptions) {
  const [state, setState] = useState<WizardState>({
    step: 0,
    fileName: null,
    rawHeaders: [],
    rawRows: [],
    columnMappings: [],
    validationResults: [],
    summary: null,
  })

  const next = useCallback(() => {
    setState((s) => ({ ...s, step: Math.min(s.step + 1, totalSteps - 1) }))
  }, [totalSteps])

  const back = useCallback(() => {
    setState((s) => ({ ...s, step: Math.max(s.step - 1, 0) }))
  }, [])

  const goTo = useCallback((step: number) => {
    setState((s) => ({ ...s, step }))
  }, [])

  const reset = useCallback(() => {
    setState({
      step: 0,
      fileName: null,
      rawHeaders: [],
      rawRows: [],
      columnMappings: [],
      validationResults: [],
      summary: null,
    })
  }, [])

  const setFile = useCallback((fileName: string, headers: string[], rows: Record<string, string>[]) => {
    setState((s) => ({
      ...s,
      fileName,
      rawHeaders: headers,
      rawRows: rows,
      columnMappings: headers.map((h) => ({ sourceColumn: h, targetField: null })),
    }))
  }, [])

  const setMapping = useCallback((sourceColumn: string, targetField: string | null) => {
    setState((s) => ({
      ...s,
      columnMappings: s.columnMappings.map((m) =>
        m.sourceColumn === sourceColumn ? { ...m, targetField } : m
      ),
    }))
  }, [])

  const autoMap = useCallback((suggestions: Record<string, string>) => {
    setState((s) => ({
      ...s,
      columnMappings: s.columnMappings.map((m) => ({
        ...m,
        targetField: suggestions[m.sourceColumn] ?? m.targetField,
      })),
    }))
  }, [])

  const setValidation = useCallback((results: ValidationResult[], summary: ImportSummary) => {
    setState((s) => ({ ...s, validationResults: results, summary }))
  }, [])

  const updateRow = useCallback((rowIndex: number, field: string, value: string) => {
    setState((s) => {
      const mapping = s.columnMappings.find((m) => m.targetField === field)
      if (!mapping) return s
      const newRows = [...s.rawRows]
      newRows[rowIndex] = { ...newRows[rowIndex], [mapping.sourceColumn]: value }
      return { ...s, rawRows: newRows }
    })
  }, [])

  return { state, next, back, goTo, reset, setFile, setMapping, autoMap, setValidation, updateRow }
}

export type ImportWizardHandle = ReturnType<typeof useImportWizard>
