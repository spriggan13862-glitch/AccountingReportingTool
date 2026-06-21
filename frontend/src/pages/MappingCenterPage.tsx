import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Save, Search, CheckCircle, AlertCircle } from 'lucide-react'
import { accountsApi } from '@/api/accounts'
import { commonReportingLinesApi } from '@/api/commonReportingLines'
import type { CommonReportingLine } from '@/api/commonReportingLines'
import type { Account } from '@/types'
import { PageLayout } from '@/components/ui/PageLayout'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { useOrg } from '@/providers/OrgProvider'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { useToast } from '@/providers/ToastProvider'

/**
 * Correction 3 — Mapping Center.
 *
 * Reads and writes the canonical Account → FSLI mapping
 * (accounts.common_reporting_line_id). Every other screen — wizard,
 * Review Exceptions, By FSLI statements — reads the same field.
 */
export function MappingCenterPage() {
  const { org } = useOrg()
  const workspace = useWorkspace()
  const orgId = org?.id ?? null
  const toast = useToast()
  const queryClient = useQueryClient()

  const [entityId, setEntityId] = useState<number | ''>(workspace?.activeEntity?.id ?? '')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'mapped' | 'unmapped'>('all')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [bulkCrlId, setBulkCrlId] = useState<number | ''>('')

  const { data: accounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ['mapping-center-accounts', entityId],
    queryFn: () => accountsApi.list(entityId as number),
    enabled: entityId !== '',
  })

  const { data: crls = [] } = useQuery<CommonReportingLine[]>({
    queryKey: ['mapping-center-crls', orgId],
    queryFn: () => commonReportingLinesApi.list({
      organization_id: orgId ?? undefined,
    }),
  })

  const crlById = useMemo(() => {
    const m = new Map<number, CommonReportingLine>()
    for (const c of crls) m.set(c.id, c)
    return m
  }, [crls])

  const crlOptionsBySection = useMemo(() => {
    const grouped: Record<string, CommonReportingLine[]> = {}
    for (const c of crls) {
      const key = c.section || '—'
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(c)
    }
    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    }
    return grouped
  }, [crls])

  const updateOne = useMutation({
    mutationFn: (vars: { id: number; crlId: number | null }) =>
      accountsApi.update(vars.id, { common_reporting_line_id: vars.crlId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mapping-center-accounts'] })
    },
    onError: (e: Error) => toast(`Save failed: ${e.message}`, 'error'),
  })

  const bulkAssign = useMutation({
    mutationFn: (vars: { ids: number[]; crlId: number | null }) =>
      accountsApi.bulkAssignFsli(vars.ids, vars.crlId),
    onSuccess: (rows, vars) => {
      toast(
        vars.crlId === null
          ? `Cleared FSLI on ${rows.length} account${rows.length === 1 ? '' : 's'}`
          : `Assigned FSLI to ${rows.length} account${rows.length === 1 ? '' : 's'}`,
        'success',
      )
      setChecked(new Set())
      queryClient.invalidateQueries({ queryKey: ['mapping-center-accounts'] })
    },
    onError: (e: Error) => toast(`Bulk save failed: ${e.message}`, 'error'),
  })

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return accounts.filter((a) => {
      const mapped = a.common_reporting_line_id != null
      if (filter === 'mapped' && !mapped) return false
      if (filter === 'unmapped' && mapped) return false
      if (term) {
        const hay = `${a.account_number} ${a.account_name}`.toLowerCase()
        if (!hay.includes(term)) return false
      }
      return true
    })
  }, [accounts, search, filter])

  const mappedCount = accounts.filter((a) => a.common_reporting_line_id != null).length
  const unmappedCount = accounts.length - mappedCount

  function toggle(id: number) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllVisible(on: boolean) {
    if (on) setChecked(new Set(filtered.map((a) => a.id)))
    else setChecked(new Set())
  }

  return (
    <PageLayout
      title="Mapping Center"
      subtitle="Account → Financial Statement Line Item (FSLI) — the canonical mapping every screen reads"
    >
      <div className="space-y-4" data-testid="mapping-center">
        <div className="bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <EntitySelect value={entityId} onChange={setEntityId} label="Entity" required />
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Filter</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'all' | 'mapped' | 'unmapped')}
              className="w-full h-9 px-2 border border-gray-300 rounded text-sm"
              data-testid="mapping-center-filter"
            >
              <option value="all">All accounts</option>
              <option value="mapped">Only mapped</option>
              <option value="unmapped">Only unmapped</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Account # or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-7 pr-2 h-9 border border-gray-300 rounded text-sm"
                data-testid="mapping-center-search"
              />
            </div>
          </div>
        </div>

        {/* Status banner */}
        <div
          className={`rounded-lg border px-4 py-2.5 text-xs flex items-center gap-4 flex-wrap ${
            unmappedCount > 0
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
          data-testid="mapping-center-status"
        >
          <span className="font-semibold flex items-center gap-1.5">
            {unmappedCount > 0 ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
            {mappedCount} of {accounts.length} accounts mapped to an FSLI
          </span>
          {unmappedCount > 0 && <span>· {unmappedCount} still unmapped</span>}
        </div>

        {/* Bulk-assign bar */}
        <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-600 font-semibold">
            Bulk assign FSLI to {checked.size} selected
          </span>
          <select
            value={bulkCrlId}
            onChange={(e) => setBulkCrlId(e.target.value ? Number(e.target.value) : '')}
            className="text-xs border border-gray-300 rounded h-7 px-2 min-w-[260px]"
            data-testid="mapping-center-bulk-fsli"
          >
            <option value="">— Pick an FSLI —</option>
            {Object.entries(crlOptionsBySection).map(([section, opts]) => (
              <optgroup key={section} label={section}>
                {opts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            disabled={checked.size === 0 || bulkCrlId === '' || bulkAssign.isPending}
            onClick={() => bulkAssign.mutate({
              ids: Array.from(checked),
              crlId: bulkCrlId as number,
            })}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded"
            data-testid="mapping-center-bulk-apply"
          >
            {bulkAssign.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Apply to selected
          </button>
          <button
            type="button"
            disabled={checked.size === 0 || bulkAssign.isPending}
            onClick={() => bulkAssign.mutate({ ids: Array.from(checked), crlId: null })}
            className="text-xs px-2 py-1 border border-rose-200 text-rose-700 hover:bg-rose-50 rounded"
            data-testid="mapping-center-bulk-clear"
          >
            Clear FSLI on selected
          </button>
        </div>

        {entityId === '' ? (
          <div className="text-xs text-gray-500 p-4 border border-dashed border-gray-300 rounded">
            Pick an entity to manage account mappings.
          </div>
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-xs text-gray-500 p-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((a) => checked.has(a.id))}
                      onChange={(e) => toggleAllVisible(e.target.checked)}
                      data-testid="mapping-center-select-all"
                    />
                  </th>
                  <th className="px-3 py-2 font-semibold w-28">Account #</th>
                  <th className="px-3 py-2 font-semibold">Account Name</th>
                  <th className="px-3 py-2 font-semibold w-20">Type</th>
                  <th className="px-3 py-2 font-semibold w-80">FSLI</th>
                  <th className="px-3 py-2 font-semibold w-24">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center px-3 py-6 text-gray-400">
                    {accounts.length === 0
                      ? 'No accounts for this entity.'
                      : 'No accounts match the current filter.'}
                  </td></tr>
                ) : filtered.map((a) => {
                  const crl = a.common_reporting_line_id != null
                    ? crlById.get(a.common_reporting_line_id)
                    : null
                  return (
                    <tr key={a.id} className="border-t border-gray-100" data-testid={`mc-row-${a.account_number}`}>
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={checked.has(a.id)}
                          onChange={() => toggle(a.id)}
                          data-testid={`mc-check-${a.account_number}`}
                        />
                      </td>
                      <td className="px-3 py-1.5 font-mono text-gray-700">{a.account_number}</td>
                      <td className="px-3 py-1.5 text-gray-800">{a.account_name}</td>
                      <td className="px-3 py-1.5 text-gray-500 capitalize">{a.account_type}</td>
                      <td className="px-3 py-1.5">
                        <select
                          value={a.common_reporting_line_id ?? ''}
                          onChange={(e) => updateOne.mutate({
                            id: a.id,
                            crlId: e.target.value ? Number(e.target.value) : null,
                          })}
                          className="w-full text-xs border border-gray-300 rounded h-7 px-1.5"
                          data-testid={`mc-fsli-${a.account_number}`}
                        >
                          <option value="">— None —</option>
                          {Object.entries(crlOptionsBySection).map(([section, opts]) => (
                            <optgroup key={section} label={section}>
                              {opts.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        {crl ? (
                          <span className="text-emerald-700 text-[10px] font-semibold">Mapped</span>
                        ) : (
                          <span className="text-amber-700 text-[10px] font-semibold">Unmapped</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageLayout>
  )
}
