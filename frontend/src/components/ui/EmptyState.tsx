import { InboxIcon } from 'lucide-react'

interface EmptyStateProps {
  title?: string
  description?: string
}

export function EmptyState({
  title = 'No results',
  description = 'Nothing to display here yet.',
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <InboxIcon className="h-10 w-10 mb-3 text-gray-300" />
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className="text-xs mt-1">{description}</p>
    </div>
  )
}
