import { createContext, useContext, useCallback, useRef, useState, ReactNode } from 'react'

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
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  // pointer into entries: -1 means nothing undone, 0 means first undo-able entry is entries[0]
  const pointerRef = useRef<number>(-1) // index of the last applied action

  const push = useCallback((entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => {
    const newEntry: HistoryEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    }
    setEntries((prev) => {
      // Truncate any redoable items ahead of pointer + add new
      const next = [...prev.slice(0, pointerRef.current + 1), newEntry]
      if (next.length > MAX_HISTORY) next.shift()
      pointerRef.current = next.length - 1
      return next
    })
  }, [])

  const undo = useCallback(async () => {
    setEntries((prev) => {
      if (pointerRef.current < 0) return prev
      const entry = prev[pointerRef.current]
      if (entry?.undo) {
        Promise.resolve(entry.undo()).catch(console.error)
      }
      pointerRef.current -= 1
      return prev
    })
  }, [])

  const redo = useCallback(async () => {
    // Redo is not always possible without stored forward actions — noop for most categories
    setEntries((prev) => {
      const nextPtr = pointerRef.current + 1
      if (nextPtr >= prev.length) return prev
      pointerRef.current = nextPtr
      return prev
    })
  }, [])

  const clear = useCallback(() => {
    setEntries([])
    pointerRef.current = -1
  }, [])

  const value: ActionHistoryContextValue = {
    entries,
    canUndo: pointerRef.current >= 0,
    canRedo: pointerRef.current < entries.length - 1,
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
