import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Table2,
  Download,
  Eye,
} from 'lucide-react'
import { importRegistryApi, type ImportRegistryEntry } from '@/api/importRegistry'
import { documentsApi } from '@/api/documents'
import { PageLayout } from '@/components/ui/PageLayout'
import { AccountingDataGrid } from '@/components/data-grid'
import type { GridColumn, RowAction } from '@/components/data-grid'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { Badge } from '@/components/ui/Badge'
import type { Document } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const MODULE_LABELS: Record<string, string> = {
  pdf_import: 'PDF Import',
  tb_import: 'Trial Balance',
  coa_import: 'COA Import',
}

const MODULE_COLORS: Record<string, string> = {
  pdf_import: 'bg-purple-50 text-purple-700 border-purple-200',
  tb_import: 'bg-blue-50 text-blue-700 border-blue-200',
  coa_import: 'bg-green-50 text-green-700 border-green-200',
}

function ModuleIcon({ module }: { module: string }) {
  if (module === 'pdf_import') return <FileText className="w-3.5 h-3.5 text-purple-500" />
  if (module === 'coa_import') return <Table2 className="w-3.5 h-3.5 text-green-500" />
  return <FileSpreadsheet className="w-3.5 h-3.5 text-blue-500" />
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    'uploaded': { label: 'Uploaded', cls: 'bg-slate-100 border-slate-200 text-slate-700' },
    'parsed': { label: 'Parsed', cls: 'bg-sky-55 border-sky-250 text-sky-800' },
    'validation_failed': { label: 'Validation Errors', cls: 'bg-red-50 border-red-200 text-red-700' },
    'validation errors': { label: 'Validation Errors', cls: 'bg-red-50 border-red-200 text-red-700' },
    'failed': { label: 'Validation Errors', cls: 'bg-red-50 border-red-200 text-red-700' },
    'error': { label: 'Validation Errors', cls: 'bg-red-50 border-red-200 text-red-700' },
    'awaiting mapping': { label: 'Mapping Required', cls: 'bg-amber-50 border-amber-250 text-amber-800' },
    'mapping_required': { label: 'Mapping Required', cls: 'bg-amber-50 border-amber-250 text-amber-800' },
    'ready for review': { label: 'Ready for Review', cls: 'bg-indigo-50 border-indigo-250 text-indigo-850' },
    'ready_to_post': { label: 'Ready for Review', cls: 'bg-indigo-50 border-indigo-250 text-indigo-850' },
    'finalized': { label: 'Finalized', cls: 'bg-emerald-50 border-emerald-250 text-emerald-800' },
    'posted': { label: 'Finalized', cls: 'bg-emerald-50 border-emerald-250 text-emerald-800' },
    'applied': { label: 'Finalized', cls: 'bg-emerald-50 border-emerald-250 text-emerald-800' },
  }
  const s = status.toLowerCase()
  const { label, cls } = map[s] ?? { label: status, cls: 'bg-gray-100 border-gray-200 text-gray-600' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// DocumentList (used by other pages for attachment display)
// ---------------------------------------------------------------------------

interface DocumentListProps {
  documents: Document[]
}

export function DocumentList({ documents }: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-gray-400">No documents attached.</div>
    )
  }
  return (
    <ul className="divide-y divide-gray-100">
      {documents.map((doc) => (
        <li key={doc.id} className="flex items-center justify-between py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">{doc.original_file_name}</p>
            <p className="text-xs text-gray-400">
              {formatBytes(doc.file_size_bytes)} · {doc.uploaded_at.slice(0, 10)}
            </p>
          </div>
          <div className="ml-4 flex items-center gap-2">
            <Badge>{doc.document_type}</Badge>
            {doc.is_deleted && <Badge variant="error">deleted</Badge>}
          </div>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Main page — Import Registry
// ---------------------------------------------------------------------------

export function DocumentsPage() {
  const navigate = useNavigate()
  const [entityId, setEntityId] = useState<number | ''>('')

  const { data = [], isLoading } = useQuery({
    queryKey: ['import-registry', entityId],
    queryFn: () => importRegistryApi.list(entityId !== '' ? entityId : undefined),
  })

  function navToSource(entry: ImportRegistryEntry) {
    if (entry.source_module === 'pdf_import') {
      navigate('/pdf-import')
    } else if (entry.source_module === 'tb_import') {
      navigate(`/import/${entry.source_id}`)
    } else if (entry.source_module === 'coa_import') {
      navigate('/coa-import')
    }
  }

  const columns: GridColumn<ImportRegistryEntry>[] = [
    {
      key: 'module',
      header: 'Source',
      sortable: true,
      sortValue: (e) => e.source_module,
      render: (e) => (
        <div className="flex items-center gap-1.5">
          <ModuleIcon module={e.source_module} />
          <span
            className={`px-1.5 py-0.5 rounded text-xs font-medium border ${MODULE_COLORS[e.source_module] ?? 'bg-gray-100 text-gray-600'}`}
          >
            {MODULE_LABELS[e.source_module] ?? e.source_module}
          </span>
        </div>
      ),
    },
    {
      key: 'filename',
      header: 'File',
      sortable: true,
      sortValue: (e) => e.filename ?? '',
      render: (e) => (
        <span className="font-mono text-xs text-gray-700 truncate max-w-[220px] block" title={e.filename ?? ''}>
          {e.filename || '—'}
        </span>
      ),
    },
    {
      key: 'entity',
      header: 'Entity',
      sortable: true,
      sortValue: (e) => e.source_entity_name ?? String(e.entity_id ?? ''),
      render: (e) => (
        <span className="text-xs text-gray-600">
          {e.source_entity_name ?? (e.entity_id ? `Entity #${e.entity_id}` : '—')}
        </span>
      ),
    },
    {
      key: 'batch',
      header: 'Linked Batch',
      sortable: true,
      sortValue: (e) => e.source_id,
      render: (e) => (
        <span className="font-mono text-xs text-indigo-600 font-semibold">
          Batch #{e.source_id}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      sortable: true,
      sortValue: (e) => e.description,
      render: (e) => <span className="text-xs text-gray-550">{e.description}</span>,
    },
    {
      key: 'statement_date',
      header: 'Period / Date',
      sortable: true,
      sortValue: (e) => e.statement_date ?? '',
      render: (e) => (
        <span className="text-xs text-gray-500">{e.statement_date ?? '—'}</span>
      ),
    },
    {
      key: 'lines',
      header: 'Accounts / Lines',
      sortable: true,
      sortValue: (e) => e.line_count ?? 0,
      render: (e) => (
        <span className="text-xs text-gray-500">{e.line_count ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (e) => e.status,
      render: (e) => <StatusBadge status={e.status} />,
    },
    {
      key: 'created_at',
      header: 'Uploaded',
      sortable: true,
      sortValue: (e) => e.created_at ?? '',
      render: (e) => (
        <span className="text-xs text-gray-400">
          {e.created_at ? e.created_at.slice(0, 10) : '—'}
        </span>
      ),
    },
    {
      key: 'link',
      header: 'Actions',
      noExport: true,
      render: (e) => (
        <div className="flex items-center gap-1.5">
          {e.document_id ? (
            <button
              type="button"
              onClick={(ev) => { ev.stopPropagation(); documentsApi.download(e.document_id!) }}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100"
              title="Download Source"
            >
              <Download className="w-3 h-3" /> Download Source
            </button>
          ) : (
            <span className="text-gray-400 text-xs font-medium px-2">—</span>
          )}
          {e.document_id && e.source_module === 'pdf_import' && (
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation()
                window.open(`/api/v1/documents/${e.document_id}/download?preview=true`, '_blank')
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded hover:bg-orange-100"
              title="Preview PDF"
            >
              <Eye className="w-3 h-3" /> Preview PDF
            </button>
          )}
          <button
            type="button"
            onClick={(ev) => { ev.stopPropagation(); navToSource(e) }}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
            title="Open Source Import"
          >
            <ExternalLink className="w-3 h-3" /> Open Source Import
          </button>
        </div>
      ),
    },
  ]

  const rowActions: RowAction<ImportRegistryEntry>[] = [
    {
      key: 'download',
      label: 'Download Source',
      icon: Download,
      disabled: (e) => !e.document_id,
      onClick: (e) => {
        if (e.document_id) {
          documentsApi.download(e.document_id)
        }
      },
    },
    {
      key: 'preview',
      label: 'Preview PDF',
      icon: Eye,
      hidden: (e) => !e.document_id || e.source_module !== 'pdf_import',
      onClick: (e) => {
        if (e.document_id) {
          window.open(`/api/v1/documents/${e.document_id}/download?preview=true`, '_blank')
        }
      },
    },
    {
      key: 'view_import',
      label: 'Open Source Import',
      icon: ExternalLink,
      onClick: (e) => {
        navToSource(e)
      },
    },
  ]

  return (
    <PageLayout
      title="Document Registry"
      subtitle="All uploaded files and imports across all modules"
    >
      <AccountingDataGrid
        columns={columns}
        data={data}
        rowKey={(e) => e.id}
        onRowClick={navToSource}
        rowActions={rowActions}
        exportFilename="import_registry"
        pageSize={50}
        loading={isLoading}
        emptyMessage="No import records found. Uploads from PDF Import, Trial Balance, and COA Import will appear here."
        toolbarLeft={
          <EntitySelect
            value={entityId}
            onChange={setEntityId}
            placeholder="All entities"
            className="min-w-[180px] text-sm"
          />
        }
        data-testid="document-registry-grid"
      />
    </PageLayout>
  )
}
