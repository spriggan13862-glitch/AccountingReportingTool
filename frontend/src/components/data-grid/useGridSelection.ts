import { useState, useCallback, useMemo } from 'react'

export function useGridSelection<T>(
  allData: T[],
  getId: (row: T) => string | number
) {
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set())

  const isSelected = useCallback(
    (row: T) => selectedIds.has(getId(row)),
    [selectedIds, getId]
  )

  // Rows from allData that are currently selected (preserves cross-page selection)
  const selectedRows = useMemo(
    () => allData.filter((row) => selectedIds.has(getId(row))),
    [allData, selectedIds, getId]
  )

  const toggleRow = useCallback(
    (row: T) => {
      const id = getId(row)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    [getId]
  )

  /** Toggle selection for all rows on the current page */
  const togglePage = useCallback(
    (pageRows: T[]) => {
      const allPageSelected = pageRows.every((r) => selectedIds.has(getId(r)))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (allPageSelected) {
          pageRows.forEach((r) => next.delete(getId(r)))
        } else {
          pageRows.forEach((r) => next.add(getId(r)))
        }
        return next
      })
    },
    [selectedIds, getId]
  )

  /** Select all filtered rows (across all pages) */
  const selectAll = useCallback(
    (rows: T[]) => {
      setSelectedIds(new Set(rows.map((r) => getId(r))))
    },
    [getId]
  )

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const isPageAllSelected = useCallback(
    (pageRows: T[]) =>
      pageRows.length > 0 && pageRows.every((r) => selectedIds.has(getId(r))),
    [selectedIds, getId]
  )

  const isPagePartiallySelected = useCallback(
    (pageRows: T[]) =>
      pageRows.some((r) => selectedIds.has(getId(r))) &&
      !pageRows.every((r) => selectedIds.has(getId(r))),
    [selectedIds, getId]
  )

  return {
    selectedIds,
    selectedRows,
    selectionCount: selectedIds.size,
    isSelected,
    toggleRow,
    togglePage,
    selectAll,
    clearSelection,
    isPageAllSelected,
    isPagePartiallySelected,
  }
}
