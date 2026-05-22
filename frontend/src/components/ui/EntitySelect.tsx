import { useQuery } from '@tanstack/react-query'
import { entitiesApi } from '@/api/entities'

interface EntitySelectProps {
  value: number | ''
  onChange: (id: number | '') => void
  label?: string
  required?: boolean
  disabled?: boolean
  className?: string
}

export function EntitySelect({ value, onChange, label, required, disabled, className }: EntitySelectProps) {
  const { data: entities = [], isLoading } = useQuery({
    queryKey: ['entities-list'],
    queryFn: () => entitiesApi.list(),
    staleTime: 30_000,
  })

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
        disabled={disabled || isLoading}
        required={required}
        className={`rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 ${className ?? ''}`}
        data-testid="entity-select"
      >
        <option value="">{isLoading ? 'Loading…' : 'Select entity'}</option>
        {entities.map((e) => (
          <option key={e.id} value={e.id}>
            {e.code} — {e.name}
          </option>
        ))}
      </select>
    </div>
  )
}
