import { useQuery } from '@tanstack/react-query'
import { scenariosApi } from '@/api/scenarios'

interface ScenarioMultiSelectProps {
  value: number[]
  onChange: (ids: number[]) => void
  label?: string
  disabled?: boolean
  className?: string
}

export function ScenarioMultiSelect({ value, onChange, label, disabled, className }: ScenarioMultiSelectProps) {
  const { data: scenarios = [], isLoading } = useQuery({
    queryKey: ['scenarios-list'],
    queryFn: () => scenariosApi.list({ active: true }),
    staleTime: 60_000,
  })

  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  }

  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-xs font-medium text-gray-700">{label}</span>}
      <div
        className={`rounded-md border border-gray-300 bg-white px-3 py-2 space-y-1 min-h-[2.5rem] ${disabled ? 'bg-gray-50' : ''} ${className ?? ''}`}
        data-testid="scenario-multi-select"
      >
        {isLoading && <span className="text-sm text-gray-400">Loading…</span>}
        {!isLoading && scenarios.length === 0 && (
          <span className="text-sm text-gray-400">No scenarios available</span>
        )}
        {scenarios.map((s) => (
          <label key={s.id} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={value.includes(s.id)}
              onChange={() => toggle(s.id)}
              disabled={disabled}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-800">
              {s.code}
              <span className="text-xs text-gray-500 ml-1">({s.scenario_type})</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
