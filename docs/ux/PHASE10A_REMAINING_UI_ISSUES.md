# Phase 10A — Remaining UI Issues

Code-only audit. No screenshots. Severity: HIGH / MEDIUM / LOW.
Columns: Page | Issue | Severity | Recommended Fix | Sprint Status

---

## Adjustment Workbench

| Page | Issue | Severity | Recommended Fix | Status |
|------|-------|----------|-----------------|--------|
| Adjustment Workbench | `total_credit` was missing from backend `AdjustmentListItem` schema and API response | HIGH | Added `_total_credit()` helper + schema field in this sprint | **Fixed** |
| Adjustment Workbench | Summary row showed single "Amount" column (total_debit only) instead of separate Total Dr / Total Cr | HIGH | Split into two columns; both rendered inline | **Fixed** |
| Adjustment Workbench | `voided` status in StatusDot had no filter option and is not a valid user-facing status | LOW | Removed from StatusDot map | **Fixed** |
| Adjustment Workbench | Materiality selector changes have no loading indicator; user can click multiple times | LOW | Debounce mutation or disable selector while mutating | Deferred |
| Adjustment Workbench | Package sidebar opens inline and shifts layout; on small screens it collapses the grid | MEDIUM | Move to a right-aligned slide-out drawer (matches FinancialStatements drilldown pattern) | Deferred |

---

## Adjustment Bridge

| Page | Issue | Severity | Recommended Fix | Status |
|------|-------|----------|-----------------|--------|
| Bridge | AJE column headers lacked sequence number prefix (1 AJE-001, 2 AJE-002…) | MEDIUM | Added `{idx + 1}` prefix to each column header | **Fixed** |
| Bridge | Account ordering sorted by account_number only, ignoring statement order | MEDIUM | Backend `_acct_sort` now uses account_type ordering (asset → liability → equity → revenue → expense) then account_number | **Fixed** |
| Bridge | No Variance column — already correctly absent | — | Confirmed correct | No change needed |
| Bridge | `/compute` must be called before `/cpa-bridge` or the bridge shows empty rows — no UI prompt for this | HIGH | Add "Compute Bridge" button or trigger compute automatically on entity/period selection | Deferred |
| Bridge | Grand Total row shows sum across all account types, which is not meaningful for a multi-section FS bridge | MEDIUM | Add subtotals per account_type section (Assets total, Liabilities total, etc.) | Deferred |
| Bridge | No export to Excel button | LOW | Add export endpoint and button alongside the footer count line | Deferred |

---

## Financial Statements

| Page | Issue | Severity | Recommended Fix | Status |
|------|-------|----------|-----------------|--------|
| Financial Statements | Clicking a BS/IS line opens `DrilldownPanel` — verified stays on same page, no navigation | — | Confirmed correct | No change needed |
| Financial Statements | `DrilldownPanel` still receives data via legacy prop pattern; no TanStack Query fetch for drilldown | LOW | Migrate to `useQuery(['drilldown', accountId])` | Deferred |
| Financial Statements | Adjusted Balance column uses hardcoded `formatCurrency` (not settings-driven) | MEDIUM | Update to `useFormatCurrency()` hook | Deferred — hook created, adoption needed |
| Financial Statements | "Include Draft Adjustments" toggle has no confirmation when large number of draft entries exist | LOW | Add count badge and optional confirm dialog | Deferred |

---

## Journal Entry Editor (JournalEntryCreatePage)

| Page | Issue | Severity | Recommended Fix | Status |
|------|-------|----------|-----------------|--------|
| JE Editor | 6 default blank lines — verified implemented at line 51 | — | Confirmed correct | No change needed |
| JE Editor | JournalEntriesPage (list view) still has `Submit for Review` / `reviewer_user_id` assignment flow at line 1498 — this is a separate signoff workflow, not the same as the removed approval concept | MEDIUM | Decide: either fully implement the signoff workflow with email delivery, or remove the reviewer assignment UI | Deferred |
| JE Editor | Scenario field is required to post but blank by default — no default scenario applied | MEDIUM | Auto-select first active scenario or the workspace-scoped scenario from WorkspaceProvider | Deferred |

---

## Import Center / Mapping Center

