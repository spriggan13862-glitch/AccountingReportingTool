/**
 * Correction 10 — Review Exceptions reads the canonical FSLI field.
 *
 * The bug: Review Exceptions counted "Auto-mapped" by checking
 * import_lines.selected_fsli_taxonomy_node_id. Wizard step 4's CRL
 * picker writes selected_common_reporting_line_id. So accepted
 * mappings counted as 0 auto-mapped — Step 4 said "mapped",
 * Review Exceptions said "needs review".
 *
 * Fix: read selected_common_reporting_line_id (canonical).
 *
 * These tests exercise the pure stats helper directly so the assertion
 * is on the rule, not on React Query plumbing.
 */
import { describe, it, expect } from 'vitest'
import { computeReviewExceptionStats } from '@/pages/TrialBalanceImportPage'

describe('Correction 10 — Review Exceptions canonical FSLI source', () => {
  it('counts a line as auto-mapped when selected_common_reporting_line_id is set', () => {
    const lines = [
      { mapping_status: 'mapped', selected_common_reporting_line_id: 42 },
      { mapping_status: 'mapped', selected_common_reporting_line_id: 7 },
      { mapping_status: 'mapped', selected_common_reporting_line_id: null },
    ]
    const stats = computeReviewExceptionStats(lines, [])
    expect(stats.totalImported).toBe(3)
    expect(stats.autoMapped).toBe(2)
    expect(stats.needsReview).toBe(1)
  })

  it('does NOT count a line as auto-mapped just because the legacy taxonomy field is set', () => {
    // Hard-stop regression for the original bug: a line with only the
    // legacy selected_fsli_taxonomy_node_id (and no canonical CRL) is
    // NOT considered auto-mapped, because the canonical FSLI store is
    // what every other screen reads.
    const lines = [
      // legacy field would have been set by the "Show full taxonomy" path,
      // but canonical FSLI is null → still counts as needs-review.
      { mapping_status: 'mapped', selected_common_reporting_line_id: null,
        // extra prop allowed (test data may carry it); should be IGNORED.
        selected_fsli_taxonomy_node_id: 999 } as any,
    ]
    const stats = computeReviewExceptionStats(lines, [])
    expect(stats.autoMapped).toBe(0)
    expect(stats.needsReview).toBe(1)
  })

  it('counts mapping_status="unmapped" as needs-review regardless of FSLI', () => {
    const lines = [
      { mapping_status: 'unmapped', selected_common_reporting_line_id: 42 },
      { mapping_status: 'mapped',   selected_common_reporting_line_id: 42 },
    ]
    const stats = computeReviewExceptionStats(lines, [])
    expect(stats.needsReview).toBe(1) // unmapped one
    expect(stats.autoMapped).toBe(2)  // both have an FSLI
  })

  it('counts mapping_status="skipped" as excluded, not needs-review', () => {
    const lines = [
      { mapping_status: 'skipped', selected_common_reporting_line_id: null },
      { mapping_status: 'mapped',  selected_common_reporting_line_id: 7 },
    ]
    const stats = computeReviewExceptionStats(lines, [])
    expect(stats.excluded).toBe(1)
    expect(stats.autoMapped).toBe(1)
  })

  it('counts error-severity validation issues', () => {
    const stats = computeReviewExceptionStats([], [
      { severity: 'error', code: 'IMPORT_MISSING_MAPPING' },
      { severity: 'warning', code: 'IMPORT_DUP_ACCOUNT' },
      { severity: 'error', code: 'IMPORT_BALANCE' },
    ])
    expect(stats.errors).toBe(2)
  })

  it('happy path: 245 mapped lines, all canonical FSLI set, zero needs-review', () => {
    const lines = Array.from({ length: 245 }, (_, i) => ({
      mapping_status: 'mapped',
      selected_common_reporting_line_id: (i % 30) + 1,
    }))
    const stats = computeReviewExceptionStats(lines, [])
    expect(stats.totalImported).toBe(245)
    expect(stats.autoMapped).toBe(245)
    expect(stats.needsReview).toBe(0)
  })
})
