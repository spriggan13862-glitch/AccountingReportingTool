import { useFormatNumber } from '@/hooks/useFormatCurrency'
import type { Variance } from '@/types'

interface Props {
  variance: Variance
  size?: 'sm' | 'md'
}

export function VarianceIndicator({ variance, size = 'md' }: Props) {
  const fmtNumber = useFormatNumber()
  const amount = parseFloat(variance.amount)
  const isPositive = amount > 0
  const isNeutral = amount === 0
  const color = isNeutral ? 'text-gray-500' : isPositive ? 'text-green-600' : 'text-red-600'
  const arrow = isNeutral ? '—' : isPositive ? '▲' : '▼'
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <span className={`${color} ${textSize} font-medium whitespace-nowrap`}>
      {arrow} {fmtNumber(Math.abs(amount))}
      {variance.percentage != null && (
        <span className="ml-1 text-gray-400">
          ({parseFloat(variance.percentage).toFixed(1)}%)
        </span>
      )}
    </span>
  )
}
