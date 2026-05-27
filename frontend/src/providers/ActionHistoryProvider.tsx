import { createContext, useContext, useCallback, useState, ReactNode } from 'react'

export type ActionCategory =
  | 'account_edit'
  | 'account_reparent'
  | 'account_status'
  | 'import_mapping'
  | 'import_apply'
  | 'journal_entry'
  | 'period_close'
  | 'batch'
  | 'other'

export interface HistoryEntry {
  id: string
  category: ActionCategory
  description: string
  timestamp: number
  undo?: () => Promise<void> | void
  redo?: () => Promise<void> | void
  metadata?: Record<string, unknown>
}

interface ActionHistoryContextValue {
  entries: HistoryEntry[]
  canUndo: boolean
  canRedo: boolean
  push: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void
  undo: () => Promise<void>
  redo: () => Promise<void>
  clear: () => void
}

const ActionHistoryContext = createContext<ActionHistoryContextValue | null>(null)

const MAX_HISTORY = 50

export function ActionHistoryProvider({ children }: { children: ReactNode }) {
  const [{ entries, pointer }, setState] = useState<{
    entries: HistoryEntry[]
    pointer: number
  }>({ entries: [], pointer: -1 })

  const push = useCallback((entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => {
    const newEntry: HistoryEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    }
    setState((prev) => {
      const trimmed = prev.entries.slice(0, prev.pointer + 1)
      const next = [...trimmed, newEntry]
      if (next.length > MAX_HISTORY) next.shift()
      return { entries: next, pointer: next.length - 1 }
    })
  }, [])

  const undo = useCallback(async () => {
    setState((prev) => {
      if (prev.pointer < 0) return prev
      const entry = prev.entries[prev.pointer]
      if (entry?.undo) Promise.resolve(entry.undo()).catch(console.error)
      return { entries: prev.entries, pointer: prev.pointer - 1 }
    })
  }, [])

  const redo = useCallback(async () => {
    setState((prev) => {
      const nextPtr = prev.pointer + 1
      if (nextPtr >= prev.entries.length) return prev
      const entry = prev.entries[nextPtr]
      if (entry?.redo) Promise.resolve(entry.redo()).catch(console.error)
      return { entries: prev.entries, pointer: nextPtr }
    })
  }, [])

  const clear = useCallback(() => {
    setState({ entries: [], pointer: -1 })
  }, [])

  const value: ActionHistoryContextValue = {
    entries,
    canUndo: pointer >= 0,
    canRedo: pointer < entries.length - 1,
    push,
    undo,
    redo,
    clear,
  }

  return (
    <ActionHistoryContext.Provider value={value}>
      {children}
    </ActionHistoryContext.Provider>
  )
}

export function useActionHistory(): ActionHistoryContextValue {
  const ctx = useContext(ActionHistoryContext)
  if (!ctx) throw new Error('useActionHistory must be used within ActionHistoryProvider')
  return ctx
}
