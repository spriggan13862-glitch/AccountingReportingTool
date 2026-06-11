import { useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Upload,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  ChevronRight,
  HelpCircle,
  FileText,
  Building2,
  ArrowRight,
  Download,
  RotateCcw,
  ArrowUpRight,
  Sparkles
} from 'lucide-react'
import { tbImportApi } from '@/api/tbImport'
import { entitiesApi } from '@/api/entities'
import { importRegistryApi } from '@/api/importRegistry'
import { pdfImportApi } from '@/api/pdfImport'
import { coaImportApi } from '@/api/coaImport'
import { documentsApi } from '@/api/documents'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { useOrg } from '@/providers/OrgProvider'
import { useToast } from '@/providers/ToastProvider'
import { AccountingDataGrid } from '@/components/data-grid'
import type { ImportBatch, ImportBatchStatus } from '@/types'

function getLifecycleBadge(status: string) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    'Uploaded': { label: 'Uploaded', cls: 'bg-slate-100 border-slate-200 text-slate-700', icon: <Clock className="w-3 h-3" /> },
    'Parsed': { label: 'Parsed', cls: 'bg-sky-50 border-sky-200 text-sky-700', icon: <Clock className="w-3 h-3 animate-pulse" /> },
    'Validation Errors': { label: 'Validation Errors', cls: 'bg-red-50 border-red-200 text-red-700', icon: <XCircle className="w-3 h-3" /> },
    'Awaiting Mapping': { label: 'Mapping Required', cls: 'bg-amber-50 border-amber-250 text-amber-800', icon: <AlertCircle className="w-3 h-3" /> },
    'Ready for Review': { label: 'Ready for Review', cls: 'bg-indigo-50 border-indigo-250 text-indigo-850', icon: <CheckCircle className="w-3 h-3" /> },
    'Finalized': { label: 'Finalized', cls: 'bg-emerald-55 text-emerald-805 bg-emerald-50/40 border-emerald-250', icon: <CheckCircle className="w-3 h-3 text-emerald-600" /> },
  }
  const { label, cls, icon } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600', icon: null }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {icon}
      {label}
    </span>
  )
}

