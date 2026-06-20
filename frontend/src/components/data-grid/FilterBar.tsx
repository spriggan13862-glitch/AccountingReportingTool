import { useState, useRef, useEffect } from 'react'
import { X, Filter, ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'

export interface FilterBarFilterDef {
  key: string
  label: string
  type: 'text' | 'numeric-range' | 'checklist' | 'date-range'
  value: string | string[] | { min?: string; max?: string } | { from?: string; to?: string }
  onChange: (value: any) => void
  options?: string[]
}

interface FilterBarProps {
  filters: FilterBarFilterDef[]
  onClearAll: () => void
  activeCount: number
  'data-testid'?: string
  clearButtonTestId?: string
}

function ChecklistDropdown({
  label,
  options,
  selected,
  onChange,
  filterKey,
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (values: string[]) => void
  filterKey: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const isActive = selected.length > 0

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={filterKey}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors',
          isActive
            ? 'border-indigo-400 bg-indigo-50 text-indigo-700 font-semibold'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
        )}
      >
        <span>{label}</span>
        {isActive && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold">
            {selected.length}
          </span>
        )}
        <ChevronDown className="w-3 h-3 opacity-50" />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 w-44 bg-white border border-gray-200 rounded-lg shadow-lg p-2 space-y-1 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-1 pb-0.5">
            <button
              type="button"
              onClick={() => onChange(options)}
              className="text-[10px] text-indigo-600 hover:underline"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[10px] text-slate-400 hover:underline"
            >
              Clear
            </button>
          </div>
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-1 py-0.5 cursor-pointer rounded hover:bg-gray-50">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, opt]
                    : selected.filter((v) => v !== opt)
                  onChange(next)
                }}
                className="text-indigo-600 rounded"
              />
              <span className="capitalize">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export function FilterBar({ filters, onClearAll, activeCount, 'data-testid': testId, clearButtonTestId = 'filter-clear-all' }: FilterBarProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 p-2 bg-slate-50/50 border border-slate-200/60 rounded-xl"
      data-testid={testId}
    >
      <div className="flex items-center gap-1 text-xs text-slate-500 font-medium pr-1">
        <Filter className="w-3.5 h-3.5" />
        <span>Filters</span>
      </div>

      {filters.map((f) => {
        if (f.type === 'text') {
          const val = f.value as string
          return (
            <div key={f.key} className="relative">
              <input
                type="text"
                placeholder={f.label}
                value={val}
                onChange={(e) => f.onChange(e.target.value)}
                data-testid={f.key}
                className={cn(
                  'px-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 w-40',
                  val ? 'border-indigo-400 bg-indigo-50/40' : 'border-slate-200 bg-white',
                )}
              />
              {val && (
                <button
                  type="button"
                  onClick={() => f.onChange('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )
        }

        if (f.type === 'checklist') {
          const val = f.value as string[]
          return (
            <ChecklistDropdown
              key={f.key}
              filterKey={f.key}
              label={f.label}
              options={f.options ?? []}
              selected={val}
              onChange={f.onChange}
            />
          )
        }

        if (f.type === 'numeric-range') {
          const val = f.value as { min?: string; max?: string }
          return (
            <div key={f.key} className="flex items-center gap-1">
              <span className="text-xs text-slate-500">{f.label}:</span>
              <input
                type="number"
                placeholder="Min"
                value={val.min ?? ''}
                onChange={(e) => f.onChange({ ...val, min: e.target.value })}
                data-testid={`${f.key}-min`}
                className="w-20 px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <span className="text-xs text-slate-400">–</span>
              <input
                type="number"
                placeholder="Max"
                value={val.max ?? ''}
                onChange={(e) => f.onChange({ ...val, max: e.target.value })}
                data-testid={`${f.key}-max`}
                className="w-20 px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
          )
        }

        if (f.type === 'date-range') {
          const val = f.value as { from?: string; to?: string }
          return (
            <div key={f.key} className="flex items-center gap-1">
              <span className="text-xs text-slate-500">{f.label}:</span>
              <input
                type="date"
                value={val.from ?? ''}
                onChange={(e) => f.onChange({ ...val, from: e.target.value })}
                data-testid={`${f.key}-from`}
                className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <span className="text-xs text-slate-400">–</span>
              <input
                type="date"
                value={val.to ?? ''}
                onChange={(e) => f.onChange({ ...val, to: e.target.value })}
                data-testid={`${f.key}-to`}
                className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
          )
        }

        return null
      })}

      {activeCount > 0 && (
        <div className="flex items-center gap-2 ml-auto">
          <span
            className="text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5"
            data-testid="filter-active-count"
          >
            {activeCount} active
          </span>
          <button
            type="button"
            onClick={onClearAll}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
            data-testid={clearButtonTestId}
          >
            <X className="w-3 h-3" />
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
