import { useQuery } from '@tanstack/react-query'
import { scenariosApi } from '@/api/scenarios'

const TYPE_LABELS: Record<string, string> = {
  actual: 'Actuals',
  topside: 'Topside',
  pro_forma: 'Pro Forma',
  elimination: 'Eliminations',
  carveout: 'Carveout',
  budget: 'Budget',
  forecast: 'Forecast',
}

interface ScenarioSelectProps {
  value: number | ''
  onChange: (id: number | '') => void
  label?: string
  required?: boolean
  disabled?: boolean
  className?: string
  placeholder?: string
  organizationId?: number
}

export function ScenarioSelect({
  value,
  onChange,
  label,
  required,
  disabled,
  className,
  placeholder = 'Select scenario',
  organizationId,
}: ScenarioSelectProps) {
  const { data: scenarios = [], isLoading } = useQuery({
    queryKey: ['scenarios-active', organizationId],
    queryFn: () => scenariosApi.list({ active: true, organization_id: organizationId }),
    staleTime: 30_000,
  })

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor="scenario-select-field" className="text-xs font-medium text-gray-700">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <select
        id="scenario-select-field"
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        disabled={disabled || isLoading}
        required={required}
        className={`rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 ${className ?? ''}`}
        data-testid="scenario-select"
      >
        <option value="">{isLoading ? 'Loading…' : placeholder}</option>
        {scenarios.map((s) => (
          <option key={s.id} value={s.id}>
            {TYPE_LABELS[s.scenario_type] ?? s.scenario_type}{s.code && s.code !== s.name ? ` — ${s.code}` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
