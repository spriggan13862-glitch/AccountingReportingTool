import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { OverlayLineItem } from '@/types'

interface OverlayComparisonTableProps {
  lineItems: OverlayLineItem[]
  onDrilldown?: (item: OverlayLineItem) => void
  className?: string
}

function fmt(val: string | number) {
  const n = typeof val === 'string' ? parseFloat(val) : val
  if (isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function adjColor(val: string) {
  const n = parseFloat(val)
  if (n > 0.005) return 'text-green-700'
  if (n < -0.005) return 'text-red-700'
  return 'text-gray-400'
}

function AccountTypeFilter({
  types,
  selected,
  onChange,
}: {
  types: string[]
  selected: string | null
  onChange: (t: string | null) => void
}) {
  return (
    <div className="flex flex-wrap gap-1 mb-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          'rounded-full px-2 py-0.5 text-xs font-medium border',
          selected === null
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
        )}
      >
        All
      </button>
      {types.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t === selected ? null : t)}
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium border capitalize',
            selected === t
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
          )}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

export function OverlayComparisonTable({
  lineItems,
  onDrilldown,
  className,
}: OverlayComparisonTableProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [showOnlyChanged, setShowOnlyChanged] = useState(false)

  const accountTypes = [...new Set(lineItems.map((i) => i.account_type))].sort()

  const visible = lineItems.filter((i) => {
    if (typeFilter && i.account_type !== typeFilter) return false
    if (showOnlyChanged && parseFloat(i.draft_signed_adjustment) === 0) return false
    return true
  })

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className={cn('rounded-lg border border-gray-200 bg-white', className)} data-testid="overlay-comparison-table">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <AccountTypeFilter types={accountTypes} selected={typeFilter} onChange={setTypeFilter} />
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showOnlyChanged}
            onChange={(e) => setShowOnlyChanged(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Show only changed
        </label>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="overlay-table">
          <thead>
            <tr className="border-b text-xs text-gray-500 bg-gray-50">
              <th className="py-2 pl-4 text-left w-6"></th>
              <th className="py-2 text-left">Account</th>
              <th className="py-2 text-left">Type</th>
              <th className="py-2 text-right pr-3">Official</th>
              <th className="py-2 text-right pr-3">Adjustment</th>
              <th className="py-2 text-right pr-3">Preview</th>
              <th className="py-2 text-left pl-2">Groups</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => {
              const hasDetail = item.source_je_ids.length > 0 || item.is_synthetic_re
              const isOpen = expanded.has(item.account_id)
              const changed = parseFloat(item.draft_signed_adjustment) !== 0
              return (
                <>
                  <tr
                    key={item.account_id}
                    className={cn(
                      'border-b border-gray-50 hover:bg-gray-50',
                      item.is_synthetic_re && 'italic bg-purple-50',
                    )}
                  >
                    <td className="pl-4">
                      {hasDetail && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(item.account_id)}
                          className="text-gray-400 hover:text-gray-600"
                          aria-label={`Toggle detail for ${item.account_number}`}
                        >
                          {isOpen
                            ? <ChevronDown className="h-3.5 w-3.5" />
                            : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </td>
                    <td
                      className={cn('py-1.5 pr-2 font-mono text-xs', onDrilldown && changed && 'cursor-pointer text-blue-600 hover:underline')}
                      onClick={() => onDrilldown && changed && onDrilldown(item)}
                    >
                      {item.account_number} — {item.account_name}
                      {item.is_synthetic_re && <span className="ml-1 text-purple-600">(synthetic RE)</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-xs capitalize text-gray-500">{item.account_type}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-gray-700">
                      {fmt(item.official_signed_balance)}
                    </td>
                    <td className={cn('py-1.5 pr-3 text-right tabular-nums font-medium', adjColor(item.draft_signed_adjustment))}>
                      {changed ? (parseFloat(item.draft_signed_adjustment) > 0 ? '+' : '') + fmt(item.draft_signed_adjustment) : '—'}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums font-medium text-gray-900">
                      {fmt(item.preview_signed_balance)}
                    </td>
                    <td className="py-1.5 pl-2">
                      <div className="flex flex-wrap gap-0.5">
                        {item.overlay_groups_used.map((g) => (
                          <span key={g} className="rounded bg-amber-100 px-1 py-0.5 text-xs text-amber-700">
                            {g}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${item.account_id}-detail`} className="bg-gray-50">
                      <td colSpan={7} className="pl-8 pr-4 py-2 text-xs text-gray-500">
                        {item.is_synthetic_re
                          ? `Synthetic RE rollforward — net income from draft P&L entries`
                          : `Source draft JEs: ${item.source_je_ids.join(', ')}`}
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-sm text-gray-400">
                  No accounts match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
