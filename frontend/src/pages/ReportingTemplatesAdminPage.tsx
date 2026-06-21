import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Loader2, Lock } from 'lucide-react'
import { commonReportingLinesApi } from '@/api/commonReportingLines'
import type {
  CommonReportingLine,
  ReportingTemplate,
  TemplateCrlRow,
  TemplateCreatePayload,
} from '@/api/commonReportingLines'
import { useOrg } from '@/providers/OrgProvider'
import { useToast } from '@/providers/ToastProvider'

export function ReportingTemplatesAdminPage() {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const toast = useToast()
  const queryClient = useQueryClient()

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data: templates = [] } = useQuery<ReportingTemplate[]>({
    queryKey: ['admin-templates', orgId],
    queryFn: () => commonReportingLinesApi.listTemplates({
      organization_id: orgId ?? undefined,
      include_inactive: true,
    }),
  })

  const { data: allCrls = [] } = useQuery<CommonReportingLine[]>({
    queryKey: ['admin-crls-for-templates', orgId],
    queryFn: () => commonReportingLinesApi.list({
      organization_id: orgId ?? undefined,
    }),
  })

  // Auto-select first template once loaded
  useEffect(() => {
    if (selectedTemplateId === null && templates.length > 0) {
      setSelectedTemplateId(templates[0].id)
    }
  }, [templates, selectedTemplateId])

  const createMut = useMutation({
    mutationFn: (body: TemplateCreatePayload) => commonReportingLinesApi.createTemplate(body),
    onSuccess: (row) => {
      toast(`Template "${row.name}" created`, 'success')
      queryClient.invalidateQueries({ queryKey: ['admin-templates'] })
      queryClient.invalidateQueries({ queryKey: ['reporting-templates'] })
      setSelectedTemplateId(row.id)
      setShowCreate(false)
    },
    onError: (e: Error) => toast(`Create failed: ${e.message}`, 'error'),
  })

  const deleteTemplateMut = useMutation({
    mutationFn: (id: number) => commonReportingLinesApi.deleteTemplate(id),
    onSuccess: () => {
      toast('Template deleted (soft)', 'success')
      queryClient.invalidateQueries({ queryKey: ['admin-templates'] })
      setSelectedTemplateId(null)
    },
    onError: (e: Error) => toast(`Delete failed: ${e.message}`, 'error'),
  })

  if (!orgId) {
    return (
      <div className="p-6 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded">
        Pick an organization to manage reporting templates.
      </div>
    )
  }

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-6" data-testid="reporting-templates-admin">
      {/* Left rail — template list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Templates</h2>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold rounded"
            data-testid="create-template-btn"
          >
            <Plus className="w-3 h-3" /> New
          </button>
        </div>
        <p className="text-[11px] text-gray-500">
          Templates expose a subset of the FSLI catalog for a given client or industry. System templates are read-only.
        </p>

        {showCreate && (
          <CreateTemplateForm
            orgId={orgId}
            onCancel={() => setShowCreate(false)}
            onSubmit={(body) => createMut.mutate(body)}
            submitting={createMut.isPending}
          />
        )}

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTemplateId(t.id)}
              className={`w-full text-left px-3 py-2 text-xs border-b border-gray-100 last:border-b-0 ${
                selectedTemplateId === t.id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : 'hover:bg-gray-50'
              }`}
              data-testid={`template-row-${t.code}`}
            >
              <div className="flex items-center gap-1.5">
                {t.organization_id === null && <Lock className="w-3 h-3 text-gray-400" />}
                <span className="font-semibold text-gray-800">{t.name}</span>
                {!t.is_active && (
                  <span className="ml-1 text-[10px] text-gray-400">(inactive)</span>
                )}
              </div>
              <div className="text-[10px] text-gray-500 font-mono mt-0.5">{t.code}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel — membership matrix */}
      <div>
        {selectedTemplate ? (
          <TemplateMembershipEditor
            template={selectedTemplate}
            allCrls={allCrls}
            orgId={orgId}
            onDelete={() => {
              if (confirm(`Delete template "${selectedTemplate.name}"? It will be soft-deleted.`)) {
                deleteTemplateMut.mutate(selectedTemplate.id)
              }
            }}
          />
        ) : (
          <div className="text-xs text-gray-500 p-4 border border-dashed border-gray-300 rounded">
            Select a template on the left to view or edit its reporting-line membership.
          </div>
        )}
      </div>
    </div>
  )
}


