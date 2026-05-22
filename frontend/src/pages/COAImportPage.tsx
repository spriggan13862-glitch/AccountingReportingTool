import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, CheckCircle, AlertCircle, Download, BookOpen, FileText, ChevronRight, Search, HelpCircle } from 'lucide-react'
import { coaImportApi } from '@/api/coaImport'
import { reportingTaxonomyApi } from '@/api/reportingTaxonomy'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { useToast } from '@/providers/ToastProvider'
import type { COAImportPreview } from '@/types'

const QB_FORMATS = [
  {
    label: 'QuickBooks Full Export',
    description: 'Account Name, Type, Detail Type, Description, Balance Total, Account #, Tax Line',
    filename: 'qb_coa_full.csv',
    content: 'Account Name,Type,Detail Type,Description,Balance Total,Account #,Tax Line\nCash,Bank,Checking,Operating checking,50000.00,1000,B/S-Assets: Cash\nAccounts Receivable,Accounts Receivable (A/R),Accounts Receivable,,25000.00,1100,B/S-Assets: Accts. Rec. and trade notes\nRevenue,Income,Service/Fee Income,,100000.00,4000,Income: Gross receipts or sales\nOffice Expenses,Expenses,Office Expenses,,5000.00,6000,Deductions: Other deductions\n',
  },
  {
    label: 'QuickBooks Simplified',
    description: 'Account Name, Type, Detail Type',
    filename: 'qb_coa_simple.csv',
    content: 'Account Name,Type,Detail Type\nCash,Bank,Checking\n  Petty Cash,Bank,Cash On Hand\nAccounts Receivable,Accounts Receivable (A/R),Accounts Receivable\n',
  },
  {
    label: 'Generic with Account Numbers',
    description: 'Account Number, Account Name, Account Type [, Detail Type]',
    filename: 'generic_coa.csv',
    content: 'Account Number,Account Name,Account Type,Detail Type\n1000,Cash,asset,Checking\n1100,Accounts Receivable,asset,Accounts Receivable\n4000,Revenue,revenue,Service/Fee Income\n6000,Office Expenses,expense,Office Expenses\n',
  },
]

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  asset:     'bg-blue-50 text-blue-700 border-blue-200',
  liability: 'bg-orange-50 text-orange-700 border-orange-200',
  equity:    'bg-purple-50 text-purple-700 border-purple-200',
  revenue:   'bg-green-50 text-green-700 border-green-200',
  expense:   'bg-red-50 text-red-700 border-red-200',
}

