import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query'
import { BookOpen, Library, Sparkles, X, Check, ChevronDown } from 'lucide-react'
import { taxonomyLibraryApi } from '@/api/taxonomyLibrary'
import type { TaxonomyNode } from '@/api/taxonomyLibrary'

interface Props {
  accountId: number
}

const SOURCE_BADGES: Record<string, { label: string; className: string }> = {
  system_default: { label: 'System Default', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  ai_suggested: { label: 'AI Suggested', className: 'bg-purple-100 text-purple-700 border-purple-200' },
  user_selected: { label: 'User Selected', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  imported_template: { label: 'Imported Template', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  cloned_taxonomy: { label: 'Cloned Taxonomy', className: 'bg-slate-100 text-slate-700 border-slate-200' },
}

function confidenceClass(score: number): string {
  if (score >= 0.8) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (score >= 0.5) return 'bg-yellow-50 text-yellow-700 border-yellow-200'
  return 'bg-rose-50 text-rose-700 border-rose-200'
}

export function AccountTaxonomyMappingsPanel({ accountId }: Props) {
  const qc = useQueryClient()
  const [openPickers, setOpenPickers] = useState<Record<number, boolean>>({})
  const [selectedNode, setSelectedNode] = useState<Record<number, number | ''>>({})

  const taxonomiesQuery = useQuery({
    queryKey: ['taxonomies', 'all'],
    queryFn: () => taxonomyLibraryApi.list(),
  })

  const mappingsQuery = useQuery({
    queryKey: ['taxonomy-account-mappings', accountId],
    queryFn: () => taxonomyLibraryApi.getAccountMappings(accountId),
  })

  const taxonomies = taxonomiesQuery.data ?? []
  const mappings = mappingsQuery.data ?? []

  const openTaxonomyIds = taxonomies.filter((t) => openPickers[t.id]).map((t) => t.id)
  const nodesQueries = useQueries({
    queries: openTaxonomyIds.map((tid) => ({
      queryKey: ['taxonomy-nodes', tid],
      queryFn: () => taxonomyLibraryApi.nodes(tid),
    })),
  })
  const nodesByTaxonomy: Record<number, TaxonomyNode[]> = {}
  openTaxonomyIds.forEach((tid, i) => {
    nodesByTaxonomy[tid] = nodesQueries[i]?.data ?? []
  })

  const saveMutation = useMutation({
    mutationFn: (body: { account_id: number; taxonomy_id: number; taxonomy_node_id: number }) =>
      taxonomyLibraryApi.mapAccount({ ...body, mapping_source: 'user_selected' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['taxonomy-account-mappings', accountId] })
    },
  })

  const clearMutation = useMutation({
    mutationFn: (mappingId: number) => taxonomyLibraryApi.deleteMapping(mappingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['taxonomy-account-mappings', accountId] })
    },
  })

  if (taxonomiesQuery.isLoading || mappingsQuery.isLoading) {
    return (
      <div className="space-y-2" data-testid="taxonomy-mappings-loading">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-lg" />
        ))}
      </div>
    )
  }

  if (taxonomies.length === 0) {
    return (
      <div className="p-3 border border-gray-200 bg-gray-50 rounded-lg">
        <p className="text-xs text-gray-500 italic">No taxonomies available. Seed system taxonomies first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="taxonomy-mappings-panel">
      {taxonomies.map((tx) => {
        const mapping = mappings.find((m) => m.taxonomy_id === tx.id) ?? null
        const nodes = nodesByTaxonomy[tx.id] ?? []
        const currentNode = mapping ? nodes.find((n) => n.id === mapping.taxonomy_node_id) : undefined
        const pickerOpen = !!openPickers[tx.id]
        const sourceBadge = mapping ? SOURCE_BADGES[mapping.mapping_source] : null
        const selVal = selectedNode[tx.id] ?? ''

        return (
          <div
            key={tx.id}
            className="border border-gray-200 rounded-lg p-3 bg-white"
            data-testid={`taxonomy-card-${tx.id}`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Library className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="text-xs font-bold text-gray-800 truncate">{tx.name}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide ${
                  tx.is_system
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}>
                  {tx.is_system ? 'System' : 'Custom'}
                </span>
              </div>
              {sourceBadge && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap ${sourceBadge.className}`} data-testid={`mapping-source-${tx.id}`}>
                  {sourceBadge.label}
                </span>
              )}
            </div>

            {mapping ? (
              <div className="flex items-start gap-2 mb-2 p-2 bg-indigo-50/30 border border-indigo-100 rounded">
                <BookOpen className="w-3.5 h-3.5 text-indigo-500 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-[10px] text-gray-500">
                      {currentNode?.code ?? `Node #${mapping.taxonomy_node_id}`}
                    </span>
                    <span className="text-xs font-semibold text-gray-800 truncate">
                      {currentNode?.name ?? ''}
                    </span>
                    {mapping.confidence_score != null && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${confidenceClass(mapping.confidence_score)}`}
                        data-testid={`confidence-chip-${tx.id}`}
                      >
                        {Math.round(mapping.confidence_score * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-gray-400 italic mb-2 pl-1">No mapping yet</p>
            )}

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <button
                  type="button"
                  onClick={() => setOpenPickers((p) => ({ ...p, [tx.id]: !pickerOpen }))}
                  className="w-full flex items-center justify-between gap-1 px-2 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
                  data-testid={`picker-toggle-${tx.id}`}
                >
                  <span className="truncate">
                    {selVal
                      ? nodes.find((n) => n.id === selVal)?.name ?? 'Select node…'
                      : 'Select node…'}
                  </span>
                  <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
                </button>
                {pickerOpen && (
                  <select
                    value={selVal}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : Number(e.target.value)
                      setSelectedNode((s) => ({ ...s, [tx.id]: val }))
                    }}
                    size={Math.min(8, Math.max(3, nodes.length + 1))}
                    className="absolute left-0 right-0 top-full mt-1 z-20 w-full border border-gray-300 rounded bg-white shadow-lg text-xs"
                    data-testid={`node-select-${tx.id}`}
                  >
                    <option value="">— Select —</option>
                    {nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.code} {n.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <button
                type="button"
                disabled={!selVal || saveMutation.isPending}
                onClick={() => {
                  if (!selVal) return
                  saveMutation.mutate({
                    account_id: accountId,
                    taxonomy_id: tx.id,
                    taxonomy_node_id: Number(selVal),
                  })
                  setOpenPickers((p) => ({ ...p, [tx.id]: false }))
                }}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                data-testid={`save-mapping-${tx.id}`}
              >
                <Check className="w-3 h-3" /> Save
              </button>

              {mapping && (
                <button
                  type="button"
                  disabled={clearMutation.isPending}
                  onClick={() => clearMutation.mutate(mapping.id)}
                  className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-semibold border border-gray-300 text-gray-700 rounded hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
                  data-testid={`clear-mapping-${tx.id}`}
                >
                  <X className="w-3 h-3" /> Clear
                </button>
              )}
            </div>

            {mapping?.mapping_source === 'ai_suggested' && (
              <p className="mt-1.5 text-[10px] text-purple-600 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> AI suggestion — review before relying on it.
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
