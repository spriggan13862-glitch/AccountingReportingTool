import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { journalEntriesApi } from '@/api/journalEntries'
import { workflowApi } from '@/api/workflow'
import { PageLayout } from '@/components/ui/PageLayout'
import { StatusBadge, SeverityBadge } from '@/components/ui/Badge'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </div>
  )
}

export function JournalEntryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const jeId = Number(id)
  const queryClient = useQueryClient()

  const [actionError, setActionError] = useState<string | null>(null)
  const [reverseOpen, setReverseOpen] = useState(false)
  const [reverseForm, setReverseForm] = useState({
    reversal_date: new Date().toISOString().slice(0, 10),
    je_number: '',
    description: '',
  })

  const { data: je, isLoading, isError, error } = useQuery({
    queryKey: ['journal-entry', jeId],
    queryFn: () => journalEntriesApi.get(jeId),
    enabled: !isNaN(jeId),
  })

  const { data: signoffs } = useQuery({
    queryKey: ['signoffs', 'journal_entry', jeId],
    queryFn: () => workflowApi.listSignoffs('journal_entry', jeId),
    enabled: !isNaN(jeId),
  })

  const postMutation = useMutation({
    mutationFn: () => journalEntriesApi.postDraft(jeId),
    onSuccess: () => {
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['journal-entry', jeId] })
    },
    onError: (err: Error) => setActionError(err.message),
  })

  const reverseMutation = useMutation({
    mutationFn: () => journalEntriesApi.reverse(jeId, reverseForm),
    onSuccess: () => {
      setReverseOpen(false)
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['journal-entry', jeId] })
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
    },
    onError: (err: Error) => { setReverseOpen(false); setActionError(err.message) },
  })

  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState message={(error as Error).message} />
  if (!je) return null

  const isDraft = je.status === 'draft'
  const isPosted = je.status === 'posted'
  const isImmutable = je.status === 'reversed'

  return (
    <>
    <ConfirmDialog
      open={reverseOpen}
      onOpenChange={setReverseOpen}
      title="Reverse Journal Entry"
      description="This will create a reversing entry. This action cannot be undone."
      confirmLabel="Reverse"
      destructive
      onConfirm={() => reverseMutation.mutate()}
    >
      <div className="mt-3 space-y-2">
        <Input
          label="Reversal Date"
          type="date"
          value={reverseForm.reversal_date}
          onChange={(e) => setReverseForm({ ...reverseForm, reversal_date: e.target.value })}
        />
        <Input
          label="Reversal JE Number"
          value={reverseForm.je_number}
          onChange={(e) => setReverseForm({ ...reverseForm, je_number: e.target.value })}
          placeholder="REV-JE-001"
        />
        <Input
          label="Description"
          value={reverseForm.description}
          onChange={(e) => setReverseForm({ ...reverseForm, description: e.target.value })}
          placeholder="Reversal of …"
        />
      </div>
    </ConfirmDialog>

    <PageLayout
      title={je.je_number}
      subtitle={`${je.entry_date} · ${je.description}`}
      actions={
        <div className="flex items-center gap-2">
          <StatusBadge status={je.status} />
          {isDraft && (
            <button
              type="button"
              onClick={() => postMutation.mutate()}
              disabled={postMutation.isPending}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {postMutation.isPending ? 'Posting…' : 'Post'}
            </button>
          )}
          {isPosted && (
            <button
              type="button"
              onClick={() => setReverseOpen(true)}
              className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Reverse
            </button>
          )}
          {isImmutable && (
            <span className="text-xs text-gray-400 italic">Immutable</span>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {actionError && <ErrorBanner message={actionError} className="col-span-full" />}
        {/* Metadata */}
        <Section title="Details">
          <dl className="space-y-2 text-sm">
            {[
              ['Entity', je.entity_id],
              ['Scenario', je.scenario_id],
              ['Source', je.source],
              ['Created By', je.created_by ?? '—'],
              ['Posted By', je.posted_by ?? '—'],
              ['Created At', je.created_at],
              ['Posted At', je.posted_at ?? '—'],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between">
                <dt className="text-gray-500">{label}</dt>
                <dd className="font-medium text-gray-900">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </Section>

        {/* Lines */}
        <Section title="Lines">
          {(() => {
            const totalDebit = je.lines.reduce((s, l) => s + parseFloat(l.debit || '0'), 0)
            const totalCredit = je.lines.reduce((s, l) => s + parseFloat(l.credit || '0'), 0)
            const diff = Math.abs(totalDebit - totalCredit)
            const balanced = diff < 0.001
            return (
              <>
                {!balanced && (
                  <div className="mb-2 inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700" data-testid="balance-chip">
                    Out of balance by {diff.toFixed(2)}
                  </div>
                )}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-gray-500">
                      <th className="pb-1 text-left">#</th>
                      <th className="pb-1 text-left">Account</th>
                      <th className="pb-1 text-right">Debit</th>
                      <th className="pb-1 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {je.lines.map((line) => (
                      <tr key={line.id} className="border-b border-gray-50">
                        <td className="py-1 text-gray-400">{line.line_number}</td>
                        <td className="py-1 font-mono">{line.account_id}</td>
                        <td className="py-1 text-right tabular-nums">{Number(line.debit) !== 0 ? line.debit : ''}</td>
                        <td className="py-1 text-right tabular-nums">{Number(line.credit) !== 0 ? line.credit : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t text-xs text-gray-500">
                    <tr>
                      <td colSpan={2} className="pt-1.5 font-semibold">Totals</td>
                      <td className="pt-1.5 text-right tabular-nums font-semibold">{totalDebit.toFixed(2)}</td>
                      <td className="pt-1.5 text-right tabular-nums font-semibold">{totalCredit.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </>
            )
          })()}
        </Section>

        {/* Warnings & Signoffs */}
        <div className="flex flex-col gap-4">
          {je.warnings.length > 0 && (
            <Section title="Validation Warnings">
              <ul className="space-y-2">
                {je.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <SeverityBadge severity={w.severity} />
                    <span className="text-gray-700">{w.message}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Signoffs">
            {!signoffs || signoffs.length === 0 ? (
              <p className="text-xs text-gray-400">No signoffs yet.</p>
            ) : (
              <ul className="space-y-2">
                {signoffs.map((s) => (
                  <li key={s.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Reviewer #{s.reviewer_user_id}</span>
                    <StatusBadge status={s.signoff_status} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </PageLayout>
    </>
  )
}
