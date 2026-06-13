import { createContext, useContext, useState, type ReactNode } from 'react'

interface WorkspaceEntity {
  id: number
  code: string
  name: string
}

interface WorkspacePeriod {
  id: number
  period_name: string
  start_date: string
  end_date: string
}

export type DataView = 'as_reported' | 'adjusted' | 'pro_forma'

interface WorkspaceContextValue {
  activeEntity: WorkspaceEntity | null
  setActiveEntity: (entity: WorkspaceEntity | null) => void
  activePeriod: WorkspacePeriod | null
  setActivePeriod: (period: WorkspacePeriod | null) => void
  activeScenarioIds: number[]
  setActiveScenarioIds: (ids: number[]) => void
  dataView: DataView
  setDataView: (view: DataView) => void
}

const ENTITY_KEY = 'workspace_entity'
const PERIOD_KEY = 'workspace_period'
const SCENARIO_KEY = 'workspace_scenario_ids'
const DATA_VIEW_KEY = 'workspace_data_view'

function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  activeEntity: null,
  setActiveEntity: () => {},
  activePeriod: null,
  setActivePeriod: () => {},
  activeScenarioIds: [],
  setActiveScenarioIds: () => {},
  dataView: 'adjusted',
  setDataView: () => {},
})

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [activeEntity, setActiveEntityState] = useState<WorkspaceEntity | null>(
    () => loadJson<WorkspaceEntity>(ENTITY_KEY),
  )
  const [activePeriod, setActivePeriodState] = useState<WorkspacePeriod | null>(
    () => loadJson<WorkspacePeriod>(PERIOD_KEY),
  )
  const [activeScenarioIds, setActiveScenarioIdsState] = useState<number[]>(
    () => loadJson<number[]>(SCENARIO_KEY) ?? [],
  )
  const [dataView, setDataViewState] = useState<DataView>(
    () => (loadJson<DataView>(DATA_VIEW_KEY) ?? 'adjusted'),
  )

  function setActiveEntity(entity: WorkspaceEntity | null) {
    setActiveEntityState(entity)
    // Clear period when entity changes — periods are entity-scoped
    setActivePeriodState(null)
    localStorage.removeItem(PERIOD_KEY)
    if (entity) {
      localStorage.setItem(ENTITY_KEY, JSON.stringify(entity))
    } else {
      localStorage.removeItem(ENTITY_KEY)
    }
  }

  function setActivePeriod(period: WorkspacePeriod | null) {
    setActivePeriodState(period)
    if (period) {
      localStorage.setItem(PERIOD_KEY, JSON.stringify(period))
    } else {
      localStorage.removeItem(PERIOD_KEY)
    }
  }

  function setActiveScenarioIds(ids: number[]) {
    setActiveScenarioIdsState(ids)
    localStorage.setItem(SCENARIO_KEY, JSON.stringify(ids))
  }

  function setDataView(view: DataView) {
    setDataViewState(view)
    localStorage.setItem(DATA_VIEW_KEY, JSON.stringify(view))
  }

  return (
    <WorkspaceContext.Provider value={{
      activeEntity,
      setActiveEntity,
      activePeriod,
      setActivePeriod,
      activeScenarioIds,
      setActiveScenarioIds,
      dataView,
      setDataView,
    }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}
