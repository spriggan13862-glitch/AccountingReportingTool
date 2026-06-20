import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Library, Download, Copy, Edit, Trash2, Search, ChevronRight, ChevronDown,
  FileCode, FileSpreadsheet, FileJson, Plus, X,
} from 'lucide-react'
import { PageLayout } from '@/components/ui/PageLayout'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { useToast } from '@/providers/ToastProvider'
import { taxonomyLibraryApi } from '@/api/taxonomyLibrary'
import type { Taxonomy, TaxonomyNodeTree } from '@/api/taxonomyLibrary'

type ExportFormat = 'csv' | 'excel' | 'json'

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.URL.revokeObjectURL(url)
}

function filterTree(nodes: TaxonomyNodeTree[], search: string): TaxonomyNodeTree[] {
  if (!search.trim()) return nodes
  const needle = search.trim().toLowerCase()
  const matches = (n: TaxonomyNodeTree): TaxonomyNodeTree | null => {
    const filteredChildren = (n.children ?? [])
      .map(matches)
      .filter((c): c is TaxonomyNodeTree => c !== null)
    const self = n.name.toLowerCase().includes(needle) || n.code.toLowerCase().includes(needle)
    if (self || filteredChildren.length > 0) {
      return { ...n, children: filteredChildren }
    }
    return null
  }
  return nodes.map(matches).filter((n): n is TaxonomyNodeTree => n !== null)
}