function CreateTemplateForm({
  orgId,
  onCancel,
  onSubmit,
  submitting,
}: {
  orgId: number
  onCancel: () => void
  onSubmit: (body: TemplateCreatePayload) => void
  submitting: boolean
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      code: code.trim().toLowerCase().replace(/\s+/g, '_'),
      name: name.trim(),
      organization_id: orgId,
      description: description.trim() || null,
    })
  }

  return (
    <form
      onSubmit={submit}
      className="border border-indigo-200 bg-indigo-50/40 rounded-lg p-3 space-y-2 text-xs"
      data-testid="create-template-form"
    >
      <input
        type="text"
        required
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="template_code"
        className="w-full border border-gray-300 rounded h-7 px-2 font-mono"
        data-testid="create-template-code"
      />
      <input
        type="text"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Display name"
        className="w-full border border-gray-300 rounded h-7 px-2"
        data-testid="create-template-name"
      />
      <textarea
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full border border-gray-300 rounded p-1.5"
      />
      <div className="flex justify-end gap-1">
        <button type="button" onClick={onCancel} className="px-2 py-1 border border-gray-300 text-gray-700 rounded">Cancel</button>
        <button
          type="submit"
          disabled={submitting}
          className="px-2 py-1 bg-indigo-600 text-white rounded disabled:opacity-50"
          data-testid="create-template-submit"
        >
          {submitting ? 'Creating…' : 'Create'}
        </button>
      </div>
    </form>
  )
}