| Page | Issue | Severity | Recommended Fix | Status |
|------|-------|----------|-----------------|--------|
| Import Center | Three URLs resolve to same page (`/import`, `/import-center`, `/client-data/imports`) — legacy redirects intact | LOW | Remove legacy routes after next release | Deferred |
| Mapping Workbench | Inline `AccountSearch` component duplicates `src/components/ui/AccountSearch.tsx` | MEDIUM | Remove inline version, always import from ui/ | Deferred |
| Import Wizard | `ImportWizardPage` and `TrialBalanceImportPage` duplicate the same multi-step wizard | HIGH | Consolidate into one parameterized wizard page | Deferred |

---

## Trial Balance

| Page | Issue | Severity | Recommended Fix | Status |
|------|-------|----------|-----------------|--------|
| Trial Balance | Amount columns use raw `formatCurrency` — not settings-driven | MEDIUM | Adopt `useFormatCurrency()` hook | Deferred |
| Trial Balance | No pagination — all accounts load at once; 500+ account entities will be slow | MEDIUM | Add server-side pagination or virtualization | Deferred |

---

## Consolidation

| Page | Issue | Severity | Recommended Fix | Status |
|------|-------|----------|-----------------|--------|
| Consolidation | Amount display uses raw `formatCurrency` — not settings-driven | MEDIUM | Adopt `useFormatCurrency()` hook | Deferred |
| Consolidation | No inter-company elimination UI — eliminations must be posted as manual JEs | HIGH | Add elimination workflow linked to consolidation group | Deferred |

---

## Cash Flow Workpaper

| Page | Issue | Severity | Recommended Fix | Status |
|------|-------|----------|-----------------|--------|
| Cash Flow | Amount display uses raw `formatCurrency` | MEDIUM | Adopt `useFormatCurrency()` hook | Deferred |
| Cash Flow | BS–CFS tie-in check always shows green even when cash flow is computed from incomplete data | MEDIUM | Validate that beginning cash + net change = ending cash before marking check as passed | Deferred |

---

## Deliverables

| Page | Issue | Severity | Recommended Fix | Status |
|------|-------|----------|-----------------|--------|
| Deliverables | Amount display in export preview uses raw `formatCurrency` | LOW | Adopt `useFormatCurrency()` hook | Deferred |

---

## Intelligence Engine

| Page | Issue | Severity | Recommended Fix | Status |
|------|-------|----------|-----------------|--------|
| Intelligence | Finding amounts use raw `formatCurrency` in detail panel | LOW | Adopt `useFormatCurrency()` hook | Deferred |

---

## Overview

| Page | Issue | Severity | Recommended Fix | Status |
|------|-------|----------|-----------------|--------|
| Overview | What's New updated with Phase 10A changes | — | Done | **Fixed** |
| Overview | Version display still shows "v10" — should auto-increment | LOW | Derive from package.json or git tag | Deferred |

---

## Global / Cross-Cutting

| Issue | Severity | Recommended Fix | Status |
|-------|----------|-----------------|--------|
| `useFormatCurrency` hook created — Bridge and Workbench now use it | — | Done | **Fixed** |
| Remaining pages (Trial Balance, FS, Consolidation, Cash Flow, Intelligence) still call `formatCurrency` directly | MEDIUM | Systematic adoption of `useFormatCurrency` across all pages | Deferred |
| No centralized TanStack Query key factory — cache invalidation can silently miss | MEDIUM | Create `src/api/queryKeys.ts` with typed key factories | Deferred |
| `any` type casts (33 instances) in import/mapping pages | MEDIUM | Type API responses properly | Deferred |

---

## Summary — This Sprint

Fixed in Phase 10A:
- Adjustment Workbench: Total Dr + Total Cr columns (Issues 1, 2)
- Adjustment Workbench: voided status removed
- Bridge: AJE sequence numbers (Issue 3)
- Bridge: account ordering by statement type then account number (Issue 4)
- Reporting settings: `useFormatCurrency` hook created and applied to Bridge + Workbench (Issue 5 partial)
- What's New updated (Issue 8)

Verified already correct (no changes needed):
- JE create form has 6 default lines (Issue 6)
- Financial Statements drilldown stays on page (Issue 7)
- Bridge has no Variance column (Issue 3)

Deferred (documented above, not blocking current sprint):
- Global `useFormatCurrency` adoption on all remaining pages
- Bridge compute-trigger UX
- Import wizard consolidation
- JE signoff workflow decision
- Bridge subtotals by account type
