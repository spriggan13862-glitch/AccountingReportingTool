import { Building2, ChevronDown, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useState, useRef, useEffect } from 'react'
import { entitiesApi } from '@/api/entities'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import type { Entity } from '@/types'

export function ContextBar() {
  const { activeEntity, setActiveEntity } = useWorkspace()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data: entities = [] } = useQuery({
    queryKey: ['entities-list'],
    queryFn: () => entitiesApi.list(),
    staleTime: 30_000,
  })

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function select(entity: Entity) {
    setActiveEntity({ id: entity.id, code: entity.code, name: entity.name })
    setOpen(false)
  }

  return (
    <div className="flex h-8 items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-4 text-xs text-gray-600">
      <Building2 className="h-3.5 w-3.5 text-gray-400 shrink-0" />

      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-gray-200 transition-colors"
          data-testid="context-bar-entity-btn"
        >
          {activeEntity ? (
            <span className="font-medium text-gray-800">
              {activeEntity.code} — {activeEntity.name}
            </span>
          ) : (
            <span className="text-gray-400 italic">No entity selected</span>
          )}
          <ChevronDown className="h-3 w-3 text-gray-400" />
        </button>

        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[240px] rounded-md border border-gray-200 bg-white shadow-lg">
            <div className="border-b border-gray-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Switch Entity
            </div>
            <ul className="max-h-60 overflow-y-auto py-1">
              {entities.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => select(e)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50 ${
                      activeEntity?.id === e.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    <span className="font-mono text-gray-500 w-12 shrink-0">{e.code}</span>
                    <span>{e.name}</span>
                  </button>
                </li>
              ))}
              {entities.length === 0 && (
                <li className="px-3 py-2 text-gray-400 italic">No entities found</li>
              )}
            </ul>
          </div>
        )}
      </div>

      {activeEntity && (
        <button
          type="button"
          onClick={() => setActiveEntity(null)}
          className="text-gray-400 hover:text-gray-600"
          title="Clear active entity"
          data-testid="context-bar-clear"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
