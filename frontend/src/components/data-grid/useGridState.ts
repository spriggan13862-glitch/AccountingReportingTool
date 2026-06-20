import { useState, useMemo, useCallback } from 'react'
import type { GridColumn, GridState, SortDir, GridDensity, ColumnFilterMode } from './types'

const PAGE_SIZES = [10, 25, 50, 100, 250]
export { PAGE_SIZES }

export function useGridState<T>(
  columns: GridColumn<T>[],
  data: T[],
  options: { initialPageSize?: number; initialDensity?: GridDensity } = {}
) {
  const { initialPageSize = 50, initialDensity = 'normal' } = options

  const [state, setState] = useState<GridState>({
    search: '',
    sortKey: null,
    sortDir: null,
    page: 1,
    pageSize: initialPageSize,
    density: initialDensity,
    hiddenColumns: new Set(),
    columnFilters: {},
    columnFilterModes: {},
    columnFilterMin: {},
    columnFilterMax: {},
    columnFilterChecklists: {},
  })

  // Filtered rows (global search + per-column filters)
  const filtered = useMemo(() => {
    let rows = data

    if (state.search.trim()) {
      const q = state.search.toLowerCase()
      rows = rows.filter((row) =>
        columns.some((col) => {
          const text = col.filterValue
            ? col.filterValue(row)
            : String(col.sortValue?.(row) ?? '')
          return text.toLowerCase().includes(q)
        })
      )
    }

    const allFilterKeys = new Set([
      ...Object.keys(state.columnFilters),
      ...Object.keys(state.columnFilterModes),
      ...Object.keys(state.columnFilterMin),
      ...Object.keys(state.columnFilterMax),
      ...Object.keys(state.columnFilterChecklists),
    ])

    for (const key of allFilterKeys) {
      const col = columns.find((c) => c.key === key)
      if (!col) continue
      const mode = state.columnFilterModes[key] ?? 'contains'
      const value = state.columnFilters[key] ?? ''
      const min = state.columnFilterMin[key] ?? ''
      const max = state.columnFilterMax[key] ?? ''

      if (mode === 'blank' || mode === 'nonblank') {
        rows = rows.filter((row) => {
          const text = col.filterValue
            ? col.filterValue(row)
            : String(col.sortValue?.(row) ?? '')
          const isEmpty = !text.trim()
          return mode === 'blank' ? isEmpty : !isEmpty
        })
      } else if (value.trim()) {
        const q = value.toLowerCase()
        rows = rows.filter((row) => {
          const text = col.filterValue
            ? col.filterValue(row)
            : String(col.sortValue?.(row) ?? '')
          return text.toLowerCase().includes(q)
        })
      }

      if (min.trim() || max.trim()) {
        rows = rows.filter((row) => {
          const raw = col.sortValue?.(row)
          const num = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''))
          if (isNaN(num)) return true
          if (min.trim() && num < parseFloat(min)) return false
          if (max.trim() && num > parseFloat(max)) return false
          return true
        })
      }

      const checklist = state.columnFilterChecklists[key]
      if (checklist && checklist.length > 0) {
        rows = rows.filter((row) => {
          const text = col.filterValue
            ? col.filterValue(row)
            : String(col.sortValue?.(row) ?? '')
          return checklist.includes(text)
        })
      }
    }

    return rows
  }, [data, state.search, state.columnFilters, state.columnFilterChecklists, columns])

  // Sorted rows
  const sorted = useMemo(() => {
    if (!state.sortKey || !state.sortDir) return filtered
    const col = columns.find((c) => c.key === state.sortKey)
    if (!col?.sortValue) return filtered
    return [...filtered].sort((a, b) => {
      const va = col.sortValue!(a) ?? ''
      const vb = col.sortValue!(b) ?? ''
      const cmp =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb))
      return state.sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, state.sortKey, state.sortDir, columns])

  // Paginated rows
  const totalPages = Math.max(1, Math.ceil(sorted.length / state.pageSize))
  const safePage = Math.min(state.page, totalPages)
  const paged = sorted.slice(
    (safePage - 1) * state.pageSize,
    safePage * state.pageSize
  )

  // Visible columns
  const visibleColumns = useMemo(
    () => columns.filter((c) => !state.hiddenColumns.has(c.key)),
    [columns, state.hiddenColumns]
  )

  // Setters
  const setSearch = useCallback(
    (search: string) => setState((s) => ({ ...s, search, page: 1 })),
    []
  )

  const setSort = useCallback((key: string) => {
    setState((s) => {
      if (s.sortKey === key) {
        if (s.sortDir === 'asc') return { ...s, sortDir: 'desc' as SortDir, page: 1 }
        if (s.sortDir === 'desc') return { ...s, sortKey: null, sortDir: null, page: 1 }
      }
      return { ...s, sortKey: key, sortDir: 'asc' as SortDir, page: 1 }
    })
  }, [])

  const setPage = useCallback(
    (page: number) => setState((s) => ({ ...s, page })),
    []
  )

  const setPageSize = useCallback(
    (pageSize: number) => setState((s) => ({ ...s, pageSize, page: 1 })),
    []
  )

  const setDensity = useCallback(
    (density: GridDensity) => setState((s) => ({ ...s, density })),
    []
  )

  const toggleColumn = useCallback((key: string) => {
    setState((s) => {
      const next = new Set(s.hiddenColumns)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { ...s, hiddenColumns: next }
    })
  }, [])

  const setColumnFilter = useCallback((key: string, value: string) => {
    setState((s) => ({
      ...s,
      columnFilters: { ...s.columnFilters, [key]: value },
      page: 1,
    }))
  }, [])

  const setColumnFilterMode = useCallback((key: string, mode: ColumnFilterMode) => {
    setState((s) => ({
      ...s,
      columnFilterModes: { ...s.columnFilterModes, [key]: mode },
      columnFilters: { ...s.columnFilters, [key]: '' },
      page: 1,
    }))
  }, [])

  const setColumnFilterMin = useCallback((key: string, value: string) => {
    setState((s) => ({
      ...s,
      columnFilterMin: { ...s.columnFilterMin, [key]: value },
      page: 1,
    }))
  }, [])

  const setColumnFilterMax = useCallback((key: string, value: string) => {
    setState((s) => ({
      ...s,
      columnFilterMax: { ...s.columnFilterMax, [key]: value },
      page: 1,
    }))
  }, [])

  const setColumnFilterChecklist = useCallback((key: string, values: string[]) => {
    setState((s) => ({
      ...s,
      columnFilterChecklists: { ...s.columnFilterChecklists, [key]: values },
      page: 1,
    }))
  }, [])

  const clearColumnFilter = useCallback((key: string) => {
    setState((s) => {
      const filters = { ...s.columnFilters }
      const modes = { ...s.columnFilterModes }
      const mins = { ...s.columnFilterMin }
      const maxs = { ...s.columnFilterMax }
      const checklists = { ...s.columnFilterChecklists }
      delete filters[key]; delete modes[key]; delete mins[key]; delete maxs[key]; delete checklists[key]
      return { ...s, columnFilters: filters, columnFilterModes: modes, columnFilterMin: mins, columnFilterMax: maxs, columnFilterChecklists: checklists, page: 1 }
    })
  }, [])

  const clearFilters = useCallback(() => {
    setState((s) => ({ ...s, search: '', columnFilters: {}, columnFilterModes: {}, columnFilterMin: {}, columnFilterMax: {}, columnFilterChecklists: {}, page: 1 }))
  }, [])

  const activeFilterCount = useMemo(() => {
    let count = state.search.trim() ? 1 : 0
    count += Object.values(state.columnFilters).filter(Boolean).length
    count += Object.values(state.columnFilterModes).filter(Boolean).length
    count += Object.values(state.columnFilterMin).filter(Boolean).length
    count += Object.values(state.columnFilterMax).filter(Boolean).length
    count += Object.values(state.columnFilterChecklists).filter((v) => v.length > 0).length
    return count
  }, [state.search, state.columnFilters, state.columnFilterModes, state.columnFilterMin, state.columnFilterMax, state.columnFilterChecklists])

  return {
    state,
    filtered,
    sorted,
    paged,
    totalPages,
    safePage,
    visibleColumns,
    activeFilterCount,
    setSearch,
    setSort,
    setPage,
    setPageSize,
    setDensity,
    toggleColumn,
    setColumnFilter,
    setColumnFilterMode,
    setColumnFilterMin,
    setColumnFilterMax,
    setColumnFilterChecklist,
    clearColumnFilter,
    clearFilters,
  }
}
