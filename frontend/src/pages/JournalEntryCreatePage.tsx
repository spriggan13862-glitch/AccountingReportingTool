import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useToast } from '@/providers/ToastProvider'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { journalEntriesApi } from '@/api/journalEntries'
import type { JECreate, JELineCreate, Account } from '@/types'
import { PageLayout } from '@/components/ui/PageLayout'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { ScenarioMultiSelect } from '@/components/ui/ScenarioMultiSelect'
import { AccountSearch } from '@/components/ui/AccountSearch'
import { useWorkspace } from '@/providers/WorkspaceProvider'

interface LineState extends JELineCreate {
  _selectedAccount: Account | null
}

const EMPTY_LINE = (): LineState => ({
  line_number: 0,
  account_id: 0,
  entity_id: 0,
  debit: '0',
  credit: '0',
  description: '',
  _selectedAccount: null,
})

function parseDecimal(val: string): number {
  const n = parseFloat(val)
  return isNaN(n) ? 0 : n
}

export function JournalEntryCreatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { activeEntity } = useWorkspace()

  const [entityId, setEntityId] = useState<number | ''>(activeEntity?.id ?? '')
  const [scenarioIds, setScenarioIds] = useState<number[]>([])
  const [form, setForm] = useState({
    je_number: '',
    entry_date: new Date().toISOString().slice(0, 10),
    description: '',
    source: 'manual',
    source_ref: '',
  })
  const [lines, setLines] = useState<LineState[]>([EMPTY_LINE(), EMPTY_LINE()])
  const [apiError, setApiError] = useState<string | null>(null)

  const totalDebit = lines.reduce((s, l) => s + parseDecimal(l.debit), 0)
  const totalCredit = lines.reduce((s, l) => s + parseDecimal(l.credit), 0)
  const difference = Math.abs(totalDebit - totalCredit)
  const isBalanced = difference < 0.001

  // Use first selected scenario (JE supports one scenario_id)
  const scenarioId = scenarioIds[0] ?? 0

  function buildPayload(): JECreate {
    return {
      ...form,
      entity_id: Number(entityId),
      scenario_id: scenarioId,
      source_ref: form.source_ref || null,
      lines: lines.map((l, i) => ({
        line_number: i + 1,
        account_id: l.account_id,
        entity_id: l.entity_id || Number(entityId),
        debit: l.debit,
        credit: l.credit,
        description: l.description,
      })),
    }
  }

  const draftMutation = useMutation({
    mutationFn: (data: JECreate) => journalEntriesApi.createDraft(data),
    onSuccess: (je) => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
      navigate(`/journal-entries/${je.id}`)
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const postMutation = useMutation({
    mutationFn: (data: JECreate) => journalEntriesApi.createAndPost(data),
    onSuccess: (je) => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
      const warns = je.warnings ?? []
      warns.forEach((w) => toast(w.message, 'warning', 8000))
      navigate(`/journal-entries/${je.id}`)
    },
    onError: (err: Error) => setApiError(err.message),
  })

  function updateLine(idx: number, field: keyof JELineCreate, value: string) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)))
  }

  function setLineAccount(idx: number, acct: Account | null) {
    setLines((prev) =>
      prev.map((l, i) =>
        i === idx ? { ...l, account_id: acct?.id ?? 0, _selectedAccount: acct } : l,
      ),
    )
  }

  function addLine() {
    setLines((prev) => [...prev, EMPTY_LINE()])
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  const isPending = draftMutation.isPending || postMutation.isPending
  const canSubmit = !!entityId && scenarioId > 0

  return (
    <PageLayout title="New Journal Entry" subtitle="Create a draft or post directly">
      <div className="space-y-4 max-w-4xl">
        {apiError && <ErrorBanner message={apiError} />}

        {/* Header fields */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Header</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Input
              label="JE Number"
              value={form.je_number}
              onChange={(e) => setForm({ ...form, je_number: e.target.value })}
              placeholder="JE-2024-001"
              required
            />
            <Input
              label="Entry Date"
              type="date"
              value={form.entry_date}
              onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
              required
            />
            <Input
              label="Source"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              placeholder="manual"
            />
            <EntitySelect
              label="Entity"
              value={entityId}
              onChange={setEntityId}
              required
            />
            <Input
              label="Source Ref"
              value={form.source_ref}
              onChange={(e) => setForm({ ...form, source_ref: e.target.value })}
              placeholder="optional"
            />
          </div>
          <Textarea
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            placeholder="Entry description"
            required
          />
          <div>
            <ScenarioMultiSelect
              label="Scenario (select one)"
              value={scenarioIds}
              onChange={(ids) => setScenarioIds(ids.slice(-1))}
            />
            {scenarioIds.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                A scenario is required before posting.{' '}
                <Link to="/setup?tab=scenarios" className="underline hover:text-amber-800">Manage scenarios in Setup →</Link>
              </p>
            )}
          </div>
        </div>

        {/* Line item grid */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Lines</h2>
              {!isBalanced && totalDebit + totalCredit > 0 && (
                <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700" data-testid="balance-chip">
                  {(totalDebit - totalCredit).toFixed(2)} diff
                </span>
              )}
              {isBalanced && totalDebit > 0 && (
                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                  ✓ Balanced
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={addLine}
              className="flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add line
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="je-lines-table">
              <thead>
                <tr className="border-b text-xs text-gray-500">
                  <th className="pb-2 text-left w-8">#</th>
                  <th className="pb-2 text-left min-w-[180px]">Account</th>
                  <th className="pb-2 text-right w-28">Debit</th>
                  <th className="pb-2 text-right w-28">Credit</th>
                  <th className="pb-2 text-left min-w-[140px]">Description</th>
                  <th className="pb-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx} className="border-b border-gray-50">
                    <td className="py-1 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="py-1 pr-2">
                      <AccountSearch
                        entityId={entityId}
                        value={line.account_id || null}
                        onChange={(acct) => setLineAccount(idx, acct)}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        type="number"
                        step="0.01"
                        value={line.debit}
                        onChange={(e) => updateLine(idx, 'debit', e.target.value)}
                        className="w-28 rounded border border-gray-300 px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                        aria-label={`Debit line ${idx + 1}`}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        type="number"
                        step="0.01"
                        value={line.credit}
                        onChange={(e) => updateLine(idx, 'credit', e.target.value)}
                        className="w-28 rounded border border-gray-300 px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                        aria-label={`Credit line ${idx + 1}`}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        type="text"
                        value={line.description ?? ''}
                        onChange={(e) => updateLine(idx, 'description', e.target.value)}
                        className="w-40 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        placeholder="optional"
                      />
                    </td>
                    <td className="py-1">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        disabled={lines.length <= 2}
                        className="rounded p-1 hover:bg-red-50 disabled:opacity-30"
                        aria-label={`Remove line ${idx + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="mt-3 flex justify-end gap-6 text-sm border-t pt-3" data-testid="je-totals">
            <div className="text-right">
              <span className="text-xs text-gray-500 block">Total Debits</span>
              <span className="font-mono font-medium">{totalDebit.toFixed(2)}</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-gray-500 block">Total Credits</span>
              <span className="font-mono font-medium">{totalCredit.toFixed(2)}</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-gray-500 block">Difference</span>
              <span className={`font-mono font-medium ${isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                {difference.toFixed(2)}
              </span>
            </div>
          </div>

          {!isBalanced && (
            <p className="mt-2 text-xs text-red-500" data-testid="balance-error">
              Debits and credits must balance before posting.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { setApiError(null); draftMutation.mutate(buildPayload()) }}
            disabled={isPending || !canSubmit}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {draftMutation.isPending ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            type="button"
            onClick={() => { setApiError(null); postMutation.mutate(buildPayload()) }}
            disabled={isPending || !isBalanced || !canSubmit}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {postMutation.isPending ? 'Posting…' : 'Post Entry'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/journal-entries')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </PageLayout>
  )
}
