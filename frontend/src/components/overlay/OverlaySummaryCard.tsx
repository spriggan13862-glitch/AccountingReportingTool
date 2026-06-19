import { useFormatCurrencyCompact } from '@/hooks/useFormatCurrency'
import { cn } from '@/utils/cn'
import type { OverlayResult } from '@/types'

interface OverlaySummaryCardProps {
  result: OverlayResult
  className?: string
}

function useFmt() {
  const fmt = useFormatCurrencyCompact()
  return (val: string | number) => {
    const n = typeof val === 'string' ? parseFloat(val) : val
    if (isNaN(n)) return '—'
    return fmt(n)
  }
}

export function OverlaySummaryCard({ result, className }: OverlaySummaryCardProps) {
  const totalOfficial = result.line_items.reduce(
    (s, i) => s + parseFloat(i.official_signed_balance), 0
  )
  const totalDraft = result.line_items.reduce(
    (s, i) => s + parseFloat(i.draft_signed_adjustment), 0
  )
  const totalPreview = result.line_items.reduce(
    (s, i) => s + parseFloat(i.preview_signed_balance), 0
  )

  const groupCounts: Record<string, number> = {}
  for (const item of result.line_items) {
    for (const grp of item.overlay_groups_used) {
      groupCounts[grp] = (groupCounts[grp] ?? 0) + 1
    }
  }

  const fmt = useFmt()

  return (
    <div
      className={cn('rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3', className)}
      data-testid="overlay-summary-card"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700">Overlay Summary</h3>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Official (Posted)', value: totalOfficial, color: 'text-gray-700' },
          { label: 'Draft Adjustment', value: totalDraft, color: totalDraft >= 0 ? 'text-green-700' : 'text-red-700' },
          { label: 'Preview Total', value: totalPreview, color: 'text-amber-800 font-semibold' },
        ].map(({ label, value, color }) => (
          <div key={label} className="text-center">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={cn('text-sm tabular-nums font-mono', color)}>{fmt(value)}</p>
          </div>
        ))}
      </div>

      {result.re_rollforward_applied && (
        <p className="text-xs text-amber-600">
          RE rollforward applied: {fmt(result.re_draft_adjustment)} net income from draft entries
        </p>
      )}

      {Object.keys(groupCounts).length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {Object.entries(groupCounts).map(([grp, count]) => (
            <span
              key={grp}
              className="rounded-full bg-amber-200 px-2 py-0.5 text-xs text-amber-800"
            >
              {grp} ({count})
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
