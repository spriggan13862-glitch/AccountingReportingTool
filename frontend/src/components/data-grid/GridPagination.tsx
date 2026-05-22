import { cn } from '@/utils/cn'

interface GridPaginationProps {
  page: number
  totalPages: number
  totalRows: number
  pageSize: number
  onPage: (p: number) => void
  'data-testid'?: string
}

export function GridPagination({
  page,
  totalPages,
  totalRows,
  pageSize,
  onPage,
  'data-testid': testId,
}: GridPaginationProps) {
  if (totalPages <= 1) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalRows)

  // Show up to 7 page buttons centered on current page
  const pages: (number | '...')[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 3) pages.push('...')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i)
    }
    if (page < totalPages - 2) pages.push('...')
    pages.push(totalPages)
  }

  return (
    <div className="flex items-center justify-between text-xs text-gray-500 px-1 py-2">
      <span>
        {start}–{end} of {totalRows} rows
      </span>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page === 1}
          className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
          data-testid={testId ? `${testId}-prev` : 'grid-prev'}
        >
          ‹
        </button>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="px-1 text-gray-400">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p as number)}
              className={cn(
                'min-w-[28px] px-1.5 py-1 border rounded text-xs',
                p === page
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 hover:bg-gray-50'
              )}
              data-testid={p === page ? `${testId ?? 'grid'}-page-current` : undefined}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
          data-testid={testId ? `${testId}-next` : 'grid-next'}
        >
          ›
        </button>
      </div>
    </div>
  )
}
