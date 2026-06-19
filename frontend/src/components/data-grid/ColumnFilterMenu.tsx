import { useState, useRef, useEffect } from 'react'
import { Filter, ArrowUp, ArrowDown, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { ColumnFilterMode } from './types'

interface ColumnFilterMenuProps {
  columnKey: string
  header: string
  sortable: boolean
  filterType?: 'text' | 'numeric'
  sortDir: 'asc' | 'desc' | null
  filterValue: string
  filterMode: ColumnFilterMode
  filterMin: string
  filterMax: string
  isActive: boolean
  onSort: () => void
  onFilterChange: (value: string) => void
  onModeChange: (mode: ColumnFilterMode) => void
  onMinChange: (value: string) => void
  onMaxChange: (value: string) => void
  onClear: () => void
}

export function ColumnFilterMenu({
  columnKey,
  header,
  sortable,
  filterType = 'text',
  sortDir,
  filterValue,
  filterMode,
  filterMin,
  filterMax,
  isActive,
  onSort,
  onFilterChange,
  onModeChange,
  onMinChange,
  onMaxChange,
  onClear,
}: ColumnFilterMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const hasFilter = filterValue.trim() || filterMode !== 'contains' || filterMin.trim() || filterMax.trim()

  return (
    <div ref={ref} className="relative inline-flex items-center gap-0.5 w-full">
      {sortable && (
        <button
          type="button"
          onClick={onSort}
          className="flex-1 flex items-center gap-1 text-left group"
          data-testid={`col-sort-${columnKey}`}
        >
          <span>{header}</span>
          {sortDir === 'asc' && <ArrowUp className="w-3 h-3 shrink-0" />}
          {sortDir === 'desc' && <ArrowDown className="w-3 h-3 shrink-0" />}
          {!sortDir && <ArrowUp className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-30" />}
        </button>
      )}
      {!sortable && <span className="flex-1">{header}</span>}

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className={cn(
          'shrink-0 p-0.5 rounded hover:bg-gray-200 transition-colors',
          (open || isActive) && 'text-indigo-600 bg-indigo-50'
        )}
        title={`Filter ${header}`}
        data-testid={`col-filter-btn-${columnKey}`}
      >
        <Filter className="w-3 h-3" />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 z-50 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg p-2 space-y-2 text-xs font-normal normal-case tracking-normal"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sort options */}
          {sortable && (
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => { onSort(); setOpen(false) }}
                className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 text-left', sortDir === 'asc' && 'bg-indigo-50 text-indigo-700')}
              >
                <ArrowUp className="w-3 h-3" /> Sort A → Z
              </button>
              <button
                type="button"
                onClick={() => { onSort(); setOpen(false) }}
                className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 text-left', sortDir === 'desc' && 'bg-indigo-50 text-indigo-700')}
              >
                <ArrowDown className="w-3 h-3" /> Sort Z → A
              </button>
            </div>
          )}

          <div className="border-t border-gray-100" />

          {/* Blank/nonblank mode */}
          <div className="space-y-0.5">
            <label className="flex items-center gap-2 px-2 py-1 cursor-pointer rounded hover:bg-gray-50">
              <input
                type="radio"
                name={`filter-mode-${columnKey}`}
                checked={filterMode === 'contains'}
                onChange={() => onModeChange('contains')}
                className="text-indigo-600"
              />
              All values
            </label>
            <label className="flex items-center gap-2 px-2 py-1 cursor-pointer rounded hover:bg-gray-50">
              <input
                type="radio"
                name={`filter-mode-${columnKey}`}
                checked={filterMode === 'blank'}
                onChange={() => onModeChange('blank')}
                className="text-indigo-600"
              />
              Blank only
            </label>
            <label className="flex items-center gap-2 px-2 py-1 cursor-pointer rounded hover:bg-gray-50">
              <input
                type="radio"
                name={`filter-mode-${columnKey}`}
                checked={filterMode === 'nonblank'}
                onChange={() => onModeChange('nonblank')}
                className="text-indigo-600"
              />
              Non-blank only
            </label>
          </div>

          {/* Text contains / numeric range */}
          {filterMode === 'contains' && filterType === 'text' && (
            <>
              <div className="border-t border-gray-100" />
              <input
                type="text"
                placeholder="Contains…"
                value={filterValue}
                onChange={(e) => onFilterChange(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
                data-testid={`col-filter-${columnKey}`}
              />
            </>
          )}
          {filterMode === 'contains' && filterType === 'numeric' && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex gap-1">
                <input
                  type="number"
                  placeholder="Min"
                  value={filterMin}
                  onChange={(e) => onMinChange(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={filterMax}
                  onChange={(e) => onMaxChange(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
            </>
          )}

          {hasFilter && (
            <>
              <div className="border-t border-gray-100" />
              <button
                type="button"
                onClick={() => { onClear(); setOpen(false) }}
                className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-red-500 hover:bg-red-50 rounded"
              >
                <X className="w-3 h-3" /> Clear filter
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
