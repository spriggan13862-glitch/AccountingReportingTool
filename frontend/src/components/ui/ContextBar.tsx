import { Building2, Calendar, ChevronDown, GitBranch, HelpCircle, Plus, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
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
  footer,
}: {
  icon: React.ElementType
  label: React.ReactNode
  items: T[]
  selected: unknown  // only used for truthy/falsy — generic items typed by T
  onSelect: (item: T) => void
  onClear?: () => void
  disabled?: boolean
  footer?: React.ReactNode
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
          {footer && (
            <div className="border-t border-gray-100 px-1 py-1" onClick={() => setOpen(false)}>
              {footer}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const ENTITY_TYPE_CHIP: Record<string, string> = {
  staging: 'bg-amber-50 text-amber-700 border-amber-200',
  consolidation: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  elimination: 'bg-purple-50 text-purple-700 border-purple-200',
  carveout: 'bg-sky-50 text-sky-700 border-sky-200',
}

function renderItem(item: unknown): React.ReactNode {
  if (isEntity(item)) return (
    <>
      <span className="font-mono text-gray-500 w-12 shrink-0">{item.code}</span>
      <span className="flex-1">{item.name}</span>
      {item.entity_type !== 'operating' && (
        <span className={`text-[9px] font-semibold uppercase tracking-wide border rounded px-1 py-0.5 ml-auto shrink-0 ${ENTITY_TYPE_CHIP[item.entity_type] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
          {item.entity_type}
        </span>
      )}
    </>
  )
  if (isPeriod(item)) return <span>{item.period_name} <span className="text-gray-400">({item.start_date})</span></span>
  if (isScenario(item)) return <><span className="font-mono text-gray-500 w-12 shrink-0">{item.code}</span><span>{item.name}</span></>
  return null
}

function isEntity(x: unknown): x is Entity { return typeof x === 'object' && x !== null && 'code' in x && 'name' in x && !('scenario_type' in x) && !('start_date' in x) }
function isPeriod(x: unknown): x is AccountingPeriod { return typeof x === 'object' && x !== null && 'start_date' in x }
function isScenario(x: unknown): x is Scenario { return typeof x === 'object' && x !== null && 'scenario_type' in x }

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative flex items-center" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span className="absolute left-5 top-0 z-50 w-56 rounded bg-gray-800 px-2.5 py-2 text-[11px] leading-relaxed text-white shadow-lg">
          {text}
        </span>
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------
// ContextBar
// ---------------------------------------------------------------------------

const DATA_VIEWS: { value: DataView; label: string }[] = [
  { value: 'as_reported', label: 'As Reported' },
  { value: 'adjusted', label: 'Adjusted' },
  { value: 'pro_forma', label: 'Pro Forma' },
]

// Import wizard sub-pages have their own entity/period form fields — hide full context bar
const WIZARD_PATHS = [
  '/client-data/imports/trial-balance',
  '/client-data/imports/general-ledger',
  '/client-data/imports/journal-entries',
  '/pdf-import',
  '/coa-import',
  '/tb-import',
]
// Import list + setup pages: hide only the View toggle
const VIEW_HIDDEN_PATHS = ['/client-data/imports', '/setup']

export function ContextBar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const {
    activeEntity, setActiveEntity,
    activePeriod, setActivePeriod,
    activeScenarioIds, setActiveScenarioIds,
    dataView, setDataView,
  } = useWorkspace()

  const hideAll = WIZARD_PATHS.some((p) => pathname.startsWith(p))
  const hideViewToggle = hideAll || VIEW_HIDDEN_PATHS.some((p) => pathname.startsWith(p))

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

  if (hideAll) return null

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
        footer={
          <button
            type="button"
            onClick={() => navigate('/setup?tab=entities&new=1')}
            className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
          >
            <Plus className="h-3 w-3" />
            New Entity / Manage
          </button>
        }
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
      <div className="flex items-center gap-1">
        <ContextDropdown
          icon={GitBranch}
          label={activeScenario ? `${activeScenario.code} — ${activeScenario.name}` : null}
          items={scenarios}
          selected={activeScenario}
          onSelect={(s: Scenario) => setActiveScenarioIds([s.id])}
          onClear={() => setActiveScenarioIds([])}
          footer={
            scenarios.length === 0 ? (
              <button
                type="button"
                onClick={() => navigate('/setup?tab=scenarios')}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-50 rounded transition-colors"
              >
                <Plus className="h-3 w-3" />
                No scenarios — go to Setup
              </button>
            ) : undefined
          }
        />
        <Tooltip text="Scenarios segment journal entries by purpose. 'Actual' = as reported. 'Topside' = audit adjustments. 'Pro Forma' = what-if overlays. Use the context bar to filter statements to one scenario.">
          <HelpCircle className="h-3 w-3 text-gray-300 hover:text-gray-500 cursor-help" />
        </Tooltip>
      </div>

      {!hideViewToggle && (
        <>
          <span className="text-gray-300">|</span>

          {/* Data View toggle — hidden on import/setup pages */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <Tooltip text="As Reported: only TB import entries. Adjusted: all posted JEs. Pro Forma: includes draft overlay JEs for what-if analysis.">
              <span className="text-gray-400 font-medium cursor-help">View:</span>
            </Tooltip>
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
        </>
      )}
    </div>
  )
}