export function ImportCenterPage() {
  const { org } = useOrg()
  const orgId = org?.id ?? 0
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const [showFormatHelp, setShowFormatHelp] = useState(false)

  const [entityId, setEntityId] = useState<number | ''>('')
  const [asOfDate, setAsOfDate] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  // Top level config tabs ('tb' or 'gl')
  const [activeTab, setActiveTab] = useState<'tb' | 'gl'>('tb')

  // Lower level queue tabs
  const [activeTabSection, setActiveTabSection] = useState<'recent' | 'mapping' | 'validation' | 'documents'>('recent')

  // Queries for all imports and registry
  const { data: registryEntries, isLoading: isRegistryLoading } = useQuery({
    queryKey: ['import-registry', entityId || undefined],
    queryFn: () => importRegistryApi.list(entityId ? Number(entityId) : undefined),
  })

  const { data: tbBatches } = useQuery({
    queryKey: ['import-batches', orgId],
    queryFn: () => tbImportApi.listBatches(orgId),
    enabled: !!orgId,
  })

  const { data: pdfBatches } = useQuery({
    queryKey: ['pdf-batches', entityId || undefined],
    queryFn: () => pdfImportApi.list(entityId ? Number(entityId) : undefined),
  })

  const { data: coaBatches } = useQuery({
    queryKey: ['coa-batches', entityId || undefined],
    queryFn: () => coaImportApi.list(entityId ? Number(entityId) : undefined),
  })

  const { data: entityData } = useQuery({
    queryKey: ['entities'],
    queryFn: () => entitiesApi.list(),
    enabled: !!orgId,
  })
  const entityCount = entityData?.length ?? 0

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file || !entityId || !asOfDate) throw new Error('All fields required')
      return tbImportApi.uploadBatch({
        entity_id: entityId as number,
        organization_id: orgId,
        as_of_date: asOfDate,
        file,
      })
    },
    onSuccess: (batch) => {
      queryClient.invalidateQueries({ queryKey: ['import-batches', orgId] })
      queryClient.invalidateQueries({ queryKey: ['import-registry'] })
      setFile(null)
      setApiError(null)
      toast(`Import uploaded: ${file?.name ?? 'file'} — review and map accounts to continue`, 'success')
      navigate(`/import/${batch.id}`)
    },
    onError: (err: Error) => { setApiError(err.message); toast(err.message, 'error') },
  })

  const rollbackMutation = useMutation({
    mutationFn: (batchId: number) => tbImportApi.rollbackBatch(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-batches', orgId] })
      queryClient.invalidateQueries({ queryKey: ['import-registry'] })
      toast('Import successfully rolled back', 'success')
    },
    onError: (err: Error) => {
      toast(`Rollback failed: ${err.message}`, 'error')
    }
  })

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }

  // Map registry entries with domain attributes
  const mappedEntries = useMemo(() => {
    const entries = registryEntries && registryEntries.length > 0
      ? registryEntries
      : [
          ...(tbBatches ?? []).map(tb => ({
            id: `tb_${tb.id}`,
            source_module: 'tb_import' as const,
            source_id: tb.id,
            filename: tb.filename,
            entity_id: tb.entity_id || null,
            source_entity_name: tb.entity_name || null,
            status: tb.status,
            line_count: tb.row_count || 0,
            description: `Trial Balance Import: ${tb.filename}`,
            created_at: tb.uploaded_at || null,
            basis_of_accounting: null,
            statement_date: tb.as_of_date || null,
          })),
          ...(pdfBatches ?? []).map(pdf => ({
            id: `pdf_${pdf.id}`,
            source_module: 'pdf_import' as const,
            source_id: pdf.id,
            filename: pdf.filename,
            entity_id: pdf.entity_id || null,
            source_entity_name: pdf.entity_name || null,
            status: pdf.status,
            line_count: null,
            description: `PDF Import: ${pdf.filename}`,
            created_at: pdf.uploaded_at || null,
            basis_of_accounting: null,
            statement_date: null,
          })),
          ...(coaBatches ?? []).map(coa => ({
            id: `coa_${coa.id}`,
            source_module: 'coa_import' as const,
            source_id: coa.id,
            filename: coa.filename,
            entity_id: coa.entity_id || null,
            source_entity_name: coa.entity_name || null,
            status: coa.status,
            line_count: null,
            description: `COA Import: ${coa.filename}`,
            created_at: coa.uploaded_at || null,
            basis_of_accounting: null,
            statement_date: null,
          })),
        ]

    return entries.map((entry) => {
      let unmappedCount = 0
      let totalCount = entry.line_count ?? 0
      let errorMsg = entry.status === 'failed' || entry.status === 'validation_failed' ? (entry.description || 'Verification failed') : null
      let isOutOfBalance = false
      let progress = 100
      let lastAction = 'Uploaded'
      let reviewActionText = 'View Details'
      let reviewActionPath = ''
      let importTypeLabel = 'Trial Balance'

      if (entry.source_module === 'tb_import') {
        importTypeLabel = 'Trial Balance'
        const tb = tbBatches?.find(b => b.id === entry.source_id)
        if (tb) {
          unmappedCount = tb.unmapped_row_count ?? 0
          totalCount = tb.row_count ?? 0
          errorMsg = tb.error_message
          isOutOfBalance = Math.abs(parseFloat(tb.total_debits || '0') - parseFloat(tb.total_credits || '0')) > 0.01
          progress = totalCount ? Math.round(((totalCount - unmappedCount) / totalCount) * 100) : 100
          lastAction = tb.status === 'posted' ? 'Finalized' : tb.status === 'ready_to_post' ? 'Validated' : 'Uploaded'
          
          if (tb.status === 'mapping_required') {
            reviewActionText = 'Map Accounts'
            reviewActionPath = `/import/${tb.id}/mapping`
          } else if (tb.status === 'ready_to_post') {
            reviewActionText = 'Review & Post'
            reviewActionPath = `/import/${tb.id}`
          } else {
            reviewActionText = 'View'
            reviewActionPath = `/import/${tb.id}`
          }
        } else {
          reviewActionPath = `/import/${entry.source_id}`
        }
      } else if (entry.source_module === 'pdf_import') {
        importTypeLabel = 'PDF Import'
        const pdf = pdfBatches?.find(p => p.id === entry.source_id)
        if (pdf) {
          errorMsg = pdf.error_message
          progress = pdf.status === 'applied' ? 100 : 0
          lastAction = pdf.status === 'applied' ? 'Finalized' : 'Uploaded'
          
          if (pdf.status !== 'applied' && pdf.status !== 'failed') {
            reviewActionText = 'Review & Apply'
            reviewActionPath = `/pdf-import`
          } else {
            reviewActionText = 'View'
            reviewActionPath = `/pdf-import`
          }
        } else {
          reviewActionPath = '/pdf-import'
        }
      } else if (entry.source_module === 'coa_import') {
        importTypeLabel = 'COA Import'
        const coa = coaBatches?.find(c => c.id === entry.source_id)
        if (coa) {
          progress = coa.status === 'applied' ? 100 : 0
          lastAction = coa.status === 'applied' ? 'Finalized' : 'Uploaded'
          if (coa.status !== 'applied') {
            reviewActionText = 'Review & Apply'
            reviewActionPath = `/coa-import`
          } else {
            reviewActionText = 'View'
            reviewActionPath = `/coa-import`
          }
        } else {
          reviewActionPath = '/coa-import'
        }
      }

      // Map raw status to workflow lifecycle status
      let lifecycleStatus: 'Uploaded' | 'Parsed' | 'Validation Errors' | 'Awaiting Mapping' | 'Ready for Review' | 'Finalized' = 'Uploaded'
      const rawStatus = entry.status?.toLowerCase() || ''
      if (rawStatus === 'posted' || rawStatus === 'applied') {
        lifecycleStatus = 'Finalized'
      } else if (rawStatus === 'ready_to_post') {
        lifecycleStatus = 'Ready for Review'
      } else if (rawStatus === 'mapping_required') {
        lifecycleStatus = 'Awaiting Mapping'
      } else if (rawStatus === 'validation_failed' || rawStatus === 'failed' || rawStatus === 'rejected') {
        lifecycleStatus = 'Validation Errors'
      } else if (rawStatus === 'parsing' || rawStatus === 'validating' || rawStatus === 'processing') {
        lifecycleStatus = 'Parsed'
      } else {
        lifecycleStatus = 'Uploaded'
      }

      return {
        ...entry,
        importTypeLabel,
        unmappedCount,
        totalCount,
        errorMsg,
        isOutOfBalance,
        progress,
        lastAction,
        reviewActionText,
        reviewActionPath,
        lifecycleStatus
      }
    })
  }, [registryEntries, tbBatches, pdfBatches, coaBatches])

  // Statistics summaries calculations
  const stats = useMemo(() => {
    const awaitingMapping = mappedEntries.filter(e => e.lifecycleStatus === 'Awaiting Mapping').length
    const validationIssues = mappedEntries.filter(e => e.lifecycleStatus === 'Validation Errors' || e.errorMsg).length
    const outOfBalance = mappedEntries.filter(e => e.isOutOfBalance).length
    const awaitingReview = mappedEntries.filter(e => e.lifecycleStatus === 'Ready for Review').length
    const recentlyFinalized = mappedEntries.filter(e => e.lifecycleStatus === 'Finalized').length
    return { awaitingMapping, validationIssues, outOfBalance, awaitingReview, recentlyFinalized }
  }, [mappedEntries])

  // Filter registry items based on selected tab section
  const filteredData = useMemo(() => {
    switch (activeTabSection) {
      case 'mapping':
        return mappedEntries.filter(e => e.lifecycleStatus === 'Awaiting Mapping')
      case 'validation':
        return mappedEntries.filter(e => e.lifecycleStatus === 'Validation Errors' || e.errorMsg || e.isOutOfBalance)
      case 'documents':
        return mappedEntries.filter(e => e.document_id)
      case 'recent':
      default:
        return mappedEntries
    }
  }, [mappedEntries, activeTabSection])

  const columns = [
    {
      key: 'filename',
      header: 'Import Name',
      sortable: true,
      sortValue: (b: any) => b.filename ?? '',
      render: (b: any) => (
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
          <span className="font-semibold text-gray-900 truncate max-w-[220px]">{b.filename || b.description}</span>
        </div>
      ),
    },
    {
      key: 'source_entity_name',
      header: 'Entity',
      sortable: true,
      sortValue: (b: any) => b.source_entity_name ?? '',
      render: (b: any) => <span className="text-gray-600 font-medium">{b.source_entity_name || '—'}</span>,
    },
    {
      key: 'source_module',
      header: 'Import Type',
      sortable: true,
      sortValue: (b: any) => b.importTypeLabel,
      render: (b: any) => <span className="text-xs text-gray-550 font-semibold">{b.importTypeLabel}</span>,
    },
    {
      key: 'statement_date',
      header: 'Statement Date',
      sortable: true,
      sortValue: (b: any) => b.statement_date ?? b.created_at ?? '',
      render: (b: any) => <span className="text-gray-600">{b.statement_date || (b.created_at ? new Date(b.created_at).toLocaleDateString() : '—')}</span>,
    },
    {
      key: 'lifecycleStatus',
      header: 'Status',
      sortable: true,
      sortValue: (b: any) => b.lifecycleStatus,
      render: (b: any) => getLifecycleBadge(b.lifecycleStatus),
    },
    {
      key: 'validation_issues',
      header: 'Validation Issues',
      sortable: false,
      render: (b: any) => (
        <span className="text-xs">
          {b.errorMsg ? (
            <span className="text-rose-650 font-semibold flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {b.errorMsg}
            </span>
          ) : b.isOutOfBalance ? (
            <span className="text-red-650 font-semibold flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Out of Balance
            </span>
          ) : (
            <span className="text-emerald-600">No issues</span>
          )}
        </span>
      ),
    },
    {
      key: 'progress',
      header: 'Mapping Progress',
      sortable: true,
      sortValue: (b: any) => b.progress,
      render: (b: any) => (
        <div className="flex items-center gap-2 min-w-[120px]">
          <div className="w-16 bg-gray-100 rounded-full h-1.5 shrink-0">
            <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${b.progress}%` }} />
          </div>
          <span className="text-[10px] text-gray-500 font-semibold">{b.progress}% ({b.unmappedCount} left)</span>
        </div>
      ),
    },
    {
      key: 'actions_button',
      header: 'Actions',
      render: (b: any) => {
        return (
          <div className="flex items-center gap-1.5 justify-end">
            {b.reviewActionPath && b.lifecycleStatus !== 'Finalized' && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); navigate(b.reviewActionPath) }}
                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded transition-colors"
              >
                {b.reviewActionText}
              </button>
            )}
            {b.source_module === 'tb_import' && b.status === 'posted' && (
              <button
                type="button"
                disabled={rollbackMutation.isPending}
                onClick={(e) => { e.stopPropagation(); rollbackMutation.mutate(b.source_id) }}
                className="px-2 py-1 border border-red-200 text-red-650 hover:bg-red-50 text-xs font-semibold rounded transition-colors flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                Rollback
              </button>
            )}
            {(b.source_module === 'coa_import' || b.source_module === 'pdf_import') && b.status === 'applied' && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); navigate(b.entity_id ? `/accounts?entity=${b.entity_id}` : '/accounts') }}
                className="px-2.5 py-1 border border-green-200 text-green-700 hover:bg-green-50 text-xs font-semibold rounded transition-colors flex items-center gap-1"
                data-testid="view-created-accounts"
              >
                View Created Accounts
              </button>
            )}
            {b.document_id && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); documentsApi.download(b.document_id) }}
                title="Download Source File"
                className="p-1 text-gray-400 hover:text-gray-650 rounded transition-colors hover:bg-gray-50"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )
      }
    }
  ]

  return (
    <PageLayout
      title="Import Center"
      subtitle="Financial cleanup workspace & data import command center"
      actions={
        <button
          type="button"
          onClick={() => navigate('/import/new')}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-650 text-white text-sm font-semibold rounded hover:bg-indigo-755 transition-colors shadow-sm cursor-pointer"
        >
          <Upload className="w-4 h-4" /> Generic Tabular Import
        </button>
      }
    >
      {apiError && <ErrorBanner message={apiError} />}

      {/* Entity-first enforcement */}
      {entityCount === 0 && (
        <div className="bg-amber-50 border border-amber-250 rounded-lg p-5 flex items-start gap-3 shadow-sm">
          <Building2 className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Create an entity first</p>
            <p className="text-xs text-amber-700 mt-1">
              Imports are associated with entities. You need at least one entity before uploading trial balance data.
            </p>
            <button
              type="button"
              onClick={() => navigate('/entities')}
              className="mt-2 flex items-center gap-1 text-xs text-amber-700 underline font-medium hover:text-amber-900 cursor-pointer"
            >
              Go to Entities <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Workspace Filters Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between flex-wrap gap-4 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Filter workspace by entity:</span>
          <EntitySelect
            value={entityId}
            onChange={(val) => setEntityId(val)}
            className="w-56"
          />
        </div>
      </div>

      {/* 4-Step Import Pipeline */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden" data-testid="import-pipeline">
        <div className="grid grid-cols-4 divide-x divide-slate-100">
          {[
            { step: 1, label: 'Import Data', sub: `${mappedEntries.length} imports`, href: null, active: true },
            { step: 2, label: 'Map & Classify', sub: `${stats.awaitingMapping} awaiting`, href: '/client-data/chart-of-accounts', active: stats.awaitingMapping === 0 },
            { step: 3, label: 'Validate', sub: stats.validationIssues > 0 || stats.outOfBalance > 0 ? `${stats.validationIssues + stats.outOfBalance} issues` : 'No issues', href: null, active: stats.validationIssues === 0 && stats.outOfBalance === 0 },
            { step: 4, label: 'Ready for Workbench', sub: `${stats.recentlyFinalized} finalized`, href: '/workbench/adjustment-bridge', active: stats.recentlyFinalized > 0 },
          ].map(({ step, label, sub, href, active }) => (
            <button
              key={step}
              type="button"
              onClick={() => href && navigate(href)}
              className={`flex flex-col items-start px-5 py-4 text-left transition-colors ${href ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{step}</span>
                <span className={`text-xs font-bold ${active ? 'text-slate-800' : 'text-slate-400'}`}>{label}</span>
              </div>
              <span className={`text-[10px] font-medium pl-7 ${active ? 'text-slate-500' : 'text-slate-400'}`}>{sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Operational summary pipeline indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Awaiting Mapping</div>
          <div className="text-2xl font-bold mt-1 text-amber-600">{stats.awaitingMapping}</div>
          <p className="text-[10px] text-slate-400 mt-1">Accounts need taxonomy links</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Validation Issues</div>
          <div className="text-2xl font-bold mt-1 text-rose-600">{stats.validationIssues}</div>
          <p className="text-[10px] text-slate-400 mt-1">Exceptions needing correction</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Out-Of-Balance</div>
          <div className="text-2xl font-bold mt-1 text-red-600">{stats.outOfBalance}</div>
          <p className="text-[10px] text-slate-400 mt-1">Debit & credit discrepancies</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Awaiting Review</div>
          <div className="text-2xl font-bold mt-1 text-indigo-650">{stats.awaitingReview}</div>
          <p className="text-[10px] text-slate-400 mt-1">Staged but not yet posted</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recently Finalized</div>
          <div className="text-2xl font-bold mt-1 text-emerald-600">{stats.recentlyFinalized}</div>
          <p className="text-[10px] text-slate-400 mt-1">Posted in current period</p>
        </div>
      </div>

      {/* Modern dashed Upload Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Trial Balance Card */}
        <div
          onClick={() => navigate('/imports/trial-balance')}
          className="border border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:border-indigo-650 hover:bg-indigo-50/10 transition-all duration-200"
        >
          <div className="mx-auto mb-3 rounded-lg bg-indigo-50 p-2.5 w-11 h-11 flex items-center justify-center text-indigo-600">
            <FileText className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-semibold text-gray-800">Trial Balance</h3>
          <p className="text-[10px] text-gray-400 mt-1">Guided step-by-step import & validation</p>
          <div className="flex gap-1 justify-center mt-2">
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-650 uppercase border border-gray-200">CSV</span>
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-655 uppercase border border-gray-200">XLSX</span>
          </div>
        </div>

        {/* General Ledger Card */}
        <div
          onClick={() => navigate('/imports/general-ledger')}
          className="border border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:border-emerald-650 hover:bg-emerald-50/10 transition-all duration-200"
        >
          <div className="mx-auto mb-3 rounded-lg bg-emerald-50 p-2.5 w-11 h-11 flex items-center justify-center text-emerald-600">
            <FileText className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-semibold text-gray-800">General Ledger</h3>
          <p className="text-[10px] text-gray-400 mt-1">Transaction journals import & check</p>
          <div className="flex gap-1 justify-center mt-2">
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-650 uppercase border border-gray-200">CSV</span>
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-655 uppercase border border-gray-200">XLSX</span>
          </div>
        </div>

        {/* Journal Entries Card */}
        <div
          onClick={() => navigate('/imports/journal-entries')}
          className="border border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:border-amber-650 hover:bg-amber-50/10 transition-all duration-200"
        >
          <div className="mx-auto mb-3 rounded-lg bg-amber-50 p-2.5 w-11 h-11 flex items-center justify-center text-amber-600">
            <FileText className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-semibold text-gray-800">Journal Entries</h3>
          <p className="text-[10px] text-gray-400 mt-1">Reversing entries & overlay scenarios</p>
          <div className="flex gap-1 justify-center mt-2">
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-650 uppercase border border-gray-200">CSV</span>
          </div>
        </div>

        {/* Chart of Accounts Card */}
        <div
          onClick={() => navigate('/coa-import')}
          className="border border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:border-blue-600 hover:bg-blue-50/10 transition-all duration-200"
        >
          <div className="mx-auto mb-3 rounded-lg bg-blue-50 p-2.5 w-11 h-11 flex items-center justify-center text-blue-600">
            <FileText className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-semibold text-gray-800">Chart of Accounts</h3>
          <p className="text-[10px] text-gray-400 mt-1">QuickBooks, CSV structure mapping</p>
          <div className="flex gap-1 justify-center mt-2">
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-650 uppercase border border-gray-200">QB</span>
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-655 uppercase border border-gray-200">CSV</span>
          </div>
        </div>

        {/* PDF Card */}
        <div
          onClick={() => navigate('/pdf-import')}
          className="border border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:border-orange-655 hover:bg-orange-50/10 transition-all duration-200"
        >
          <div className="mx-auto mb-3 rounded-lg bg-orange-50 p-2.5 w-11 h-11 flex items-center justify-center text-orange-600">
            <Sparkles className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-semibold text-gray-800">PDF Import</h3>
          <p className="text-[10px] text-gray-400 mt-1">AI-Powered Statement Parser</p>
          <div className="flex gap-1 justify-center mt-2">
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-655 uppercase border border-gray-200">PDF</span>
          </div>
        </div>

        {/* Generic Tabular Card */}
        <div
          onClick={() => navigate('/import/new')}
          className="border border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:border-purple-600 hover:bg-purple-50/10 transition-all duration-200"
        >
          <div className="mx-auto mb-3 rounded-lg bg-purple-50 p-2.5 w-11 h-11 flex items-center justify-center text-purple-600">
            <Upload className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-semibold text-gray-800">Generic Tabular Import</h3>
          <p className="text-[10px] text-gray-400 mt-1">Custom excel sheets & schema builder</p>
          <div className="flex gap-1 justify-center mt-2">
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-650 uppercase border border-gray-200">XLSX</span>
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-655 uppercase border border-gray-200">CSV</span>
          </div>
        </div>
      </div>

      {/* Format Help Collapse Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <button
          type="button"
          onClick={() => setShowFormatHelp(!showFormatHelp)}
          className="text-xs font-bold text-indigo-650 hover:text-indigo-850 flex items-center gap-1 cursor-pointer select-none"
        >
          {showFormatHelp ? 'Hide accepted formats' : 'Show accepted formats'}
        </button>
        {showFormatHelp && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs animate-in slide-in-from-top-2 duration-150 border-t border-slate-100 pt-3">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/60">
              <h4 className="font-bold text-slate-800 mb-1">Format A: Standard trial balance</h4>
              <p className="text-slate-500 leading-relaxed">Required columns: account_number, account_name, debit, credit.</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/60">
              <h4 className="font-bold text-slate-800 mb-1">Format B: Multi-period trial balance</h4>
              <p className="text-slate-500 leading-relaxed">Columns: account, debit_Q1, credit_Q1, debit_Q2, credit_Q2...</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/60">
              <h4 className="font-bold text-slate-800 mb-1">Format C: Transactions detail ledger</h4>
              <p className="text-slate-500 leading-relaxed">Columns: date, journal_id, description, account, amount...</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/60">
              <h4 className="font-bold text-slate-800 mb-1">Format D: Chart of accounts structure</h4>
              <p className="text-slate-500 leading-relaxed">Columns: account_code, name, type, detail_type, parent_code...</p>
            </div>
          </div>
        )}
      </div>

      {/* Main split layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Form/Placeholder & History Grid (Col span 3) */}
        <div className="lg:col-span-3 space-y-6">
          {/* Import Center Tabs Card */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4 bg-gray-50/50">
              <div className="flex border-b border-gray-200 w-full sm:w-auto">
                {(['recent', 'mapping', 'validation', 'documents'] as const).map((tab) => {
                  const label = {
                    recent: 'Recent Imports',
                    mapping: 'Mapping Queue',
                    validation: 'Validation Queue',
                    documents: 'Source Documents',
                  }[tab]
                  const count = {
                    recent: mappedEntries.length,
                    mapping: mappedEntries.filter(e => e.lifecycleStatus === 'Awaiting Mapping').length,
                    validation: mappedEntries.filter(e => e.lifecycleStatus === 'Validation Errors' || e.errorMsg || e.isOutOfBalance).length,
                    documents: mappedEntries.filter(e => e.document_id).length,
                  }[tab]
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTabSection(tab)}
                      className={`px-4 py-2.5 text-xs font-bold border-b-2 -mb-[2px] transition-all cursor-pointer ${
                        activeTabSection === tab
                          ? 'border-indigo-600 text-indigo-700'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {label} <span className="ml-1 bg-gray-100 text-gray-650 px-1.5 py-0.5 rounded-full text-[10px]">{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            
            <AccountingDataGrid
              columns={columns}
              data={filteredData}
              rowKey={(b) => b.id}
              onRowClick={(b) => navigate(b.reviewActionPath)}
              rowActions={[
                {
                  key: 'open',
                  label: 'Open Import Details',
                  icon: ChevronRight,
                  onClick: (b) => navigate(b.reviewActionPath),
                },
                {
                  key: 'download',
                  label: 'Download Source File',
                  icon: Download,
                  hidden: (b) => !b.document_id,
                  onClick: (b) => { if (b.document_id) documentsApi.download(b.document_id) },
                },
                {
                  key: 'rollback',
                  label: 'Rollback Ledger Postings',
                  icon: RotateCcw,
                  variant: 'danger',
                  hidden: (b) => b.source_module !== 'tb_import' || b.status !== 'posted',
                  onClick: (b) => rollbackMutation.mutate(b.source_id),
                },
                {
                  key: 'view_created_accounts',
                  label: 'View Created Accounts',
                  icon: ChevronRight,
                  hidden: (b) => (b.source_module !== 'coa_import' && b.source_module !== 'pdf_import') || b.status !== 'applied',
                  onClick: (b) => navigate(b.entity_id ? `/accounts?entity=${b.entity_id}` : '/accounts'),
                },
              ]}
              exportFilename={`financial_cleanup_${activeTabSection}_queue`}
              loading={isRegistryLoading && !tbBatches && !pdfBatches && !coaBatches}
              emptyMessage={`No entries found in the ${activeTabSection} list.`}
              data-testid="import-history-grid"
            />
          </div>
        </div>

      </div>
    </PageLayout>
  )
}
