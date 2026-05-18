import type { Variance } from '@/types'

interface Props {
  variance: Variance
  size?: 'sm' | 'md'
}

export function VarianceIndicator({ variance, size = 'md' }: Props) {
  const amount = parseFloat(variance.amount)
  const isPositive = amount > 0
  const isNeutral = amount === 0
  const color = isNeutral ? 'text-gray-500' : isPositive ? 'text-green-600' : 'text-red-600'
  const arrow = isNeutral ? '—' : isPositive ? '▲' : '▼'
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <span className={`${color} ${textSize} font-medium whitespace-nowrap`}>
      {arrow} {Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      {variance.percentage != null && (
        <span className="ml-1 text-gray-400">
          ({parseFloat(variance.percentage).toFixed(1)}%)
        </span>
      )}
    </span>
  )
}
