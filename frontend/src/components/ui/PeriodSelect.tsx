import { useQuery } from '@tanstack/react-query'
import { periodsApi } from '@/api/periods'

interface PeriodSelectProps {
  entityId: number | ''
  value: number | ''
  onChange: (id: number | '') => void
  label?: string
  required?: boolean
  disabled?: boolean
  className?: string
}

export function PeriodSelect({ entityId, value, onChange, label, required, disabled, className }: PeriodSelectProps) {
  const { data: periods = [], isLoading } = useQuery({
    queryKey: ['periods-list', entityId],
    queryFn: () => periodsApi.list(entityId as number),
    enabled: !!entityId,
    staleTime: 30_000,
  })

  const sorted = [...periods].sort((a, b) => b.start_date.localeCompare(a.start_date))

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium text-gray-700">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        disabled={disabled || isLoading || !entityId}
        required={required}
        className={`rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 ${className ?? ''}`}
        data-testid="period-select"
      >
        <option value="">
          {!entityId ? 'Select entity first' : isLoading ? 'Loading…' : 'Select period'}
        </option>
        {sorted.map((p) => (
          <option key={p.id} value={p.id}>
            {p.period_name} ({p.start_date} – {p.end_date})
          </option>
        ))}
      </select>
    </div>
  )
}
