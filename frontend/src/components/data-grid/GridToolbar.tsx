import { useState, useRef, useEffect } from 'react'
import {
  Search, X, Download, SlidersHorizontal, ChevronDown,
  AlignJustify, AlignLeft, AlignCenter, Filter,
} from 'lucide-react'
import type { GridColumn, GridDensity } from './types'
import { PAGE_SIZES } from './useGridState'
import { cn } from '@/utils/cn'

interface GridToolbarProps<T> {
  columns: GridColumn<T>[]
  hiddenColumns: Set<string>
  search: string
  onSearch: (v: string) => void
  density: GridDensity
  onDensity: (d: GridDensity) => void
  pageSize: number
  onPageSize: (n: number) => void
  onToggleColumn: (key: string) => void
  onExport?: () => void
  activeFilterCount: number
  onClearFilters: () => void
  totalCount: number
  filteredCount: number
  toolbarLeft?: React.ReactNode
  toolbarRight?: React.ReactNode
  'data-testid'?: string
}

const DENSITY_ICONS: Record<GridDensity, React.ElementType> = {
  compact: AlignJustify,
  normal: AlignLeft,
  comfortable: AlignCenter,
}

const DENSITY_LABELS: Record<GridDensity, string> = {
  compact: 'Compact',
  normal: 'Normal',
  comfortable: 'Comfortable',
}

export function GridToolbar<T>({
  columns,
  hiddenColumns,
  search,
  onSearch,
  density,
  onDensity,
  pageSize,
  onPageSize,
  onToggleColumn,
  onExport,
  activeFilterCount,
  onClearFilters,
  totalCount,
  filteredCount,
  toolbarLeft,
  toolbarRight,
  'data-testid': testId,
}: GridToolbarProps<T>) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const DensityIcon = DENSITY_ICONS[density]

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      {toolbarLeft}

      {/* Search */}
      <div className="relative min-w-[200px] max-w-xs flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
          data-testid={testId ? `${testId}-search` : 'grid-search'}
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Active filter badge */}
      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={onClearFilters}
          className="flex items-center gap-1 px-2 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-md hover:bg-blue-100"
          data-testid="clear-filters-btn"
        >
          <Filter className="w-3 h-3" />
          {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
          <X className="w-3 h-3" />
        </button>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {/* Row count */}
        <span className="text-xs text-gray-400 select-none">
          {filteredCount !== totalCount
            ? `${filteredCount} of ${totalCount}`
            : `${totalCount} rows`}
        </span>

        {/* Export */}
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            disabled={filteredCount === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40"
            data-testid={testId ? `${testId}-export` : 'grid-export'}
            title="Export CSV"
          >
            <Download className="w-3 h-3" />
            CSV
          </button>
        )}

        {/* Settings panel */}
        <div className="relative" ref={settingsRef}>
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-md hover:bg-gray-50',
              settingsOpen ? 'border-blue-400 text-blue-700 bg-blue-50' : 'border-gray-300'
            )}
            data-testid="grid-settings-btn"
            title="Table settings"
          >
            <SlidersHorizontal className="w-3 h-3" />
            <ChevronDown className={cn('w-3 h-3 transition-transform', settingsOpen && 'rotate-180')} />
          </button>

          {settingsOpen && (
            <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-xl w-64 py-2">
              {/* Density */}
              <div className="px-3 py-1.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Density
                </p>
                <div className="flex gap-1">
                  {(['compact', 'normal', 'comfortable'] as GridDensity[]).map((d) => {
                    const Icon = DENSITY_ICONS[d]
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => onDensity(d)}
                        className={cn(
                          'flex-1 flex flex-col items-center gap-1 px-2 py-1.5 rounded text-[10px] border transition-colors',
                          density === d
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        )}
                        data-testid={`density-${d}`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {DENSITY_LABELS[d]}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="border-t border-gray-100 my-1.5" />

              {/* Page size */}
              <div className="px-3 py-1.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Rows per page
                </p>
                <div className="flex flex-wrap gap-1">
                  {PAGE_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => onPageSize(size)}
                      className={cn(
                        'px-2.5 py-1 rounded text-xs border transition-colors',
                        pageSize === size
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      )}
                      data-testid={`page-size-${size}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 my-1.5" />

              {/* Column visibility */}
              <div className="px-3 py-1.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Columns
                </p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {columns.map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={!hiddenColumns.has(col.key)}
                        onChange={() => onToggleColumn(col.key)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                        data-testid={`col-toggle-${col.key}`}
                      />
                      <span className="text-xs text-gray-700">{col.header || col.key}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {toolbarRight}
      </div>
    </div>
  )
}
