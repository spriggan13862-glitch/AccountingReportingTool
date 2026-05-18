import { AlertCircle } from 'lucide-react'

interface ErrorStateProps {
  message?: string
}

export function ErrorState({ message = 'An error occurred.' }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-red-400">
      <AlertCircle className="h-10 w-10 mb-3" />
      <p className="text-sm font-medium text-red-600">Error</p>
      <p className="text-xs mt-1 text-red-500">{message}</p>
    </div>
  )
}
