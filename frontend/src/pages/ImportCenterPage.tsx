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
  Download
} from 'lucide-react'
import { tbImportApi } from '@/api/tbImport'
import { entitiesApi } from '@/api/entities'
import { importRegistryApi } from '@/api/importRegistry'
import { pdfImportApi } from '@/api/pdfImport'
import { coaImportApi } from '@/api/coaImport'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { useOrg } from '@/providers/OrgProvider'
import { useToast } from '@/providers/ToastProvider'
import { AccountingDataGrid } from '@/components/data-grid'
import type { ImportBatch, ImportBatchStatus } from '@/types'

function statusBadge(status: ImportBatchStatus) {
  const map: Record<ImportBatchStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    uploaded:         { label: 'Uploaded',         cls: 'bg-gray-100 border-gray-200 text-gray-700',   icon: <Clock className="w-3 h-3" /> },
    parsing:          { label: 'Parsing',           cls: 'bg-blue-50 border-blue-200 text-blue-700',   icon: <Clock className="w-3 h-3 animate-spin" /> },
    mapping_required: { label: 'Mapping Required',  cls: 'bg-amber-50 border-amber-200 text-amber-800', icon: <AlertCircle className="w-3 h-3" /> },
    validating:       { label: 'Validating',        cls: 'bg-blue-50 border-blue-200 text-blue-700',   icon: <Clock className="w-3 h-3 animate-spin" /> },
    validation_failed:{ label: 'Validation Failed', cls: 'bg-red-50 border-red-200 text-red-700',     icon: <XCircle className="w-3 h-3" /> },
    ready_to_post:    { label: 'Ready to Post',     cls: 'bg-green-50 border-green-200 text-green-700', icon: <CheckCircle className="w-3 h-3" /> },
    posted:           { label: 'Posted',            cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: <CheckCircle className="w-3 h-3" /> },
    rolled_back:      { label: 'Rolled Back',       cls: 'bg-orange-50 border-orange-200 text-orange-700', icon: <XCircle className="w-3 h-3" /> },
    rejected:         { label: 'Rejected',          cls: 'bg-red-50 border-red-200 text-red-700',     icon: <XCircle className="w-3 h-3" /> },
  }
  const { label, cls, icon } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600', icon: null }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-semibold ${cls}`}>
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

  // Current active configuration card view (defaults to Trial Balance)
  const [activeTab, setActiveTab] = useState<'tb' | 'gl'>('tb')

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

  // Map lifecycle statuses to badge styling
  const getLifecycleBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
      'Uploaded': { label: 'Uploaded', cls: 'bg-gray-150 border-gray-300 text-gray-700', icon: <Clock className="w-3 h-3" /> },
      'Parsed': { label: 'Parsed', cls: 'bg-blue-50 border-blue-200 text-blue-700', icon: <Clock className="w-3 h-3" /> },
      'Validation Errors': { label: 'Validation Errors', cls: 'bg-red-50 border-red-200 text-red-700', icon: <XCircle className="w-3 h-3" /> },
      'Awaiting Mapping': { label: 'Mapping Required', cls: 'bg-amber-50 border-amber-250 text-amber-800', icon: <AlertCircle className="w-3 h-3" /> },
      'Ready for Review': { label: 'Ready for Review', cls: 'bg-indigo-50 border-indigo-250 text-indigo-800', icon: <CheckCircle className="w-3 h-3" /> },
      'Finalized': { label: 'Finalized', cls: 'bg-emerald-50 border-emerald-250 text-emerald-700', icon: <CheckCircle className="w-3 h-3" /> },
    }
    const { label, cls, icon } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600', icon: null }
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${cls}`}>
        {icon}
        {label}
      </span>
    )
  }

  return (
    <PageLayout
      title="Import Center"
      subtitle="Financial cleanup workspace & data import command center"
      actions={
        <button
          type="button"
          onClick={() => navigate('/import/new')}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm font-semibold rounded hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer"
        >
          <Upload className="w-4 h-4" /> New Import Wizard
        </button>
      }
    >
      {apiError && <ErrorBanner message={apiError} />}

      {/* Entity-first enforcement */}
      {entityCount === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 flex items-start gap-3 shadow-sm">
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

      {/* Operational summary pipeline indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs relative">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Awaiting Mapping</div>
          <div className="text-2xl font-bold mt-1 text-amber-600">{stats.awaitingMapping}</div>
          <p className="text-[10px] text-slate-400 mt-1">Accounts need taxonomy links</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs relative">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Validation Issues</div>
          <div className="text-2xl font-bold mt-1 text-rose-600">{stats.validationIssues}</div>
          <p className="text-[10px] text-slate-400 mt-1">Exceptions needing correction</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs relative">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Out-Of-Balance</div>
          <div className="text-2xl font-bold mt-1 text-red-650">{stats.outOfBalance}</div>
          <p className="text-[10px] text-slate-400 mt-1">Debit & credit discrepancies</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs relative">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Awaiting Review</div>
          <div className="text-2xl font-bold mt-1 text-indigo-600">{stats.awaitingReview}</div>
          <p className="text-[10px] text-slate-400 mt-1">Staged but not yet posted</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs relative">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recently Finalized</div>
          <div className="text-2xl font-bold mt-1 text-emerald-650">{stats.recentlyFinalized}</div>
          <p className="text-[10px] text-slate-400 mt-1">Posted in current period</p>
        </div>
      </div>

      {/* Modern dashed Upload Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Trial Balance Card */}
        <div
          onClick={() => setActiveTab('tb')}
          className={`border rounded-lg p-5 text-center cursor-pointer transition-all duration-200 ${
            activeTab === 'tb'
              ? 'border-indigo-600 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-600'
              : 'border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50'
          }`}
        >
          <div className="mx-auto mb-3 rounded-lg bg-indigo-100 p-2.5 w-11 h-11 flex items-center justify-center text-indigo-600">
            <FileText className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-semibold text-gray-800">Trial Balance</h3>
          <p className="text-[10px] text-gray-400 mt-1">CSV, XLSX</p>
          <div className="flex gap-1 justify-center mt-2">
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-600 uppercase border border-gray-200">CSV</span>
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-600 uppercase border border-gray-200">XLSX</span>
          </div>
        </div>

        {/* General Ledger Card */}
        <div
          onClick={() => setActiveTab('gl')}
          className={`border rounded-lg p-5 text-center cursor-pointer transition-all duration-200 ${
            activeTab === 'gl'
              ? 'border-indigo-600 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-600'
              : 'border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50'
          }`}
        >
          <div className="mx-auto mb-3 rounded-lg bg-emerald-100 p-2.5 w-11 h-11 flex items-center justify-center text-emerald-600">
            <FileText className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-semibold text-gray-800">General Ledger</h3>
          <p className="text-[10px] text-gray-400 mt-1">CSV, XLSX</p>
          <div className="flex gap-1 justify-center mt-2">
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-600 uppercase border border-gray-200">CSV</span>
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-600 uppercase border border-gray-200">XLSX</span>
          </div>
        </div>

        {/* Chart of Accounts Card */}
        <div
          onClick={() => navigate('/coa-import')}
          className="border border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:border-indigo-600 hover:bg-indigo-50/10 transition-all duration-200"
        >
          <div className="mx-auto mb-3 rounded-lg bg-blue-100 p-2.5 w-11 h-11 flex items-center justify-center text-blue-600">
            <FileText className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-semibold text-gray-800">Chart of Accounts</h3>
          <p className="text-[10px] text-gray-400 mt-1">QuickBooks, CSV</p>
          <div className="flex gap-1 justify-center mt-2">
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-600 uppercase border border-gray-200">QB</span>
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-600 uppercase border border-gray-200">CSV</span>
          </div>
        </div>

        {/* PDF Card */}
        <div
          onClick={() => navigate('/pdf-import')}
          className="border border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:border-indigo-600 hover:bg-indigo-50/10 transition-all duration-200"
        >
          <div className="mx-auto mb-3 rounded-lg bg-orange-100 p-2.5 w-11 h-11 flex items-center justify-center text-orange-600">
            <FileText className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-semibold text-gray-800">PDF Import</h3>
          <p className="text-[10px] text-gray-400 mt-1">AI-Powered Parser</p>
          <div className="flex gap-1 justify-center mt-2">
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-600 uppercase border border-gray-200">PDF</span>
          </div>
        </div>

        {/* Excel / CSV Card */}
        <div
          onClick={() => navigate('/import/new')}
          className="border border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:border-indigo-600 hover:bg-indigo-50/10 transition-all duration-200"
        >
          <div className="mx-auto mb-3 rounded-lg bg-purple-100 p-2.5 w-11 h-11 flex items-center justify-center text-purple-600">
            <Upload className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-semibold text-gray-800">Excel / CSV</h3>
          <p className="text-[10px] text-gray-400 mt-1">Generic Wizard</p>
          <div className="flex gap-1 justify-center mt-2">
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-600 uppercase border border-gray-200">XLSX</span>
            <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 text-gray-600 uppercase border border-gray-200">CSV</span>
          </div>
        </div>
      </div>

      {/* Main split layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Form/Placeholder & History Grid (Col span 3) */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Quick upload form inline (if Trial Balance selected) */}
          {activeTab === 'tb' && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-800 mb-1">Quick Upload — Trial Balance</h2>
              <p className="text-xs text-gray-500 mb-4">
                For guided step-by-step import with sheet selection and column mapping, use the{' '}
                <button type="button" onClick={() => navigate('/import/new')} className="text-indigo-600 font-semibold hover:underline cursor-pointer">
                  Import Wizard
                </button>
                .
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Entity</label>
                  <EntitySelect value={entityId} onChange={setEntityId} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">As-of Date</label>
                  <input
                    type="date"
                    value={asOfDate}
                    onChange={(e) => setAsOfDate(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Format guidance toggle */}
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => setShowFormatHelp((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium hover:text-indigo-800 cursor-pointer"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  {showFormatHelp ? 'Hide format guidance' : 'Show accepted formats & tips'}
                </button>
                {showFormatHelp && (
                  <div className="mt-2 p-4 bg-indigo-50/50 border border-indigo-100 rounded-lg text-xs text-indigo-900 space-y-3">
                    <p className="font-semibold text-indigo-950">Accepted file formats:</p>
                    <ul className="space-y-1 list-disc list-inside text-indigo-800">
                      <li><strong>CSV/XLSX</strong> — account number, account name, and debit/credit or signed-amount columns</li>
                      <li><strong>QuickBooks (.QBO)</strong> — QBO transaction export</li>
                      <li><strong>NetSuite</strong> — GL detail export with "Account" and "Amount" columns</li>
                      <li><strong>Sage</strong> — trial balance export</li>
                    </ul>

                    <p className="font-semibold text-indigo-950">Common column name patterns (auto-detected):</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-white border border-indigo-100 p-2.5 rounded font-mono text-[10px] text-indigo-700">
                      <span>Account #, Acct, Number → account number</span>
                      <span>Name, Description → account name</span>
                      <span>Debit, Dr → debit amount</span>
                      <span>Credit, Cr → credit amount</span>
                      <span>Balance, Amount, Net → signed net balance</span>
                      <span>"1000 - Cash" → combined number/name</span>
                    </div>

                    <div>
                      <p className="font-semibold text-indigo-950 mb-1.5">Download starter templates:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[
                          { label: 'Format A — Debit/Credit', filename: 'template_debit_credit.csv',
                            content: 'Account Number,Account Name,Debit,Credit\n1000,Cash,50000.00,0.00\n4000,Revenue,0.00,50000.00\n' },
                          { label: 'Format B — Signed Amount', filename: 'template_signed_amount.csv',
                            content: 'Account Number,Account Name,Amount\n1000,Cash,50000.00\n4000,Revenue,-50000.00\n' },
                          { label: 'Format C — Combined Account', filename: 'template_combined.csv',
                            content: 'Account,Debit,Credit\n1000 - Cash,50000.00,0.00\n4000 - Revenue,0.00,50000.00\n' },
                          { label: 'Format D — Mapping Template', filename: 'template_mapping.csv',
                            content: 'Source Account Number,Source Account Name,Internal Account Number,Internal Account Name,Account Type,Detail Type,Reporting Line\n1000,Cash,1000,Cash,asset,current_asset,Current Assets\n4000,Revenue,4000,Revenue,revenue,operating_revenue,Revenue\n' },
                        ].map(({ label, filename, content }) => (
                          <button
                            key={filename}
                            type="button"
                            onClick={() => {
                              const blob = new Blob([content], { type: 'text/csv' })
                              const url = URL.createObjectURL(blob)
                              const a = document.createElement('a')
                              a.href = url
                              a.download = filename
                              a.click()
                              URL.revokeObjectURL(url)
                            }}
                            className="flex items-center gap-1.5 px-2 py-1.5 bg-white border border-indigo-200 rounded text-indigo-700 hover:bg-indigo-100 font-semibold transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5 flex-shrink-0" />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200 ${
                  dragOver ? 'border-indigo-400 bg-indigo-50/50' : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                {file ? (
                  <p className="text-sm font-semibold text-gray-700">{file.name}</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-600">Drag &amp; drop a CSV or XLSX file, or click to browse</p>
                    <p className="text-xs text-gray-400 mt-1">Supports CSV, XLSX, QBO, NetSuite, Sage exports</p>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  disabled={!file || !entityId || !asOfDate || uploadMutation.isPending}
                  onClick={() => uploadMutation.mutate()}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                >
                  {uploadMutation.isPending ? 'Uploading…' : 'Upload & Begin Review'}
                </button>
              </div>
            </div>
          )}

          {/* General Ledger Placeholder inline (if GL selected) */}
          {activeTab === 'gl' && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-emerald-100 p-2.5 text-emerald-600">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-gray-800 mb-1">General Ledger Import</h2>
                  <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                    Sync full transaction journals directly from your general ledger. Direct ERP API synchronization
                    (NetSuite, QuickBooks Online, Sage Intacct) is currently in closed preview.
                  </p>
                  
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 space-y-2">
                    <p className="text-xs text-gray-600 font-semibold">Alternative Manual Mechanics:</p>
                    <ul className="text-xs text-gray-500 list-disc list-inside space-y-1">
                      <li>Use the <button type="button" onClick={() => navigate('/journal-entries/new')} className="text-indigo-600 font-semibold hover:underline cursor-pointer">Journal Entries</button> ledger modules to create manual journals.</li>
                      <li>Import a Trial Balance using the left card above to establish period-end balances.</li>
                      <li>Contact <span className="font-mono text-[10px] bg-white border px-1.5 py-0.5 rounded text-gray-700">ledger-support@livemarketing.test</span> to request API access.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Import History Table card */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">Import Registry</h2>
            </div>
            
            <AccountingDataGrid
              columns={[
                {
                  key: 'filename',
                  header: 'Import Name',
                  sortable: true,
                  sortValue: (b) => b.filename ?? '',
                  render: (b) => (
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
                  sortValue: (b) => b.source_entity_name ?? '',
                  render: (b) => <span className="text-gray-600">{b.source_entity_name || '—'}</span>,
                },
                {
                  key: 'source_module',
                  header: 'Import Type',
                  sortable: true,
                  sortValue: (b) => b.importTypeLabel,
                  render: (b) => <span className="text-xs text-gray-550 font-semibold">{b.importTypeLabel}</span>,
                },
                {
                  key: 'statement_date',
                  header: 'Import Date',
                  sortable: true,
                  sortValue: (b) => b.statement_date ?? b.created_at ?? '',
                  render: (b) => <span className="text-gray-600">{b.statement_date || (b.created_at ? new Date(b.created_at).toLocaleDateString() : '—')}</span>,
                },
                {
                  key: 'lifecycleStatus',
                  header: 'Status',
                  sortable: true,
                  sortValue: (b) => b.lifecycleStatus,
                  render: (b) => getLifecycleBadge(b.lifecycleStatus),
                },
                {
                  key: 'validation_issues',
                  header: 'Validation Issues',
                  sortable: false,
                  render: (b) => (
                    <span className="text-xs">
                      {b.errorMsg ? (
                        <span className="text-rose-600 font-semibold flex items-center gap-1">
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
                  sortValue: (b) => b.progress,
                  render: (b) => (
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <div className="w-16 bg-gray-100 rounded-full h-1.5 shrink-0">
                        <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${b.progress}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-500 font-semibold">{b.progress}%</span>
                    </div>
                  ),
                },
                {
                  key: 'last_action',
                  header: 'Last Action',
                  sortable: true,
                  sortValue: (b) => b.lastAction,
                  render: (b) => <span className="text-gray-500">{b.lastAction}</span>,
                },
              ]}
              data={mappedEntries}
              rowKey={(b) => b.id}
              onRowClick={(b) => navigate(b.reviewActionPath)}
              rowActions={[
                {
                  key: 'action',
                  label: 'Execute Review Action',
                  icon: ChevronRight,
                  onClick: (b) => navigate(b.reviewActionPath),
                },
              ]}
              exportFilename="financial_cleanup_import_registry"
              loading={isRegistryLoading && !tbBatches && !pdfBatches && !coaBatches}
              emptyMessage="No financial imports found."
              data-testid="import-history-grid"
            />
          </div>
        </div>

      </div>
    </PageLayout>
  )
}