export function COAImportPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  const [entityId, setEntityId] = useState<number | ''>('')
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState<COAImportPreview | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  // Filter: which account type chip is selected
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  // Filter: show only unassigned rows
  const [unassignedOnly, setUnassignedOnly] = useState(false)
  // Global search
  const [searchQuery, setSearchQuery] = useState('')
  // Reporting line filter
  const [reportingLineFilter, setReportingLineFilter] = useState<number | ''>('')
  // Overrides: row_index → reporting_taxonomy_line_id
  const [overrides, setOverrides] = useState<Record<number, number>>({})

  const { data: taxonomyLines = [] } = useQuery({
    queryKey: ['reporting-taxonomy'],
    queryFn: () => reportingTaxonomyApi.list(),
    enabled: !!preview,
  })

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file || !entityId) throw new Error('Entity and file required')
      return coaImportApi.upload(entityId as number, file)
    },
    onSuccess: (data) => {
      setPreview(data)
      setApiError(null)
      setTypeFilter(null)
      setUnassignedOnly(false)
      setSearchQuery('')
      setReportingLineFilter('')
      setOverrides({})
    },
    onError: (err: Error) => { setApiError(err.message) },
  })

  const applyMutation = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error('No preview to apply')
      return coaImportApi.apply(preview.batch_id, overrides)
    },
    onSuccess: (batch) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
      toast(
        `COA imported: ${batch.accounts_created} created, ${batch.accounts_updated} updated`,
        'success',
      )
      navigate(`/accounts?entity=${entityId}`)
    },
    onError: (err: Error) => { setApiError(err.message) },
  })

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) { setFile(f); setPreview(null) }
  }

  function downloadTemplate(tpl: typeof QB_FORMATS[0]) {
    const blob = new Blob([tpl.content], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = tpl.filename; a.click()
    URL.revokeObjectURL(url)
  }

  // Count rows by type (from all rows, not filtered)
  const typeCounts = preview?.rows.reduce<Record<string, number>>((acc, row) => {
    const t = row.account_type ?? 'unknown'
    acc[t] = (acc[t] ?? 0) + 1
    return acc
  }, {}) ?? {}

  // Apply all filters to rows for the preview table
  const visibleRows = (preview?.rows ?? []).filter((row) => {
    if (typeFilter && row.account_type !== typeFilter) return false
    if (unassignedOnly && (overrides[row.row_index] || row.suggested_reporting_line)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (
        !row.account_name.toLowerCase().includes(q) &&
        !row.account_number.toLowerCase().includes(q) &&
        !(row.detail_type?.toLowerCase().includes(q)) &&
        !(row.tax_line?.toLowerCase().includes(q))
      ) return false
    }
    if (reportingLineFilter) {
      const hasLine = overrides[row.row_index] === reportingLineFilter ||
        (!overrides[row.row_index] && taxonomyLines.find((t) => t.id === reportingLineFilter && t.name === row.suggested_reporting_line))
      if (!hasLine) return false
    }
    return true
  })

  const unassignedCount = (preview?.rows ?? []).filter(
    (r) => !overrides[r.row_index] && !r.suggested_reporting_line,
  ).length

  return (
    <PageLayout
      title="Import Chart of Accounts"
      subtitle="Upload your QuickBooks or custom COA to seed your entity accounts"
    >
      {apiError && <ErrorBanner message={apiError} />}

      {/* Mapping chain banner */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 mb-5 text-sm text-indigo-800">
        <p className="font-semibold mb-1 flex items-center gap-1.5">
          <BookOpen className="w-4 h-4" /> Why import your COA first?
        </p>
        <p className="text-xs text-indigo-700 leading-relaxed mb-2">
          Your Chart of Accounts defines the structure of your entity's financials.
          Importing it first means trial balance imports auto-map to the right accounts.
          The QuickBooks <strong>Tax Line</strong> column is used as the primary hint for
          assigning each account to the correct <strong>Reporting / FSLI Line</strong> —
          it is <em>not</em> the source account itself.
        </p>
        <div className="flex items-center gap-1.5 flex-wrap text-xs font-mono text-indigo-600">
          <span className="bg-indigo-100 px-2 py-0.5 rounded">Source Account</span>
          <ChevronRight className="w-3 h-3" />
          <span className="bg-indigo-100 px-2 py-0.5 rounded">Entity COA</span>
          <ChevronRight className="w-3 h-3" />
          <span className="bg-indigo-100 px-2 py-0.5 rounded">Reporting / FSLI Line</span>
          <ChevronRight className="w-3 h-3" />
          <span className="bg-indigo-100 px-2 py-0.5 rounded">Financial Statements</span>
        </div>
      </div>

      {!preview ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-800">Step 1 — Select entity and upload file</h2>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Entity *</label>
            <EntitySelect value={entityId} onChange={setEntityId} />
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            {file ? (
              <p className="text-sm font-medium text-gray-700">{file.name}</p>
            ) : (
              <>
                <p className="text-sm text-gray-600">Drag & drop your COA export, or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">CSV or XLSX — QuickBooks, NetSuite, Sage, or generic</p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setPreview(null) } }}
            />
          </div>

          {/* Template downloads */}
          <div>
            <button
              type="button"
              onClick={() => setShowTemplates((v) => !v)}
              className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              <FileText className="w-3.5 h-3.5" />
              {showTemplates ? 'Hide starter templates' : 'Download starter templates'}
            </button>
            {showTemplates && (
              <div className="mt-3 grid grid-cols-1 gap-2">
                {QB_FORMATS.map((tpl) => (
                  <div key={tpl.filename} className="flex items-start justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <div>
                      <p className="text-xs font-semibold text-gray-700">{tpl.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{tpl.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadTemplate(tpl)}
                      className="flex items-center gap-1 ml-3 flex-shrink-0 text-xs px-2.5 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-100"
                    >
                      <Download className="w-3 h-3" /> Download
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={!file || !entityId || uploadMutation.isPending}
              onClick={() => uploadMutation.mutate()}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {uploadMutation.isPending ? 'Parsing…' : 'Parse & Preview'}
            </button>
          </div>
        </div>
      ) : (
        /* ----------------------------------------------------------------- */
        /* Preview step                                                        */
        /* ----------------------------------------------------------------- */
        <div className="space-y-4">
          {/* Summary card */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Step 2 — Review auto-classification</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {preview.row_count} accounts detected · Source:{' '}
                  <span className="font-medium capitalize">{preview.source_system.replace(/_/g, ' ')}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setPreview(null); setFile(null) }}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Upload different file
              </button>
            </div>

            {/* Clickable type filter chips + unassigned chip */}
            <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Filter by account type">
              <button
                type="button"
                onClick={() => { setTypeFilter(null); setUnassignedOnly(false) }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  typeFilter === null && !unassignedOnly
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                All · {preview.row_count}
              </button>
              {Object.entries(typeCounts).map(([type, count]) => (
                <button
                  key={type}
                  type="button"
                  data-type={type}
                  onClick={() => { setUnassignedOnly(false); setTypeFilter(typeFilter === type ? null : type) }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border capitalize transition-colors ${
                    typeFilter === type
                      ? (ACCOUNT_TYPE_COLORS[type] ?? 'bg-gray-200 text-gray-700 border-gray-300')
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {type} · {count}
                </button>
              ))}
              {unassignedCount > 0 && (
                <button
                  type="button"
                  data-type="unassigned"
                  onClick={() => { setTypeFilter(null); setUnassignedOnly((v) => !v) }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    unassignedOnly
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : 'bg-white text-amber-600 border-amber-300 hover:bg-amber-50'
                  }`}
                >
                  Unassigned · {unassignedCount}
                </button>
              )}
            </div>

            {/* Search and reporting-line filter row */}
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by name, number, detail type, or tax line…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
              <select
                value={reportingLineFilter}
                onChange={(e) => setReportingLineFilter(e.target.value ? Number(e.target.value) : '')}
                className="border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 min-w-[180px]"
                aria-label="Filter by reporting line"
              >
                <option value="">All reporting lines</option>
                {taxonomyLines.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Detected columns */}
            <div className="text-xs text-gray-500 mb-4">
              <span className="font-medium">Detected columns:</span>{' '}
              {Object.entries(preview.detected_columns)
                .filter(([, v]) => v !== null)
                .map(([field, col]) => `${field} → "${col}"`)
                .join(' · ')}
            </div>

            {/* Warnings */}
            {preview.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-4">
                {preview.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {w}
                  </p>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Accounts will be created or updated. QB Tax Line drives Reporting / FSLI assignment.
                Use the Reporting Line column below to override before importing.
              </p>
              <button
                type="button"
                disabled={applyMutation.isPending}
                onClick={() => applyMutation.mutate()}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                {applyMutation.isPending
                  ? 'Importing…'
                  : `Import ${typeFilter ? `${visibleRows.length} filtered` : preview.row_count} Accounts`}
              </button>
            </div>
          </div>

          {/* Preview table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left w-8">#</th>
                  <th className="px-3 py-2 text-left w-20">Acct #</th>
                  <th className="px-3 py-2 text-left">Account Name</th>
                  <th className="px-3 py-2 text-left w-20">Type</th>
                  <th className="px-3 py-2 text-left w-28">Detail Type</th>
                  <th className="px-3 py-2 text-left w-32">Parent Account</th>
                  <th className="px-3 py-2 text-left w-36">QB Tax Line</th>
                  <th className="px-3 py-2 text-left w-44">
                    <span className="flex items-center gap-1">
                      Reporting Line
                      <span title="Assigned using QB Tax Line (primary), then Detail Type, then Account Name keywords. Authoritative QB types (Fixed Asset, AR, AP, COGS, Credit Card) always override. Override manually using the dropdown.">
                        <HelpCircle className="w-3 h-3 text-gray-400 cursor-help" />
                      </span>
                    </span>
                  </th>
                  <th className="px-3 py-2 text-left w-28">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">
                      No accounts match the current filters
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row) => {
                    const overrideId = overrides[row.row_index]
                    const overrideName = overrideId
                      ? taxonomyLines.find((t) => t.id === overrideId)?.name
                      : null
                    const displayLine = overrideName ?? row.suggested_reporting_line

                    return (
                      <tr key={row.row_index} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400 text-xs">{row.row_index + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-700">{row.account_number || '—'}</td>
                        <td
                          className="px-3 py-2 text-gray-800 text-sm"
                          style={{ paddingLeft: `${12 + (row.hierarchy_depth ?? row.indent) * 12}px` }}
                        >
                          {row.account_name}
                        </td>
                        <td className="px-3 py-2">
                          {row.account_type && (
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium capitalize border ${ACCOUNT_TYPE_COLORS[row.account_type] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                              {row.account_type}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">{row.detail_type || '—'}</td>
                        <td className="px-3 py-2 text-xs text-gray-400" title={row.parent_account_name ?? ''}>
                          {row.parent_account_number
                            ? <span className="font-mono">{row.parent_account_number}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-400 truncate max-w-[128px]" title={row.tax_line ?? ''}>
                          {row.tax_line || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={overrideId ?? ''}
                            onChange={(e) => {
                              const val = e.target.value ? Number(e.target.value) : undefined
                              setOverrides((prev) => {
                                const next = { ...prev }
                                if (val) next[row.row_index] = val
                                else delete next[row.row_index]
                                return next
                              })
                            }}
                            className={`w-full border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 ${
                              overrideId ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200'
                            }`}
                            title={displayLine ?? 'No suggestion — select a reporting line'}
                          >
                            <option value="">
                              {displayLine ? `✓ ${displayLine}` : '— no suggestion —'}
                            </option>
                            {taxonomyLines.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-400 truncate max-w-[112px]" title={row.source_evidence ?? ''}>
                          {row.source_evidence
                            ? <span className="text-indigo-500">{row.source_evidence}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageLayout>
  )
}
