import { useRef, DragEvent, ChangeEvent, useState } from 'react'
import { Upload, FileText, AlertCircle } from 'lucide-react'

interface Props {
  accept?: string
  maxSizeMB?: number
  onFile: (file: File) => void
  hint?: string
}

export function UploadStep({ accept = '.csv,.xlsx,.xls', maxSizeMB = 10, onFile, hint }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function validate(file: File): string | null {
    if (maxSizeMB && file.size > maxSizeMB * 1024 * 1024)
      return `File exceeds ${maxSizeMB} MB limit`
    return null
  }

  function handle(file: File) {
    const err = validate(file)
    if (err) { setError(err); return }
    setError(null)
    onFile(file)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handle(file)
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handle(file)
    e.target.value = ''
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        data-testid="upload-dropzone"
        className={`w-full max-w-lg border-2 border-dashed rounded-xl px-8 py-12 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
          dragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-indigo-300 hover:bg-indigo-50/30'
        }`}
      >
        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${dragging ? 'bg-indigo-100' : 'bg-gray-100'}`}>
          <Upload className={`w-6 h-6 ${dragging ? 'text-indigo-500' : 'text-gray-400'}`} />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">Drop a file here or click to browse</p>
          <p className="text-xs text-gray-400 mt-1">{accept.split(',').join(', ')} · up to {maxSizeMB} MB</p>
        </div>
        {hint && <p className="text-xs text-indigo-600 text-center">{hint}</p>}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={onChange}
          className="hidden"
          data-testid="upload-file-input"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm" data-testid="upload-error">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-gray-400">
        <FileText className="w-3.5 h-3.5" />
        <span>CSV files should have headers in the first row</span>
      </div>
    </div>
  )
}
