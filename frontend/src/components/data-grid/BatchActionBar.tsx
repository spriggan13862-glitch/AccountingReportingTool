import { X } from 'lucide-react'
import type { BatchAction } from './types'
import { cn } from '@/utils/cn'

interface BatchActionBarProps<T> {
  selectedCount: number
  selectedRows: T[]
  actions: BatchAction<T>[]
  onClear: () => void
  totalCount: number
  onSelectAll?: () => void
}

export function BatchActionBar<T>({
  selectedCount,
  selectedRows,
  actions,
  onClear,
  totalCount,
  onSelectAll,
}: BatchActionBarProps<T>) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center gap-2 bg-gray-900 text-white rounded-xl shadow-2xl px-4 py-3 min-w-[420px]">
        {/* Selection count */}
        <div className="flex items-center gap-2 pr-3 border-r border-gray-700">
          <span className="text-sm font-semibold text-white">{selectedCount}</span>
          <span className="text-sm text-gray-400">selected</span>
          {onSelectAll && selectedCount < totalCount && (
            <button
              type="button"
              onClick={onSelectAll}
              className="text-xs text-blue-400 hover:text-blue-300 underline"
            >
              Select all {totalCount}
            </button>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-1">
          {actions.map((action) => {
            const Icon = action.icon
            const isDisabled = action.disabled?.(selectedRows) ?? false
            const isDanger = action.variant === 'danger'
            return (
              <button
                key={action.key}
                type="button"
                disabled={isDisabled}
                onClick={() => action.onClick(selectedRows)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  isDanger
                    ? 'bg-red-600 hover:bg-red-500 text-white disabled:bg-red-800 disabled:text-red-400'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-100 disabled:bg-gray-800 disabled:text-gray-500',
                  'disabled:cursor-not-allowed'
                )}
                data-testid={`batch-action-${action.key}`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {action.label}
              </button>
            )
          })}
        </div>

        {/* Clear selection */}
        <button
          type="button"
          onClick={onClear}
          className="p-1.5 text-gray-400 hover:text-white transition-colors ml-2"
          title="Clear selection"
          data-testid="batch-clear-btn"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
