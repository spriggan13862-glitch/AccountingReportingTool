import { useEffect, useRef, useState } from 'react'
import { MoreVertical } from 'lucide-react'
import type { RowAction } from './types'
import { cn } from '@/utils/cn'

interface RowActionMenuProps<T> {
  row: T
  actions: RowAction<T>[]
  'data-testid'?: string
}

export function RowActionMenu<T>({ row, actions, 'data-testid': testId }: RowActionMenuProps<T>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const visible = actions.filter((a) => !a.hidden?.(row))
  if (visible.length === 0) return null

  // Close on outside click / escape
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function keyHandler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        className="p-1 text-gray-300 hover:text-gray-600 rounded hover:bg-gray-100 opacity-0 group-hover/row:opacity-100 focus:opacity-100 transition-opacity"
        data-testid={testId ?? 'row-action-btn'}
        title="Row actions"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl w-48 py-1">
          {visible.map((action) => {
            const Icon = action.icon
            const disabled = action.disabled?.(row) ?? false
            return (
              <div key={action.key}>
                {action.separator && (
                  <div className="border-t border-gray-100 my-1" />
                )}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpen(false)
                    action.onClick(row)
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-xs flex items-center gap-2',
                    action.variant === 'danger'
                      ? 'text-red-600 hover:bg-red-50'
                      : action.variant === 'warning'
                      ? 'text-amber-600 hover:bg-amber-50'
                      : 'text-gray-700 hover:bg-gray-50',
                    disabled && 'opacity-40 cursor-not-allowed'
                  )}
                  data-testid={`row-action-${action.key}`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5 shrink-0 opacity-60" />}
                  {action.label}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
