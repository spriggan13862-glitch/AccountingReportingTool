import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { overlayApi, downloadPreviewExport } from '@/api/overlay'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { PreviewBanner } from '@/components/overlay/PreviewBanner'
import { DraftOverlayModal } from '@/components/overlay/DraftOverlayModal'
import { OverlayComparisonTable } from '@/components/overlay/OverlayComparisonTable'
import { OverlaySummaryCard } from '@/components/overlay/OverlaySummaryCard'
import { useOrg } from '@/providers/OrgProvider'
import type { OverlayCalculateRequest, OverlayLineItem, OverlayResult } from '@/types'

export function DraftPreviewPage() {
  const { org } = useOrg()
  const orgId = org?.id ?? 0

  const [modalOpen, setModalOpen] = useState(false)
  const [result, setResult] = useState<OverlayResult | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [drilldownItem, setDrilldownItem] = useState<OverlayLineItem | null>(null)
  const [lastRequest, setLastRequest] = useState<OverlayCalculateRequest | null>(null)

  const calculateMutation = useMutation({
    mutationFn: (req: OverlayCalculateRequest) => overlayApi.calculate(req),
    onSuccess: (data) => {
      setResult(data)
      setApiError(null)
      setModalOpen(false)
    },
    onError: (err: Error) => {
      setApiError(err.message)
      setModalOpen(false)
    },
  })

  const exportMutation = useMutation({
    mutationFn: (req: OverlayCalculateRequest) => overlayApi.export(req),
    onSuccess: (blob) => {
      if (lastRequest) {
        downloadPreviewExport(blob, lastRequest.preview_type, lastRequest.as_of_date)
      }
    },
    onError: (err: Error) => setApiError(err.message),
  })

  function handleCalculate(req: OverlayCalculateRequest) {
    setLastRequest(req)
    calculateMutation.mutate(req)
  }

  function handleExport() {
    if (lastRequest) exportMutation.mutate(lastRequest)
  }

  return (
    <>
      <DraftOverlayModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        organizationId={orgId}
        onCalculate={handleCalculate}
        isCalculating={calculateMutation.isPending}
      />

      <PageLayout
        title="Draft Preview"
        subtitle="Preview financial statements with draft adjustments — not official"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
              data-testid="open-overlay-modal"
            >
              Configure Overlay
            </button>
            {result && (
              <button
                type="button"
                onClick={handleExport}
                disabled={exportMutation.isPending}
                className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                data-testid="export-preview-btn"
              >
                <Download className="h-3.5 w-3.5" />
                {exportMutation.isPending ? 'Exporting…' : 'Export DRAFT'}
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-4 max-w-6xl">
          {apiError && <ErrorBanner message={apiError} />}

          {!result && !calculateMutation.isPending && (
            <div className="rounded-lg border-2 border-dashed border-gray-200 py-16 text-center">
              <p className="text-sm text-gray-500 mb-3">No preview calculated yet.</p>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
              >
                Configure Draft Overlay
              </button>
            </div>
          )}

          {calculateMutation.isPending && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 py-12 text-center">
              <p className="text-sm text-gray-500">Calculating preview…</p>
            </div>
          )}

          {result && (
            <>
              <PreviewBanner
                label={result.label}
                generatedAt={result.generated_at}
                includedJeCount={result.included_je_count}
                overlayGroups={result.overlay_groups}
              />

              <OverlaySummaryCard result={result} />

              {/* Drilldown panel */}
              {drilldownItem && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                      Drilldown: {drilldownItem.account_number} — {drilldownItem.account_name}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setDrilldownItem(null)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Close
                    </button>
                  </div>
                  <p className="text-xs text-blue-700">
                    Draft adjustment: {parseFloat(drilldownItem.draft_signed_adjustment) > 0 ? '+' : ''}
                    {parseFloat(drilldownItem.draft_signed_adjustment).toFixed(2)}
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    Source JEs: {drilldownItem.source_je_ids.join(', ') || 'none (synthetic)'}
                  </p>
                  {drilldownItem.overlay_groups_used.length > 0 && (
                    <p className="text-xs text-blue-600 mt-0.5">
                      Groups: {drilldownItem.overlay_groups_used.join(', ')}
                    </p>
                  )}
                </div>
              )}

              <OverlayComparisonTable
                lineItems={result.line_items}
                onDrilldown={setDrilldownItem}
              />

              {result.preview_run_id && (
                <p className="text-xs text-gray-400">
                  Audit record: PreviewRun #{result.preview_run_id}
                </p>
              )}
            </>
          )}
        </div>
      </PageLayout>
    </>
  )
}
