import { cn } from '@/utils/cn'
import type { RollforwardScheduleLine } from '@/types'

function fmt(val: string | number) {
  const n = typeof val === 'string' ? parseFloat(val) : val
  if (isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

interface RollforwardTableProps {
  title: string
  lines: RollforwardScheduleLine[]
  className?: string
}

export function RollforwardTable({ title, lines, className }: RollforwardTableProps) {
  return (
    <div className={cn('rounded-lg border border-gray-200 bg-white', className)} data-testid="rollforward-table">
      <div className="border-b px-4 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {lines.map((line, idx) => (
            <tr
              key={idx}
              className={cn(
                'border-b border-gray-50',
                line.is_subtotal && 'font-semibold bg-gray-50 border-t border-gray-200',
              )}
            >
              <td className={cn('py-2 pl-4 text-xs text-gray-700', line.is_subtotal && 'font-semibold')}>
                {line.label}
              </td>
              <td className={cn('py-2 pr-4 text-right tabular-nums text-xs text-gray-700', line.is_subtotal && 'font-semibold')}>
                {fmt(line.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
