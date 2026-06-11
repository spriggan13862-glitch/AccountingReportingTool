import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Calendar,
  FileText,
  Database,
  List,
  GitBranch,
  FolderOpen,
  Rocket,
  Upload,
} from 'lucide-react'
import { tbImportApi } from '@/api/tbImport'
import { pdfImportApi } from '@/api/pdfImport'
import { coaImportApi } from '@/api/coaImport'
import { importRegistryApi } from '@/api/importRegistry'
import { PageLayout } from '@/components/ui/PageLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { useOrg } from '@/providers/OrgProvider'
import { cn } from '@/utils/cn'
import type { ImportBatch, PDFImportBatch, COAImportBatch } from '@/types'

export function ClientDataPage() {
  const { org } = useOrg()
  const orgId = org?.id ?? 0
  const navigate = useNavigate()

  const { data: tbBatches } = useQuery({
    queryKey: ['import-batches', orgId],
    queryFn: () => tbImportApi.listBatches(orgId),
    enabled: !!orgId,
  })

  const { data: pdfBatches } = useQuery({
    queryKey: ['pdf-batches'],
    queryFn: () => pdfImportApi.list(),
  })

  const { data: coaBatches } = useQuery({
    queryKey: ['coa-batches'],
    queryFn: () => coaImportApi.list(),
  })

  const { data: registryEntries } = useQuery({
    queryKey: ['import-registry'],
    queryFn: () => importRegistryApi.list(),
  })

  const readiness = useMemo(() => {
    const hasCOA = coaBatches?.some(b => b.status === 'applied') ?? false
    const hasTB = tbBatches?.some(b => ['posted', 'ready_to_post', 'mapping_required'].includes(b.status)) ?? false
    const hasPDF = pdfBatches?.some(b => b.status === 'applied') ?? false
    const outOfBalance = tbBatches?.filter(b => Math.abs(parseFloat(b.total_debits ?? '0') - parseFloat(b.total_credits ?? '0')) > 0.01).length ?? 0
    const totalRows = tbBatches?.reduce((s, b) => s + (b.row_count ?? 0), 0) ?? 0
    const unmappedRows = tbBatches?.reduce((s, b) => s + (b.unmapped_row_count ?? 0), 0) ?? 0
    const mappingPct = totalRows > 0 ? Math.round(((totalRows - unmappedRows) / totalRows) * 100) : null
    const validationErrors =
      (tbBatches?.filter(b => ['failed', 'validation_failed'].includes(b.status)).length ?? 0) +
      (pdfBatches?.filter(b => ['failed', 'error'].includes(b.status)).length ?? 0) +
      (coaBatches?.filter(b => b.status === 'failed').length ?? 0)
    const awaitingMapping = tbBatches?.filter(b => b.status === 'mapping_required').length ?? 0
    const pendingReview = tbBatches?.filter(b => b.status === 'ready_to_post').length ?? 0
    const missingPeriod = tbBatches?.filter(b => !b.period_id).length ?? 0
    const docCount = registryEntries?.filter(e => e.document_id != null).length ?? 0
    const importedAccounts = coaBatches?.reduce((s, b) => s + (b.accounts_created ?? 0), 0) ?? 0
    const isReady = hasCOA && hasTB && outOfBalance === 0 && validationErrors === 0 && unmappedRows === 0
    return {
      hasCOA, hasTB, hasPDF, outOfBalance, totalRows, unmappedRows, mappingPct,
      validationErrors, awaitingMapping, pendingReview, missingPeriod, docCount,
      importedAccounts, isReady,
    }
  }, [tbBatches, pdfBatches, coaBatches, registryEntries])

  const readinessCards = [
    {
      testid: 'readiness-card-coa',
      label: 'Chart of Accounts',
      icon: <List className="w-5 h-5" />,
      status: readiness.hasCOA ? 'Ready' : 'Setup Required',
      ok: readiness.hasCOA,
    },
    {
      testid: 'readiness-card-tb',
      label: 'Trial Balance',
      icon: <Database className="w-5 h-5" />,
      status: readiness.hasTB ? 'Imported' : 'Missing',
      ok: readiness.hasTB,
    },
    {
      testid: 'readiness-card-pdf',
      label: 'PDF Statements',
      icon: <FileText className="w-5 h-5" />,
      status: readiness.hasPDF ? 'Imported' : 'Missing',
      ok: readiness.hasPDF,
    },
    {
      testid: 'readiness-card-gl',
      label: 'GL Import',
      icon: <GitBranch className="w-5 h-5" />,
      status: '—',
      ok: null,
    },
    {
      testid: 'readiness-card-taxonomy',
      label: 'Taxonomy Mapping',
      icon: <Calendar className="w-5 h-5" />,
      status: readiness.mappingPct != null ? `${readiness.mappingPct}% Mapped` : '—',
      ok: readiness.mappingPct != null ? readiness.mappingPct === 100 : null,
    },
    {
      testid: 'readiness-card-documents',
      label: 'Documents',
      icon: <FolderOpen className="w-5 h-5" />,
      status: `${readiness.docCount} Uploaded`,
      ok: null,
    },
  ]

  const issueCards = [
    {
      testid: 'issue-card-unmapped',
      label: 'Unmapped Accounts',
      count: readiness.unmappedRows,
      href: '/client-data/chart-of-accounts',
    },
    {
      testid: 'issue-card-oof',
      label: 'Out of Balance',
      count: readiness.outOfBalance,
      href: '/client-data/imports',
    },
    {
      testid: 'issue-card-validation',
      label: 'Validation Errors',
      count: readiness.validationErrors,
      href: '/client-data/imports',
    },
    {
      testid: 'issue-card-mapping',
      label: 'Awaiting Mapping',
      count: readiness.awaitingMapping,
      href: '/client-data/imports',
    },
    {
      testid: 'issue-card-period',
      label: 'Missing Period',
      count: readiness.missingPeriod,
      href: '/client-data/periods',
    },
  ]

  const quickAccessLinks = [
    { label: 'Trial Balance', href: '/client-data/imports/trial-balance', icon: <Database className="w-4 h-4" /> },
    { label: 'General Ledger', href: '/client-data/imports/general-ledger', icon: <GitBranch className="w-4 h-4" /> },
    { label: 'COA Import', href: '/client-data/imports/coa', icon: <List className="w-4 h-4" /> },
    { label: 'PDF Statement', href: '/client-data/imports/pdf', icon: <FileText className="w-4 h-4" /> },
    { label: 'Journal Entries', href: '/client-data/imports/journal-entries', icon: <Upload className="w-4 h-4" /> },
  ]

  return (
    <PageLayout
      title="Client Data"
      subtitle="Book readiness and import pipeline status"
      breadcrumb={
        <Breadcrumb
          items={[
            { label: 'Engagement', href: '/engagement/dashboard' },
            { label: 'Client Data' },
          ]}
        />
      }
    >
      {/* Book Readiness Grid */}
      <div
        data-testid="readiness-grid"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4"
      >
        {readinessCards.map(card => (
          <div
            key={card.testid}
            data-testid={card.testid}
            className={cn(
              'bg-white border rounded-xl p-4 shadow-sm flex flex-col gap-2',
              card.ok === true
                ? 'border-emerald-200'
                : card.ok === false
                ? 'border-amber-200'
                : 'border-slate-200',
            )}
          >
            <div
              className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center',
                card.ok === true
                  ? 'bg-emerald-50 text-emerald-600'
                  : card.ok === false
                  ? 'bg-amber-50 text-amber-600'
                  : 'bg-slate-50 text-slate-400',
              )}
            >
              {card.icon}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{card.label}</p>
              <p
                className={cn(
                  'text-sm font-semibold mt-0.5',
                  card.ok === true
                    ? 'text-emerald-700'
                    : card.ok === false
                    ? 'text-amber-700'
                    : 'text-slate-500',
                )}
              >
                {card.ok === true && <CheckCircle2 className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />}
                {card.ok === false && <AlertTriangle className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />}
                {card.status}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Issues Panel */}
      <div
        data-testid="readiness-issues"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4"
      >
        {issueCards.map(card => (
          <button
            key={card.testid}
            data-testid={card.testid}
            type="button"
            onClick={() => navigate(card.href)}
            className={cn(
              'bg-white border rounded-xl p-4 shadow-sm text-left hover:shadow-md transition-shadow group',
              card.count > 0 ? 'border-amber-200' : 'border-slate-200',
            )}
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{card.label}</p>
            <p
              className={cn(
                'text-2xl font-bold mt-1',
                card.count > 0 ? 'text-amber-600' : 'text-emerald-600',
              )}
            >
              {card.count}
            </p>
            <ArrowRight
              className={cn(
                'w-3.5 h-3.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity',
                card.count > 0 ? 'text-amber-500' : 'text-emerald-500',
              )}
            />
          </button>
        ))}
      </div>

      {/* Import Type Quick Access */}
      <div
        data-testid="import-quick-access"
        className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm"
      >
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Import Data</p>
        <div className="flex flex-wrap gap-2">
          {quickAccessLinks.map(link => (
            <button
              key={link.href}
              type="button"
              onClick={() => navigate(link.href)}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-slate-700 hover:text-indigo-700 text-xs font-semibold rounded-lg transition-colors"
            >
              {link.icon}
              {link.label}
            </button>
          ))}
        </div>
      </div>

      {/* Workbench Launch Section */}
      <div
        data-testid="workbench-launch"
        className={cn(
          'rounded-xl border p-6 shadow-sm',
          readiness.isReady
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-slate-50 border-slate-200',
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
                readiness.isReady ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400',
              )}
            >
              <Rocket className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Adjustment Workbench</h2>
              <p
                data-testid="workbench-readiness-status"
                className={cn(
                  'text-sm font-medium mt-0.5',
                  readiness.isReady ? 'text-emerald-700' : 'text-slate-500',
                )}
              >
                {readiness.isReady ? 'Ready' : 'Issues Found'}
              </p>
              <div className="flex flex-wrap gap-4 mt-2 text-[11px] text-slate-500">
                <span>
                  <span className="font-bold text-slate-700">{readiness.importedAccounts}</span> Imported Accounts
                </span>
                <span>
                  <span className="font-bold text-slate-700">{readiness.docCount}</span> Documents
                </span>
              </div>
            </div>
          </div>
          <button
            data-testid="launch-workbench-btn"
            type="button"
            disabled={!readiness.isReady}
            onClick={() => navigate('/workbench/adjustment-bridge')}
            title={!readiness.isReady ? 'Resolve all issues before launching the workbench' : undefined}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors shrink-0',
              readiness.isReady
                ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm cursor-pointer'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed',
            )}
          >
            <Rocket className="w-4 h-4" />
            Launch Adjustment Workbench
          </button>
        </div>
      </div>
    </PageLayout>
  )
}
