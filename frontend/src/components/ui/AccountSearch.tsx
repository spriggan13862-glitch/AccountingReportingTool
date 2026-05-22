import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { accountsApi } from '@/api/accounts'
import type { Account } from '@/types'

interface AccountSearchProps {
  entityId: number | ''
  value: number | null
  onChange: (acct: Account | null) => void
  placeholder?: string
  disabled?: boolean
}

export function AccountSearch({ entityId, value, onChange, placeholder, disabled }: AccountSearchProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const { data: results } = useQuery({
    queryKey: ['acct-search', entityId, query],
    queryFn: () => accountsApi.list(entityId as number, query || undefined),
    enabled: open && query.length >= 1 && !!entityId,
    placeholderData: (prev) => prev,
  })

  const accounts: Account[] = Array.isArray(results) ? results : (results as any)?.items ?? []

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={wrapRef} className="relative" data-testid="account-search">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
          placeholder={!entityId ? 'Select entity first' : (placeholder ?? 'Search account…')}
          disabled={disabled || !entityId}
          className="w-full pl-8 pr-7 py-1.5 border border-gray-300 rounded text-sm focus:border-blue-400 focus:outline-none disabled:bg-gray-50"
        />
        {value !== null && (
          <button
            type="button"
            onClick={() => { onChange(null); setQuery('') }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {open && accounts.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {accounts.map((acct) => (
            <button
              key={acct.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                onChange(acct)
                setQuery(`${acct.account_number} — ${acct.account_name}`)
                setOpen(false)
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
            >
              <span className="font-mono text-gray-600 shrink-0">{acct.account_number}</span>
              <span className="text-gray-800 truncate">{acct.account_name}</span>
              <span className="ml-auto text-xs text-gray-400 shrink-0">{acct.account_type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
