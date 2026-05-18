export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 mb-3" />
      <p className="text-sm">{message}</p>
    </div>
  )
}
