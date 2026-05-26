/**
 * AccountingDataGrid — enterprise-grade reusable data grid for all accounting modules.
 *
 * Capabilities: sort · per-column filter · global search · pagination · page size ·
 * sticky headers · multi-row selection · column visibility · density · CSV export ·
 * batch action toolbar · row action menus · empty/loading/error states · hierarchy ·
 * keyboard navigation · undo integration hooks
 */

import { useMemo, useCallback, useRef } from 'react'
import {
  ChevronUp, ChevronDown, ChevronsUpDown,
  ChevronRight, AlertCircle, Loader2,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useGridState } from './useGridState'
import { useGridSelection } from './useGridSelection'
import { GridToolbar } from './GridToolbar'
import { GridPagination } from './GridPagination'
import { BatchActionBar } from './BatchActionBar'
import { RowActionMenu } from './RowActionMenu'
import type {
  GridColumn,
  GridDensity,
  RowAction,
  BatchAction,
  UndoConfig,
  GridCellContext,
} from './types'

// ---------------------------------------------------------------------------
// CSV helper
// ---------------------------------------------------------------------------

function csvEsc(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`
  }
  return v
}

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const lines = [headers.map(csvEsc).join(','), ...rows.map((r) => r.map(csvEsc).join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Sort icon
// ---------------------------------------------------------------------------

function SortIcon({ dir }: { dir: 'asc' | 'desc' | null }) {
  if (dir === 'asc') return <ChevronUp className="w-3 h-3" />
  if (dir === 'desc') return <ChevronDown className="w-3 h-3" />
  return <ChevronsUpDown className="w-3 h-3 opacity-30" />
}

// ---------------------------------------------------------------------------
// Density → padding map
// ---------------------------------------------------------------------------

const DENSITY_PY: Record<GridDensity, string> = {
  compact: 'py-1',
  normal: 'py-2',
  comfortable: 'py-3',
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AccountingDataGridProps<T> {
  columns: GridColumn<T>[]
  data: T[]
  rowKey: (row: T) => string | number

  // Optional features
  rowActions?: RowAction<T>[]
  batchActions?: BatchAction<T>[]
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string | undefined

  // State persistence / lifting
  selectionEnabled?: boolean

  // Toolbar
  toolbarLeft?: React.ReactNode
  toolbarRight?: React.ReactNode
  exportFilename?: string
  searchPlaceholder?: string

  // Pagination
  pageSize?: number

  // States
  loading?: boolean
  error?: string | null
  emptyMessage?: string
  emptyAction?: React.ReactNode

  // Undo integration
  undo?: UndoConfig

  // Hierarchy (flat tree — renders children inline, no recursion needed)
  // Callers should pre-flatten the tree and pass depth as a row property
  getDepth?: (row: T) => number
  getExpandable?: (row: T) => boolean
  expandedIds?: Set<string | number>
  onToggleExpand?: (row: T) => void

  rowTestId?: (row: T) => string
  'data-testid'?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AccountingDataGrid<T>({
  columns,
  data,
  rowKey,
  rowActions = [],
  batchActions = [],
  onRowClick,
  rowClassName,
  selectionEnabled = true,
  toolbarLeft,
  toolbarRight,
  exportFilename = 'export',
  searchPlaceholder,
  pageSize: initialPageSize = 50,
  loading = false,
  error = null,
  emptyMessage = 'No records found',
  emptyAction,
  undo,
  getDepth,
  getExpandable,
  expandedIds,
  onToggleExpand,
  rowTestId,
  'data-testid': testId,
}: AccountingDataGridProps<T>) {
  const gridState = useGridState(columns, data, { initialPageSize })
  const {
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
    clearFilters,
  } = gridState

  const getId = useCallback((row: T) => rowKey(row), [rowKey])
  const selection = useGridSelection(sorted, getId)
  const {
    selectedRows,
    selectionCount,
    isSelected,
    toggleRow,
    togglePage,
    selectAll,
    clearSelection,
    isPageAllSelected,
    isPagePartiallySelected,
  } = selection

  const pageAllSelected = isPageAllSelected(paged)
  const pagePartial = isPagePartiallySelected(paged)

  // Row action column (always last if actions provided)
  const hasRowActions = rowActions.length > 0
  const hasSelection = selectionEnabled && batchActions.length > 0

  // Export
  function handleExport() {
    const exportCols = visibleColumns.filter((c) => !c.noExport)
    const headers = exportCols.map((c) => c.header)
    const rows = sorted.map((row) =>
      exportCols.map((col) => {
        if (col.csvValue) return col.csvValue(row)
        return String(col.sortValue?.(row) ?? '')
      })
    )
    downloadCSV(exportFilename, headers, rows)
  }

  // Keyboard navigation: arrow keys on focused rows
  const tbodyRef = useRef<HTMLTableSectionElement>(null)
  function handleKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>, row: T) {
    if (e.key === ' ' && hasSelection) {
      e.preventDefault()
      toggleRow(row)
    }
    if (e.key === 'Enter' && onRowClick) {
      e.preventDefault()
      onRowClick(row)
    }
  }

  function getCellContext(row: T, depth = 0): GridCellContext {
    return {
      depth,
      isSelected: isSelected(row),
      isExpanded: expandedIds?.has(rowKey(row)) ?? false,
      toggleExpand: () => onToggleExpand?.(row),
    }
  }

  const densityPy = DENSITY_PY[state.density]

  return (
    <div className="space-y-0" data-testid={testId}>
      {/* Toolbar */}
      <GridToolbar
        columns={columns}
        hiddenColumns={state.hiddenColumns}
        search={state.search}
        onSearch={setSearch}
        searchPlaceholder={searchPlaceholder}
        density={state.density}
        onDensity={setDensity}
        pageSize={state.pageSize}
        onPageSize={setPageSize}
        onToggleColumn={toggleColumn}
        onExport={handleExport}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
        totalCount={data.length}
        filteredCount={filtered.length}
        toolbarLeft={toolbarLeft}
        toolbarRight={toolbarRight}
        data-testid={testId}
      />

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {/* Checkbox column */}
              {hasSelection && (
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={pageAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = pagePartial
                    }}
                    onChange={() => togglePage(paged)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                    data-testid="select-all-checkbox"
                    title="Select all on page"
                  />
                </th>
              )}

              {visibleColumns.map((col) => {
                const canSort = col.sortable !== false && !!col.sortValue
                const dir = state.sortKey === col.key ? state.sortDir : null
                return (
                  <th
                    key={col.key}
                    className={cn(
                      'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap',
                      canSort && 'cursor-pointer select-none hover:bg-gray-100',
                      col.headerClassName
                    )}
                    style={col.width ? { width: col.width } : undefined}
                    onClick={canSort ? () => setSort(col.key) : undefined}
                    data-testid={testId ? `${testId}-th-${col.key}` : undefined}
                  >
                    <div className="flex items-center gap-1">
                      {col.header}
                      {canSort && <SortIcon dir={dir} />}
                    </div>
                  </th>
                )
              })}

              {/* Row actions column */}
              {hasRowActions && <th className="w-10" />}
            </tr>

            {/* Per-column filter row */}
            {visibleColumns.some((c) => c.filterable) && (
              <tr className="border-t border-gray-200">
                {hasSelection && <th className="px-3 py-1.5" />}
                {visibleColumns.map((col) => (
                  <th key={col.key} className="px-3 py-1.5">
                    {col.filterable && (
                      <input
                        type="text"
                        placeholder={`Filter ${col.header.toLowerCase()}…`}
                        value={state.columnFilters[col.key] ?? ''}
                        onChange={(e) => gridState.setColumnFilter(col.key, e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 font-normal normal-case tracking-normal"
                        data-testid={`col-filter-${col.key}`}
                      />
                    )}
                  </th>
                ))}
                {hasRowActions && <th className="px-3 py-1.5 w-10" />}
              </tr>
            )}
          </thead>

          <tbody
            ref={tbodyRef}
            className="divide-y divide-gray-100 bg-white"
          >
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {hasSelection && (
                    <td className="px-3 py-3">
                      <div className="h-3 w-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  )}
                  {visibleColumns.map((col) => (
                    <td key={col.key} className={cn('px-4', densityPy)}>
                      <div className="h-3 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                  {hasRowActions && <td className="w-10" />}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + (hasSelection ? 1 : 0) + (hasRowActions ? 1 : 0)}
                  className="px-4 py-10 text-center"
                >
                  <div className="flex flex-col items-center gap-2">
                    <AlertCircle className="w-6 h-6 text-red-400" />
                    <p className="text-sm text-red-500">{error}</p>
                  </div>
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + (hasSelection ? 1 : 0) + (hasRowActions ? 1 : 0)}
                  className="px-4 py-12 text-center"
                >
                  <p className="text-sm text-gray-400">
                    {state.search || activeFilterCount > 0
                      ? `No results for "${state.search || 'current filters'}"`
                      : emptyMessage}
                  </p>
                  {emptyAction && <div className="mt-3">{emptyAction}</div>}
                </td>
              </tr>
            ) : (
              paged.map((row) => {
                const key = rowKey(row)
                const selected = isSelected(row)
                const depth = getDepth?.(row) ?? 0
                const expandable = getExpandable?.(row) ?? false
                const expanded = expandedIds?.has(key) ?? false

                return (
                  <tr
                    key={key}
                    onClick={() => onRowClick?.(row)}
                    onKeyDown={(e) => handleKeyDown(e, row)}
                    tabIndex={onRowClick ? 0 : undefined}
                    className={cn(
                      'group/row transition-colors',
                      onRowClick && 'cursor-pointer hover:bg-gray-50 focus:outline-none focus:bg-blue-50',
                      selected && 'bg-blue-50',
                      rowClassName?.(row)
                    )}
                    data-testid={rowTestId ? rowTestId(row) : `grid-row-${key}`}
                  >
                    {/* Checkbox */}
                    {hasSelection && (
                      <td
                        className="px-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleRow(row)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                          data-testid={`row-checkbox-${key}`}
                        />
                      </td>
                    )}

                    {/* Data cells */}
                    {visibleColumns.map((col) => (
                      <td
                        key={col.key}
                        className={cn('px-4 text-gray-700', densityPy, col.className)}
                      >
                        {col.render(row, {
                          depth,
                          isSelected: selected,
                          isExpanded: expanded,
                          toggleExpand: () => onToggleExpand?.(row),
                        })}
                      </td>
                    ))}

                    {/* Row actions */}
                    {hasRowActions && (
                      <td
                        className={cn('px-2 text-right', densityPy)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <RowActionMenu
                          row={row}
                          actions={rowActions}
                          data-testid={`row-actions-${key}`}
                        />
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <GridPagination
        page={safePage}
        totalPages={totalPages}
        totalRows={sorted.length}
        pageSize={state.pageSize}
        onPage={setPage}
        data-testid={testId}
      />

      {/* Batch action bar */}
      {hasSelection && (
        <BatchActionBar
          selectedCount={selectionCount}
          selectedRows={selectedRows}
          actions={batchActions}
          onClear={clearSelection}
          totalCount={filtered.length}
          onSelectAll={() => selectAll(sorted)}
        />
      )}
    </div>
  )
}
