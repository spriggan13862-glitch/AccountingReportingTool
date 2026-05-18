import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { tbImportApi } from '@/api/tbImport'
import type { ValidationResponse } from '@/types'
import { PageLayout } from '@/components/ui/PageLayout'
import { Input } from '@/components/ui/Input'
import { FileUpload } from '@/components/ui/FileUpload'
import { ValidationAlert, ErrorBanner } from '@/components/ui/ValidationAlert'
import { StatusBadge } from '@/components/ui/Badge'

type Stage = 'form' | 'validating' | 'preview' | 'importing' | 'done'

export function TrialBalanceImportPage() {
  const [stage, setStage] = useState<Stage>('form')
  const [file, setFile] = useState<File | null>(null)
  const [entityId, setEntityId] = useState('')
  const [scenarioId, setScenarioId] = useState('')
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10))
  const [jeNumber, setJeNumber] = useState('')
  const [importedBy, setImportedBy] = useState('')
  const [validation, setValidation] = useState<ValidationResponse | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{ id: number; status: string } | null>(null)

  const validateMutation = useMutation({
    mutationFn: () =>
      tbImportApi.validate({
        entity_id: Number(entityId),
        scenario_id: Number(scenarioId),
        as_of_date: asOfDate,
        file: file!,
      }),
    onMutate: () => { setStage('validating'); setApiError(null) },
    onSuccess: (result) => {
      setValidation(result)
      setStage('preview')
    },
    onError: (err: Error) => { setApiError(err.message); setStage('form') },
  })

  const importMutation = useMutation({
    mutationFn: () =>
      tbImportApi.import({
        entity_id: Number(entityId),
        scenario_id: Number(scenarioId),
        as_of_date: asOfDate,
        je_number: jeNumber,
        imported_by: importedBy || undefined,
        file: file!,
      }),
    onMutate: () => { setStage('importing'); setApiError(null) },
    onSuccess: (result) => {
      setImportResult({ id: result.id, status: result.status })
      setStage('done')
    },
    onError: (err: Error) => { setApiError(err.message); setStage('preview') },
  })

  const canValidate = file && entityId && scenarioId && asOfDate
  const canImport = validation?.success !== false && canValidate && jeNumber

  return (
    <PageLayout title="Trial Balance Import" subtitle="Upload a CSV to import account balances">
      <div className="space-y-4 max-w-2xl">
        {apiError && <ErrorBanner message={apiError} />}

        {/* Done state */}
        {stage === 'done' && importResult && (
          <div className="rounded-lg border border-green-300 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-800">Import successful!</p>
            <p className="text-xs text-green-600 mt-1">Import ID: {importResult.id}</p>
            <StatusBadge status={importResult.status} />
            <button
              type="button"
              onClick={() => { setStage('form'); setValidation(null); setImportResult(null); setFile(null) }}
              className="mt-3 text-xs text-green-700 underline"
            >
              Import another
            </button>
          </div>
        )}

        {stage !== 'done' && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3" data-testid="tb-import-form">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Import Parameters</h2>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Entity ID"
                type="number"
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder="1"
                required
              />
              <Input
                label="Scenario ID"
                type="number"
                value={scenarioId}
                onChange={(e) => setScenarioId(e.target.value)}
                placeholder="1"
                required
              />
              <Input
                label="As of Date"
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                required
              />
              <Input
                label="JE Number"
                value={jeNumber}
                onChange={(e) => setJeNumber(e.target.value)}
                placeholder="TB-2024-Q1"
              />
              <Input
                label="Imported By"
                value={importedBy}
                onChange={(e) => setImportedBy(e.target.value)}
                placeholder="optional"
              />
            </div>
            <FileUpload
              label="CSV File"
              accept=".csv,text/csv"
              file={file}
              onChange={setFile}
              error={!file && stage !== 'form' ? 'File is required' : undefined}
            />

            <div className="flex items-center gap-3 pt-2">
              {(stage === 'form' || stage === 'validating') && (
                <button
                  type="button"
                  onClick={() => validateMutation.mutate()}
                  disabled={!canValidate || stage === 'validating'}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {stage === 'validating' ? 'Validating…' : 'Validate'}
                </button>
              )}

              {(stage === 'preview' || stage === 'importing') && (
                <>
                  <button
                    type="button"
                    onClick={() => { setStage('form'); setValidation(null) }}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => importMutation.mutate()}
                    disabled={!canImport || stage === 'importing'}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {stage === 'importing' ? 'Importing…' : 'Import'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Validation preview */}
        {validation && stage === 'preview' && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
              Validation Results
              <span className={`ml-2 ${validation.success ? 'text-green-600' : 'text-red-600'}`}>
                — {validation.success ? 'Passed' : 'Failed'}
              </span>
            </h2>
            {validation.errors.length === 0 && validation.warnings.length === 0 && validation.info.length === 0 ? (
              <p className="text-sm text-green-600">No issues found. Ready to import.</p>
            ) : (
              <ValidationAlert result={validation} />
            )}
            {!validation.success && (
              <p className="mt-3 text-xs text-red-600">
                Resolve all errors before importing.
              </p>
            )}
          </div>
        )}
      </div>
    </PageLayout>
  )
}
