import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Info } from 'lucide-react'
import { cn } from '@/utils/cn'
import { overlayApi } from '@/api/overlay'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { ScenarioSelect } from '@/components/ui/ScenarioSelect'
import { OVERLAY_GROUPS } from '@/types'
import type { OverlayCalculateRequest } from '@/types'

interface DraftOverlayModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: number
  defaultEntityId?: number
  defaultScenarioId?: number
  onCalculate: (req: OverlayCalculateRequest) => void
  isCalculating?: boolean
}

const PREVIEW_TYPES = [
  { value: 'trial_balance', label: 'Trial Balance' },
  { value: 'balance_sheet', label: 'Balance Sheet' },
  { value: 'income_statement', label: 'Income Statement' },
  { value: 'consolidated_tb', label: 'Consolidated TB' },
  { value: 'consolidated_bs', label: 'Consolidated BS' },
  { value: 'consolidated_is', label: 'Consolidated IS' },
  { value: 'working_capital', label: 'Working Capital' },
  { value: 'ebitda_bridge', label: 'EBITDA Bridge' },
  { value: 'pro_forma', label: 'Pro Forma' },
]

export function DraftOverlayModal({
  open,
  onOpenChange,
  organizationId,
  defaultEntityId,
  defaultScenarioId,
  onCalculate,
  isCalculating,
}: DraftOverlayModalProps) {
  const [entityId, setEntityId] = useState<number | ''>(defaultEntityId ?? '')
  const [scenarioId, setScenarioId] = useState<number | ''>(defaultScenarioId ?? '')
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10))
  const [previewType, setPreviewType] = useState('trial_balance')
  const [selectedJeIds, setSelectedJeIds] = useState<Set<number>>(new Set())
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())
  const [selectAllGroups, setSelectAllGroups] = useState(true)
  const [includeRe, setIncludeRe] = useState(true)
  const [createAudit, setCreateAudit] = useState(true)

  const canFetchDrafts = entityId !== '' && scenarioId !== '' && !!asOfDate

  const { data: drafts } = useQuery({
    queryKey: ['draft-entries', entityId, scenarioId, asOfDate, organizationId],
    queryFn: () =>
      overlayApi.listDraftEntries({
        entity_id: entityId as number,
        scenario_id: scenarioId as number,
        as_of_date: asOfDate,
        organization_id: organizationId,
      }),
    enabled: canFetchDrafts,
  })

  // Read excludedMap from localStorage to default included/excluded drafts
  useEffect(() => {
    if (drafts) {
      let excluded: Record<number, boolean> = {}
      try {
        excluded = JSON.parse(localStorage.getItem('je_excluded_map') || '{}')
      } catch {
        excluded = {}
      }
      const initialSelected = new Set<number>()
      drafts.forEach((d) => {
        if (!excluded[d.je_id]) {
          initialSelected.add(d.je_id)
        }
      })
      setSelectedJeIds(initialSelected)
    }
  }, [drafts])

  function toggleJe(id: number) {
    setSelectedJeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGroup(g: string) {
    setSelectedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })
  }

  function handleCalculate() {
    const req: OverlayCalculateRequest = {
      organization_id: organizationId,
      entity_id: entityId as number,
      as_of_date: asOfDate,
      scenario_id: scenarioId as number,
      preview_type: previewType,
      included_je_ids: drafts && drafts.length > 0 ? Array.from(selectedJeIds) : null,
      overlay_groups: selectAllGroups ? null : selectedGroups.size > 0 ? Array.from(selectedGroups) : null,
      include_re_rollforward: includeRe,
      is_consolidated: false,
      create_audit_record: createAudit,
    }
    onCalculate(req)
  }

  const canCalculate = entityId !== '' && scenarioId !== '' && !!asOfDate

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl max-h-[85vh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white shadow-xl"
          data-testid="overlay-modal"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
            <div>
              <Dialog.Title className="text-base font-semibold text-gray-900">
                Draft Overlay Preview
              </Dialog.Title>
              <Dialog.Description className="text-xs text-amber-600 mt-0.5">
                Preview only — not official financial data
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="rounded p-1 hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-5 py-4 space-y-5">
            {/* What is Draft Overlay explanation */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              <div className="flex items-start gap-2">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold mb-1">What is a Draft Overlay?</p>
                  <p className="text-amber-700">
                    Draft overlays let you preview financial statements with draft adjustments <strong>without modifying official balances</strong>.
                    Use them for pro forma analysis, QoE adjustments, lender scenarios, and management reclasses.
                  </p>
                  <div className="mt-2 flex items-center gap-1 text-amber-600">
                    <span className="border border-amber-300 rounded px-1.5 py-0.5">Official</span>
                    <span>+</span>
                    <span className="border border-amber-300 rounded px-1.5 py-0.5">Draft Entries</span>
                    <span>=</span>
                    <span className="border border-amber-500 rounded px-1.5 py-0.5 font-medium">Preview Statement</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Parameters */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                Step 1 — Select Entity &amp; Base Scenario
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <EntitySelect value={entityId} onChange={setEntityId} label="Entity" required />
                <ScenarioSelect value={scenarioId} onChange={setScenarioId} label="Base Scenario" required />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">As of Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={asOfDate}
                    onChange={(e) => setAsOfDate(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">Preview Type</label>
                  <select
                    value={previewType}
                    onChange={(e) => setPreviewType(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    {PREVIEW_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={includeRe} onChange={(e) => setIncludeRe(e.target.checked)} className="h-3.5 w-3.5" />
                  RE rollforward
                </label>
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={createAudit} onChange={(e) => setCreateAudit(e.target.checked)} className="h-3.5 w-3.5" />
                  Create audit record
                </label>
              </div>
            </section>

            {/* Overlay groups */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Step 2 — Draft Entry Sets (Overlay Groups)</h3>
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectAllGroups}
                    onChange={(e) => setSelectAllGroups(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  All groups
                </label>
              </div>
              {!selectAllGroups && (
                <div className="flex flex-wrap gap-1.5" data-testid="overlay-group-selector">
                  {OVERLAY_GROUPS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => toggleGroup(g)}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-xs font-medium border transition-colors',
                        selectedGroups.has(g)
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      )}
                    >
                      {g.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Draft JE selector */}
            {canFetchDrafts && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Step 3 — Select Draft Entries
                    {drafts && <span className="ml-1 text-gray-400 normal-case font-normal">({drafts.length} available)</span>}
                  </h3>
                  {drafts && drafts.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() => {
                        if (selectedJeIds.size === drafts.length) setSelectedJeIds(new Set())
                        else setSelectedJeIds(new Set(drafts.map((d) => d.je_id)))
                      }}
                    >
                      {selectedJeIds.size === drafts?.length ? 'Deselect all' : 'Select all'}
                    </button>
                  )}
                </div>
                {!drafts || drafts.length === 0 ? (
                  <p className="text-xs text-gray-400">No draft entries found for this entity/scenario/date.</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto border rounded-md p-2" data-testid="draft-je-list">
                    {drafts.map((d) => (
                      <label key={d.je_id} className="flex items-start gap-2 cursor-pointer rounded px-2 py-1 hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={selectedJeIds.has(d.je_id)}
                          onChange={() => toggleJe(d.je_id)}
                          className="mt-0.5 h-3.5 w-3.5"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-mono font-medium text-gray-800">{d.je_number}</span>
                          <span className="text-xs text-gray-500 ml-2">{d.entry_date}</span>
                          <p className="text-xs text-gray-500 truncate">{d.description}</p>
                        </div>
                        <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-xs text-amber-700">
                          {d.overlay_group.replace(/_/g, ' ')}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-5 py-4 border-t sticky bottom-0 bg-white">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleCalculate}
              disabled={!canCalculate || isCalculating}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {isCalculating ? 'Calculating…' : 'Calculate Preview'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
