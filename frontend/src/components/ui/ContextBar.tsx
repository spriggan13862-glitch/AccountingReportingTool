import { Building2, Calendar, ChevronDown, GitBranch, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useState, useRef, useEffect } from 'react'
import { entitiesApi } from '@/api/entities'
import { periodsApi } from '@/api/periods'
import { scenariosApi } from '@/api/scenarios'
import { useWorkspace, type DataView } from '@/providers/WorkspaceProvider'
import type { Entity, AccountingPeriod, Scenario } from '@/types'

// ---------------------------------------------------------------------------
// Generic dropdown
// ---------------------------------------------------------------------------

function ContextDropdown<T>({
  icon: Icon,
  label,
  items,
  selected,
  onSelect,
  onClear,
  disabled,
}: {
  icon: React.ElementType
  label: React.ReactNode
  items: T[]
  selected: unknown  // only used for truthy/falsy — generic items typed by T
  onSelect: (item: T) => void
  onClear?: () => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="relative flex items-center gap-1" ref={ref}>
      <Icon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-gray-200 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        data-testid={`context-bar-${typeof label === 'string' ? label.toLowerCase() : 'dropdown'}-btn`}
      >
        {selected != null ? (
          <span className="font-medium text-gray-800">{label}</span>
        ) : (
          <span className="text-gray-400 italic">{disabled ? 'Select entity first' : `No ${typeof label === 'string' ? label.toLowerCase() : 'selection'}`}</span>
        )}
        <ChevronDown className="h-3 w-3 text-gray-400" />
      </button>
      {!!selected && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-md border border-gray-200 bg-white shadow-lg">
          <ul className="max-h-60 overflow-y-auto py-1">
            {items.length === 0 ? (
              <li className="px-3 py-2 text-gray-400 italic text-xs">No items found</li>
            ) : (
              items.map((item, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => { onSelect(item); setOpen(false) }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50 text-gray-700"
                  >
                    {renderItem(item)}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

function renderItem(item: unknown): React.ReactNode {
  if (isEntity(item)) return <><span className="font-mono text-gray-500 w-12 shrink-0">{item.code}</span><span>{item.name}</span></>
  if (isPeriod(item)) return <span>{item.period_name} <span className="text-gray-400">({item.start_date})</span></span>
  if (isScenario(item)) return <><span className="font-mono text-gray-500 w-12 shrink-0">{item.code}</span><span>{item.name}</span></>
  return null
}

function isEntity(x: unknown): x is Entity { return typeof x === 'object' && x !== null && 'code' in x && 'name' in x && !('scenario_type' in x) && !('start_date' in x) }
function isPeriod(x: unknown): x is AccountingPeriod { return typeof x === 'object' && x !== null && 'start_date' in x }
function isScenario(x: unknown): x is Scenario { return typeof x === 'object' && x !== null && 'scenario_type' in x }

// ---------------------------------------------------------------------------
// ContextBar
// ---------------------------------------------------------------------------

const DATA_VIEWS: { value: DataView; label: string }[] = [
  { value: 'as_reported', label: 'As Reported' },
  { value: 'adjusted', label: 'Adjusted' },
  { value: 'pro_forma', label: 'Pro Forma' },
]

export function ContextBar() {
  const {
    activeEntity, setActiveEntity,
    activePeriod, setActivePeriod,
    activeScenarioIds, setActiveScenarioIds,
    dataView, setDataView,
  } = useWorkspace()

  const { data: entities = [] } = useQuery({
    queryKey: ['entities-list'],
    queryFn: () => entitiesApi.list(),
    staleTime: 30_000,
  })

  const { data: periods = [] } = useQuery({
    queryKey: ['periods-list', activeEntity?.id],
    queryFn: () => periodsApi.list(activeEntity!.id),
    enabled: !!activeEntity,
    staleTime: 30_000,
  })

  const { data: scenarios = [] } = useQuery({
    queryKey: ['scenarios-list'],
    queryFn: () => scenariosApi.list({ active: true }),
    staleTime: 60_000,
  })

  const sortedPeriods = [...periods].sort((a, b) => b.start_date.localeCompare(a.start_date))
  const activeScenario = scenarios.find((s) => activeScenarioIds[0] === s.id) ?? null

  return (
    <div className="flex h-9 items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 text-xs text-gray-600 flex-wrap">

      {/* Entity */}
      <ContextDropdown
        icon={Building2}
        label={activeEntity ? `${activeEntity.code} — ${activeEntity.name}` : null}
        items={entities}
        selected={activeEntity}
        onSelect={(e: Entity) => setActiveEntity({ id: e.id, code: e.code, name: e.name })}
        onClear={() => setActiveEntity(null)}
      />

      <span className="text-gray-300">|</span>

      {/* Period */}
      <ContextDropdown
        icon={Calendar}
        label={activePeriod ? activePeriod.period_name : null}
        items={sortedPeriods}
        selected={activePeriod}
        onSelect={(p: AccountingPeriod) => setActivePeriod({ id: p.id, period_name: p.period_name, start_date: p.start_date, end_date: p.end_date })}
        onClear={() => setActivePeriod(null)}
        disabled={!activeEntity}
      />

      <span className="text-gray-300">|</span>

      {/* Scenario */}
      <ContextDropdown
        icon={GitBranch}
        label={activeScenario ? `${activeScenario.code} — ${activeScenario.name}` : null}
        items={scenarios}
        selected={activeScenario}
        onSelect={(s: Scenario) => setActiveScenarioIds([s.id])}
        onClear={() => setActiveScenarioIds([])}
      />

      <span className="text-gray-300">|</span>

      {/* Data View toggle */}
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="text-gray-400 font-medium">View:</span>
        {DATA_VIEWS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setDataView(value)}
            className={`rounded px-2 py-0.5 font-medium transition-colors ${
              dataView === value
                ? 'bg-blue-600 text-white'
                : 'text-gray-500 hover:bg-gray-200'
            }`}
            data-testid={`data-view-${value}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