function TemplateMembershipEditor({
  template,
  allCrls,
  orgId,
  onDelete,
}: {
  template: ReportingTemplate
  allCrls: CommonReportingLine[]
  orgId: number
  onDelete: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const isSystem = template.organization_id === null

  const { data: membership = [], isLoading } = useQuery<TemplateCrlRow[]>({
    queryKey: ['template-crls', template.id],
    queryFn: () => commonReportingLinesApi.listTemplateCrls(template.id),
  })

  // Local edit state — map crl_id -> {is_visible, sort_order, display_label}
  type Sel = { is_visible: boolean; sort_order: number; display_label: string | null }
  const [edits, setEdits] = useState<Map<number, Sel>>(new Map())
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    const m = new Map<number, Sel>()
    for (const row of membership) {
      m.set(row.crl_id, {
        is_visible: row.is_visible,
        sort_order: row.sort_order,
        display_label: row.display_label,
      })
    }
    setEdits(m)
    setDirty(false)
  }, [membership])

  const saveMut = useMutation({
    mutationFn: () => commonReportingLinesApi.setTemplateCrls(template.id, {
      selections: Array.from(edits.entries()).map(([crl_id, sel]) => ({
        crl_id,
        is_visible: sel.is_visible,
        sort_order: sel.sort_order,
        display_label: sel.display_label,
      })),
      organization_id: orgId,
    }),
    onSuccess: (data) => {
      toast(`Template saved · +${data.added} / −${data.removed} / ~${data.updated}`, 'success')
      queryClient.invalidateQueries({ queryKey: ['template-crls', template.id] })
      queryClient.invalidateQueries({ queryKey: ['common-reporting-lines'] })
      setDirty(false)
    },
    onError: (e: Error) => toast(`Save failed: ${e.message}`, 'error'),
  })

  const crlsBySection = useMemo(() => {
    const out: Record<string, CommonReportingLine[]> = {}
    for (const c of allCrls) {
      const key = c.section || '—'
      if (!out[key]) out[key] = []
      out[key].push(c)
    }
    for (const key of Object.keys(out)) {
      out[key].sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
    }
    return out
  }, [allCrls])

  function setMembership(crlId: number, included: boolean) {
    const next = new Map(edits)
    if (included) {
      if (!next.has(crlId)) {
        next.set(crlId, { is_visible: true, sort_order: 0, display_label: null })
      }
    } else {
      next.delete(crlId)
    }
    setEdits(next)
    setDirty(true)
  }

  function setLabel(crlId: number, label: string) {
    const next = new Map(edits)
    const cur = next.get(crlId) ?? { is_visible: true, sort_order: 0, display_label: null }
    next.set(crlId, { ...cur, display_label: label || null })
    setEdits(next)
    setDirty(true)
  }

  function setOrder(crlId: number, order: number) {
    const next = new Map(edits)
    const cur = next.get(crlId) ?? { is_visible: true, sort_order: 0, display_label: null }
    next.set(crlId, { ...cur, sort_order: order })
    setEdits(next)
    setDirty(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            {template.name}
            {isSystem && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-semibold">
                <Lock className="w-3 h-3" /> System (read-only)
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-500 font-mono mt-1">{template.code}</p>
          {template.description && (
            <p className="text-xs text-gray-600 mt-1">{template.description}</p>
          )}
        </div>
        {!isSystem && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1 px-2 py-1 text-rose-700 hover:bg-rose-50 text-xs font-semibold rounded border border-rose-200"
              data-testid="delete-template-btn"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
            <button
              type="button"
              disabled={!dirty || saveMut.isPending}
              onClick={() => saveMut.mutate()}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded disabled:opacity-50"
              data-testid="save-template-crls-btn"
            >
              {saveMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              {saveMut.isPending ? 'Saving…' : dirty ? 'Save Changes' : 'No Changes'}
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="text-xs text-gray-500">Loading membership…</div>
      ) : (
        <div className="space-y-3">
          {Object.entries(crlsBySection).map(([section, rows]) => (
            <div key={section} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-3 py-1.5 text-[11px] font-semibold text-gray-700 uppercase tracking-wide">
                {section}
              </div>
              <table className="w-full text-xs">
                <thead className="bg-white border-b border-gray-100">
                  <tr className="text-left text-gray-500">
                    <th className="px-3 py-1 font-semibold w-8">Inc</th>
                    <th className="px-3 py-1 font-semibold w-40">Code</th>
                    <th className="px-3 py-1 font-semibold">FSLI Name</th>
                    <th className="px-3 py-1 font-semibold w-48">Display Override (optional)</th>
                    <th className="px-3 py-1 font-semibold w-16">Order</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const sel = edits.get(c.id)
                    const included = sel != null
                    return (
                      <tr key={c.id} className="border-t border-gray-100" data-testid={`template-membership-${c.code}`}>
                        <td className="px-3 py-1">
                          <input
                            type="checkbox"
                            disabled={isSystem}
                            checked={included}
                            onChange={(e) => setMembership(c.id, e.target.checked)}
                            data-testid={`template-include-${c.code}`}
                          />
                        </td>
                        <td className="px-3 py-1 font-mono text-gray-600">{c.code}</td>
                        <td className="px-3 py-1 text-gray-800">{c.name}</td>
                        <td className="px-3 py-1">
                          <input
                            type="text"
                            disabled={isSystem || !included}
                            value={sel?.display_label ?? ''}
                            onChange={(e) => setLabel(c.id, e.target.value)}
                            placeholder={included ? '— use FSLI name —' : ''}
                            className="w-full border border-gray-200 rounded h-6 px-1.5 text-xs disabled:bg-gray-50 disabled:text-gray-400"
                          />
                        </td>
                        <td className="px-3 py-1">
                          <input
                            type="number"
                            disabled={isSystem || !included}
                            value={sel?.sort_order ?? 0}
                            onChange={(e) => setOrder(c.id, Number(e.target.value))}
                            className="w-14 border border-gray-200 rounded h-6 px-1.5 text-xs disabled:bg-gray-50 disabled:text-gray-400 tabular-nums"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
