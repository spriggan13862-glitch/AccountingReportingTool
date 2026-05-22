/**
 * DataGrid — sortable, filterable, paginated table component.
 *
 * Replaces DataTable for screens that need column sort, global search,
 * pagination, and CSV export. Fully controlled externally for data;
 * sort/filter/pagination state is managed internally.
 */

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown, Download, Search, X } from 'lucide-react'
import { cn } from '@/utils/cn'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GridColumn<T> {
  key: string
  header: string
  className?: string
  /** Extract a sortable primitive for this column */
  sortValue?: (row: T) => string | number | null | undefined
  /** Render cell content (defaults to String(sortValue)) */
  render: (row: T) => React.ReactNode
  /** If true, column is excluded from CSV export */
  noExport?: boolean
  /** Text value for CSV export (defaults to String(sortValue ?? render output)) */
  csvValue?: (row: T) => string
}

interface DataGridProps<T> {
  columns: GridColumn<T>[]
  data: T[]
  rowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
  className?: string
  pageSize?: number
  /** Filename stem for CSV export (without .csv) */
  exportFilename?: string
  /** Show the search/filter bar */
  searchable?: boolean
  /** Extra content rendered left of the search bar */
  toolbarLeft?: React.ReactNode
  /** Row-level className override */
  rowClassName?: (row: T) => string | undefined
  emptyMessage?: string
  /** When true, show a loading skeleton */
  loading?: boolean
  'data-testid'?: string
}

type SortDir = 'asc' | 'desc' | null

// ---------------------------------------------------------------------------
// Helpers
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

function SortIcon({ dir }: { dir: SortDir }) {
  if (dir === 'asc') return <ChevronUp className="w-3 h-3" />
  if (dir === 'desc') return <ChevronDown className="w-3 h-3" />
  return <ChevronsUpDown className="w-3 h-3 opacity-40" />
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DataGrid<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  className,
  pageSize = 50,
  exportFilename = 'export',
  searchable = true,
  toolbarLeft,
  rowClassName,
  emptyMessage = 'No records found',
  loading = false,
  'data-testid': testId,
}: DataGridProps<T>) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [page, setPage] = useState(1)

  // Filter
  const filtered = useMemo(() => {
    if (!search.trim()) return data
    const q = search.toLowerCase()
    return data.filter((row) =>
      columns.some((col) => {
        const sv = col.sortValue?.(row)
        return String(sv ?? '').toLowerCase().includes(q)
      }),
    )
  }, [data, search, columns])

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered
    const col = columns.find((c) => c.key === sortKey)
    if (!col?.sortValue) return filtered
    return [...filtered].sort((a, b) => {
      const va = col.sortValue!(a) ?? ''
      const vb = col.sortValue!(b) ?? ''
      let cmp = 0
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb
      } else {
        cmp = String(va).localeCompare(String(vb))
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir, columns])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = sorted.slice((safePage - 1) * pageSize, safePage * pageSize)

  function handleSort(key: string) {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc')
      else if (sortDir === 'desc') { setSortKey(null); setSortDir(null) }
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  function handleSearch(v: string) {
    setSearch(v)
    setPage(1)
  }

  function handleExport() {
    const exportCols = columns.filter((c) => !c.noExport)
    const headers = exportCols.map((c) => c.header)
    const rows = sorted.map((row) =>
      exportCols.map((col) => {
        if (col.csvValue) return col.csvValue(row)
        const sv = col.sortValue?.(row)
        return String(sv ?? '')
      }),
    )
    downloadCSV(exportFilename, headers, rows)
  }

  return (
    <div className={cn('space-y-2', className)} data-testid={testId}>
      {/* Toolbar */}
      {(searchable || toolbarLeft || exportFilename) && (
        <div className="flex flex-wrap items-center gap-2">
          {toolbarLeft}
          {searchable && (
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                data-testid={testId ? `${testId}-search` : 'grid-search'}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => handleSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {filtered.length !== data.length
                ? `${filtered.length} of ${data.length}`
                : `${data.length} rows`}
            </span>
            <button
              type="button"
              onClick={handleExport}
              disabled={data.length === 0}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
              data-testid={testId ? `${testId}-export` : 'grid-export'}
            >
              <Download className="w-3 h-3" />
              CSV
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {columns.map((col) => {
                const canSort = !!col.sortValue
                const dir = sortKey === col.key ? sortDir : null
                return (
                  <th
                    key={col.key}
                    className={cn(
                      'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500',
                      canSort && 'cursor-pointer select-none hover:bg-gray-100',
                      col.className,
                    )}
                    onClick={canSort ? () => handleSort(col.key) : undefined}
                    data-testid={testId ? `${testId}-th-${col.key}` : undefined}
                  >
                    <div className="flex items-center gap-1">
                      {col.header}
                      {canSort && <SortIcon dir={dir} />}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <div className="h-3 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-sm text-gray-400"
                >
                  {search ? `No results for "${search}"` : emptyMessage}
                </td>
              </tr>
            ) : (
              paged.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-gray-50',
                    rowClassName?.(row),
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn('px-4 py-3 text-gray-700', col.className)}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-500 px-1">
          <span>
            Page {safePage} of {totalPages} · {sorted.length} rows
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, safePage - 1))}
              disabled={safePage === 1}
              className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
              data-testid={testId ? `${testId}-prev` : 'grid-prev'}
            >
              ‹ Prev
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = safePage <= 3
                ? i + 1
                : safePage >= totalPages - 2
                ? totalPages - 4 + i
                : safePage - 2 + i
              if (p < 1 || p > totalPages) return null
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={cn(
                    'px-2 py-1 border rounded',
                    p === safePage
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 hover:bg-gray-50',
                  )}
                >
                  {p}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
              disabled={safePage === totalPages}
              className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
              data-testid={testId ? `${testId}-next` : 'grid-next'}
            >
              Next ›
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
