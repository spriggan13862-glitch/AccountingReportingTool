import { AlertTriangle } from 'lucide-react'
import { cn } from '@/utils/cn'

interface PreviewBannerProps {
  label: string
  generatedAt: string
  includedJeCount: number
  overlayGroups: string[]
  className?: string
}

export function PreviewBanner({
  label,
  generatedAt,
  includedJeCount,
  overlayGroups,
  className,
}: PreviewBannerProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border-2 border-amber-400 bg-amber-50 p-4',
        className
      )}
      role="alert"
      data-testid="preview-banner"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-800">{label}</p>
        <p className="text-xs text-amber-700 mt-0.5">
          {includedJeCount} draft {includedJeCount === 1 ? 'entry' : 'entries'} included
          {overlayGroups.length > 0 && ` · Groups: ${overlayGroups.join(', ')}`}
        </p>
        <p className="text-xs text-amber-600 mt-0.5">Generated: {new Date(generatedAt).toLocaleString()}</p>
      </div>
      <span className="shrink-0 rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900 uppercase tracking-wider">
        Not Official
      </span>
    </div>
  )
}
