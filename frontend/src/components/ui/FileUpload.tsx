import { useRef } from 'react'
import { Upload, X } from 'lucide-react'
import { cn } from '@/utils/cn'

interface FileUploadProps {
  label?: string
  accept?: string
  file: File | null
  onChange: (file: File | null) => void
  error?: string
  disabled?: boolean
}

export function FileUpload({ label, accept, file, onChange, error, disabled }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-xs font-medium text-gray-700">{label}</span>}
      <div
        className={cn(
          'flex items-center gap-3 rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-3',
          !disabled && 'cursor-pointer hover:border-blue-400 hover:bg-blue-50',
          error && 'border-red-400 bg-red-50',
          disabled && 'cursor-not-allowed opacity-60',
        )}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && !disabled && inputRef.current?.click()}
      >
        <Upload className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="flex-1 truncate text-sm text-gray-600">
          {file ? file.name : 'Choose a file…'}
        </span>
        {file && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(null) }}
            className="rounded p-0.5 hover:bg-gray-200"
            aria-label="Remove file"
          >
            <X className="h-3.5 w-3.5 text-gray-500" />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
