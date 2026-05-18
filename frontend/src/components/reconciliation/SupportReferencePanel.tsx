import { FileText, Link, BookOpen, Database } from 'lucide-react'
import type { SupportReference } from '@/types'

const REF_ICONS = {
  document: FileText,
  journal_entry: Link,
  workpaper: BookOpen,
  external_system: Database,
}

interface SupportReferencePanelProps {
  references: SupportReference[]
  onAdd?: () => void
}

export function SupportReferencePanel({ references, onAdd }: SupportReferencePanelProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white" data-testid="support-reference-panel">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Support References
          <span className="ml-1 text-gray-400 normal-case font-normal">({references.length})</span>
        </h3>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="text-xs text-blue-600 hover:underline"
            data-testid="add-support-ref"
          >
            + Add
          </button>
        )}
      </div>
      {references.length === 0 ? (
        <p className="px-4 py-3 text-xs text-gray-400">No support references attached.</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {references.map((ref) => {
            const Icon = REF_ICONS[ref.reference_type as keyof typeof REF_ICONS] ?? FileText
            return (
              <li key={ref.id} className="flex items-start gap-2 px-4 py-2">
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <span className="text-xs font-medium capitalize text-gray-700">
                    {ref.reference_type.replace(/_/g, ' ')}
                  </span>
                  {ref.external_ref && (
                    <span className="ml-1.5 font-mono text-xs text-blue-600">{ref.external_ref}</span>
                  )}
                  {ref.description && (
                    <p className="mt-0.5 text-xs text-gray-500">{ref.description}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
