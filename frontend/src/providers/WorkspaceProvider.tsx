import { createContext, useContext, useState, type ReactNode } from 'react'

interface WorkspaceEntity {
  id: number
  code: string
  name: string
}

interface WorkspaceContextValue {
  activeEntity: WorkspaceEntity | null
  setActiveEntity: (entity: WorkspaceEntity | null) => void
}

const STORAGE_KEY = 'workspace_entity'

function loadEntity(): WorkspaceEntity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  activeEntity: null,
  setActiveEntity: () => {},
})

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [activeEntity, setActiveEntityState] = useState<WorkspaceEntity | null>(loadEntity)

  function setActiveEntity(entity: WorkspaceEntity | null) {
    setActiveEntityState(entity)
    if (entity) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entity))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  return (
    <WorkspaceContext.Provider value={{ activeEntity, setActiveEntity }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}