export function TaxonomyLibraryPage() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [listFilter, setListFilter] = useState('')
  const [treeSearch, setTreeSearch] = useState('')
  const [cloneOpen, setCloneOpen] = useState(false)
  const [cloneName, setCloneName] = useState('')
  const [cloneCode, setCloneCode] = useState('')
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false)

  const listQuery = useQuery({
    queryKey: ['taxonomy-library', 'list'],
    queryFn: () => taxonomyLibraryApi.list(),
  })

  const detailQuery = useQuery({
    queryKey: ['taxonomy-library', 'detail', selectedId],
    queryFn: () => taxonomyLibraryApi.get(selectedId as number),
    enabled: selectedId !== null,
  })

  const treeQuery = useQuery({
    queryKey: ['taxonomy-library', 'tree', selectedId],
    queryFn: () => taxonomyLibraryApi.tree(selectedId as number),
    enabled: selectedId !== null,
  })

  const cloneMutation = useMutation({
    mutationFn: (body: { name: string; code?: string }) =>
      taxonomyLibraryApi.clone(selectedId as number, body),
    onSuccess: (newTax) => {
      toast(`Cloned to "${newTax.name}"`, 'success')
      setCloneOpen(false)
      setCloneName('')
      setCloneCode('')
      queryClient.invalidateQueries({ queryKey: ['taxonomy-library', 'list'] })
      setSelectedId(newTax.id)
    },
    onError: (e: Error) => toast(e.message || 'Clone failed', 'error'),
  })

  const exportMutation = useMutation({
    mutationFn: async ({ id, format }: { id: number; format: ExportFormat }) => {
      const apiFn =
        format === 'csv' ? taxonomyLibraryApi.exportCsv
          : format === 'excel' ? taxonomyLibraryApi.exportExcel
            : taxonomyLibraryApi.exportJson
      const ext = format === 'excel' ? 'xlsx' : format
      const blob = await apiFn(id)
      return { blob, ext }
    },
    onSuccess: ({ blob, ext }, vars) => {
      const code = detailQuery.data?.code ?? `taxonomy-${vars.id}`
      downloadBlob(blob, `${code}.${ext}`)
      toast(`Downloaded ${ext.toUpperCase()}`, 'success')
      setDownloadMenuOpen(false)
    },
    onError: (e: Error) => toast(e.message || 'Export failed', 'error'),
  })

  const filteredList = useMemo(() => {
    const all = listQuery.data ?? []
    if (!listFilter.trim()) return all
    const needle = listFilter.trim().toLowerCase()
    return all.filter((t) => t.name.toLowerCase().includes(needle))
  }, [listQuery.data, listFilter])

  const systemTaxonomies = useMemo(() => filteredList.filter((t) => t.is_system), [filteredList])
  const customTaxonomies = useMemo(() => filteredList.filter((t) => !t.is_system), [filteredList])

  const filteredTree = useMemo(() => filterTree(treeQuery.data ?? [], treeSearch), [treeQuery.data, treeSearch])

  const selected = useMemo(
    () => (listQuery.data ?? []).find((t) => t.id === selectedId) ?? null,
    [listQuery.data, selectedId],
  )

  const isSystem = selected?.is_system ?? false

  function openClone() {
    if (!selected) return
    setCloneName(`${selected.name} - Custom`)
    setCloneCode('')
    setCloneOpen(true)
  }

  return (
    <PageLayout
      title="Taxonomy Library"
      subtitle="System and custom chart-of-accounts taxonomies"
    >
      {listQuery.isError && (
        <ErrorBanner message={(listQuery.error as Error)?.message || 'Failed to load taxonomies'} />
      )}
      <div className="grid grid-cols-12 gap-4" data-testid="taxonomy-library-page">
        {/* Left panel: list */}
        <aside className="col-span-4 xl:col-span-3 flex flex-col border border-gray-200 rounded-lg bg-white">
          <div className="p-3 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={listFilter}
                onChange={(e) => setListFilter(e.target.value)}
                placeholder="Filter taxonomies…"
                className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                data-testid="taxonomy-list-filter"
              />
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {listQuery.isLoading ? (
              <LoadingState />
            ) : filteredList.length === 0 ? (
              <div className="p-6 text-sm text-gray-500" data-testid="taxonomy-empty-state">
                No taxonomies yet. Run the database seed to load system taxonomies.
              </div>
            ) : (
              <>
                <TaxonomyListSection
                  title="System Taxonomies"
                  testId="system-taxonomies-section"
                  taxonomies={systemTaxonomies}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
                <TaxonomyListSection
                  title="Custom Taxonomies"
                  testId="custom-taxonomies-section"
                  taxonomies={customTaxonomies}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </>
            )}
          </div>
        </aside>

        {/* Right panel: detail */}
        <section className="col-span-8 xl:col-span-9 border border-gray-200 rounded-lg bg-white">
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center h-96 text-gray-400">
              <Library className="w-10 h-10 mb-2" />
              <p className="text-sm">Select a taxonomy to view its structure</p>
            </div>
          ) : (
            <div className="flex flex-col h-full" data-testid="taxonomy-detail-panel">
              <header className="p-4 border-b border-gray-200">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-gray-900" data-testid="taxonomy-detail-name">
                        {selected?.name ?? 'Loading…'}
                      </h2>
                      {selected && (
                        <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border ${
                          isSystem ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-purple-50 text-purple-700 border-purple-200'
                        }`}>
                          {isSystem ? 'System' : 'Custom'}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                      {selected?.code && <span className="font-mono">{selected.code}</span>}
                      {selected?.version && <span>v{selected.version}</span>}
                      {selected?.industry && (
                        <span className="px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50">{selected.industry}</span>
                      )}
                      {detailQuery.data && <span>{detailQuery.data.node_count} nodes</span>}
                    </div>
                    {selected?.description && (
                      <p className="mt-2 text-sm text-gray-600">{selected.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setDownloadMenuOpen((v) => !v)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
                        data-testid="download-button"
                      >
                        <Download className="w-4 h-4" /> Download
                      </button>
                      {downloadMenuOpen && (
                        <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded shadow-lg z-10" data-testid="download-menu">
                          <ExportMenuItem
                            label="CSV"
                            icon={<FileCode className="w-4 h-4" />}
                            onClick={() => exportMutation.mutate({ id: selectedId, format: 'csv' })}
                            testId="download-csv"
                          />
                          <ExportMenuItem
                            label="Excel"
                            icon={<FileSpreadsheet className="w-4 h-4" />}
                            onClick={() => exportMutation.mutate({ id: selectedId, format: 'excel' })}
                            testId="download-excel"
                          />
                          <ExportMenuItem
                            label="JSON"
                            icon={<FileJson className="w-4 h-4" />}
                            onClick={() => exportMutation.mutate({ id: selectedId, format: 'json' })}
                            testId="download-json"
                          />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={openClone}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
                      data-testid="clone-button"
                    >
                      <Copy className="w-4 h-4" /> Clone
                    </button>
                  </div>
                </div>
                <div className="mt-3 relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={treeSearch}
                    onChange={(e) => setTreeSearch(e.target.value)}
                    placeholder="Search nodes by name or code…"
                    className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    data-testid="tree-search"
                  />
                </div>
              </header>

              <div className="flex-1 overflow-auto p-3" data-testid="taxonomy-tree">
                {treeQuery.isLoading ? (
                  <LoadingState />
                ) : treeQuery.isError ? (
                  <ErrorBanner message={(treeQuery.error as Error)?.message || 'Failed to load tree'} />
                ) : filteredTree.length === 0 ? (
                  <p className="text-sm text-gray-500 px-3 py-6">No nodes match your search.</p>
                ) : (
                  <ul className="space-y-0.5">
                    {filteredTree.map((node) => (
                      <TreeNodeRow
                        key={node.id}
                        node={node}
                        depth={0}
                        editable={!isSystem}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {cloneOpen && selected && (
        <CloneModal
          sourceName={selected.name}
          name={cloneName}
          code={cloneCode}
          onNameChange={setCloneName}
          onCodeChange={setCloneCode}
          onClose={() => setCloneOpen(false)}
          onSubmit={() => cloneMutation.mutate({ name: cloneName, code: cloneCode || undefined })}
          submitting={cloneMutation.isPending}
        />
      )}
    </PageLayout>
  )
}

// ---------------------------------------------------------------------------

function TaxonomyListSection({
  title, testId, taxonomies, selectedId, onSelect,
}: {
  title: string
  testId: string
  taxonomies: Taxonomy[]
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  return (
    <div className="border-b border-gray-100 last:border-b-0" data-testid={testId}>
      <div className="px-3 pt-3 pb-1 text-[10px] uppercase font-semibold tracking-wide text-gray-500">
        {title}
      </div>
      {taxonomies.length === 0 ? (
        <p className="px-3 py-2 text-xs text-gray-400 italic">None</p>
      ) : (
        <ul>
          {taxonomies.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${
                  selectedId === t.id ? 'bg-blue-50 border-l-2 border-blue-600' : 'border-l-2 border-transparent'
                }`}
                data-testid={`taxonomy-row-${t.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-gray-900 truncate">{t.name}</span>
                  <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border shrink-0 ${
                    t.is_system ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-purple-50 text-purple-700 border-purple-200'
                  }`}>
                    {t.is_system ? 'System' : 'Custom'}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-500">
                  {t.industry && (
                    <span className="px-1 py-0.5 rounded border border-gray-200 bg-gray-50">{t.industry}</span>
                  )}
                  <span className="font-mono">{t.code}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function TreeNodeRow({
  node, depth, editable,
}: {
  node: TaxonomyNodeTree
  depth: number
  editable: boolean
}) {
  const [expanded, setExpanded] = useState(depth < 1)
  const hasChildren = (node.children?.length ?? 0) > 0
  return (
    <li>
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50"
        style={{ paddingLeft: depth * 16 + 8 }}
        data-testid={`node-row-${node.id}`}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 ${
            hasChildren ? '' : 'invisible'
          }`}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <span className="font-mono text-xs text-gray-500 w-24 shrink-0 truncate">{node.code}</span>
        <span className="text-sm text-gray-900 flex-1 truncate">{node.name}</span>
        {node.financial_statement_section && (
          <span className="text-[10px] uppercase px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-600">
            {node.financial_statement_section}
          </span>
        )}
        {node.normal_balance && (
          <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${
            node.normal_balance === 'debit'
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : 'bg-orange-50 text-orange-700 border-orange-200'
          }`}>
            {node.normal_balance}
          </span>
        )}
        {editable && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              className="p-1 text-gray-400 hover:text-blue-600"
              aria-label="Edit node"
              data-testid={`node-edit-${node.id}`}
            >
              <Edit className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1 text-gray-400 hover:text-red-600"
              aria-label="Deactivate node"
              data-testid={`node-deactivate-${node.id}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1 text-gray-400 hover:text-green-600"
              aria-label="Add child node"
              data-testid={`node-add-child-${node.id}`}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      {expanded && hasChildren && (
        <ul>
          {node.children.map((c) => (
            <TreeNodeRow key={c.id} node={c} depth={depth + 1} editable={editable} />
          ))}
        </ul>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------

function ExportMenuItem({
  label, icon, onClick, testId,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  testId: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
      data-testid={testId}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------

function CloneModal({
  sourceName, name, code, onNameChange, onCodeChange, onClose, onSubmit, submitting,
}: {
  sourceName: string
  name: string
  code: string
  onNameChange: (v: string) => void
  onCodeChange: (v: string) => void
  onClose: () => void
  onSubmit: () => void
  submitting: boolean
}) {
  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      data-testid="clone-modal"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900">Clone Taxonomy</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">Source: {sourceName}</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">New name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="clone-name-input"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">New code (optional)</label>
            <input
              type="text"
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              data-testid="clone-code-input"
            />
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!name.trim() || submitting}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            data-testid="clone-submit"
          >
            {submitting ? 'Cloning…' : 'Clone'}
          </button>
        </div>
      </div>
    </div>
  )
}
