# Phase 10 Visual Audit

**Sprint 4.0 Phase 10 — Adjustment Workbench + Bridge UX Refactor**

---

## Audit Scope

Pages reviewed for Phase 10 visual QA:

1. Financial Statements (`/workbench/financial-statements`)
2. Adjustment Bridge (`/workbench/adjustment-bridge`)
3. Adjustment Workbench (`/workbench/adjustment-workspace`)
4. Trial Balance (`/workbench/trial-balance`)
5. Import Center (`/workbench/import`)
6. Mapping Center (`/workbench/mapping`)
7. Consolidation (`/workbench/consolidation`)
8. Intelligence Dashboard (`/intelligence/dashboard`)
9. Deliverables (`/deliverables`)

---

## 1. Financial Statements

| Area | Observation | Status |
|---|---|---|
| Number formatting | Uses local `fmt()` helpers rather than `format.ts` utilities | OPEN — Part 5 backlog |
| Statement tabs | IS / BS / CF tabs functional | OK |
| Period selector | Reads from page-local state, not WorkspaceProvider | OPEN — Phase 1 plan item |
| Drill-through | "View in ledger" buttons navigate correctly | OK |
| Negative display | Some pages use minus sign; `formatCurrency` uses parentheses | OPEN — consistency pass needed |

---

## 2. Adjustment Bridge (Phase 10 rebuild)

### What changed
The page was rebuilt from a multi-slicer pivot workbook to a **CPA-style bridge workbook**:

- **Before**: Entity/Period/Scenario slicers + "Compute/Refresh" button + grouped account rows with collapsible sections + 2D pivot mode
- **After**: Entity + Period selectors only; no manual compute step; table auto-loads with each posted AJE as its own column

### New layout

```
Entity [▾]   Period [▾]

┌─────────────────────────────────────────────────────────────────────────┐
│ Acct # │ Account Name     │ As Reported │ AJE-001 │ AJE-002 │ Total AJEs │ Adjusted │
├─────────┼──────────────────┼─────────────┼─────────┼─────────┼────────────┼──────────┤
│ 1000    │ Cash             │ $100,000    │ +$5,000 │   —     │ $5,000     │ $105,000 │
│ 4000    │ Revenue          │ $500,000    │   —     │($25,000)│ ($25,000)  │ $475,000 │
├─────────┴──────────────────┼─────────────┼─────────┼─────────┼────────────┼──────────┤
│ Grand Total                │ $600,000    │ +$5,000 │($25,000)│ ($20,000)  │ $580,000 │
└────────────────────────────┴─────────────┴─────────┴─────────┴────────────┴──────────┘
```

### Visual conventions

| Element | Convention |
|---|---|
| AJE column headers | JE number in monospace + truncated description; full description on hover |
| Positive AJE impact | Green (`text-emerald-700`) with `+` prefix |
| Negative AJE impact | Rose (`text-rose-600`) with parentheses |
| Zero cells | Em-dash (`—`) in light slate |
| Adjusted column | Indigo tint background; bold font |
| Account ordering | Numeric ascending by account number |
| Sticky columns | Acct # and Account Name columns sticky-left for horizontal scroll |

### Known gaps

| Gap | Priority |
|---|---|
| No scenario filter on bridge | Low — scenario dimension not yet wired to CPA bridge API |
| No export (CSV/Excel) | Medium — Phase 4 deliverables backlog |
| Empty state when no posted AJEs | Handled with friendly message |

---

## 3. Adjustment Workbench (Phase 10 rebuild)

### What changed

- **Before**: Click-to-open right sidebar drawer; two tabs (Master Grid / Rollforward)
- **After**: JE lines expanded inline by default; single flat grid; no drawer; no tabs

### New layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ☐ ▼ │ JE #    │ Date       │ Description           │ Status  │ Type     │ ... │
├──────┼─────────┼────────────┼───────────────────────┼─────────┼──────────┼─────┤
│ ☐ ▾ │ AJE-001 │ 2026-01-15 │ Accrue bonus liab.    │ • draft │ accrual  │ ... │
│      │ 6100    │ Bonus Expense                       │ $50,000 │          │     │
│      │ 2100    │ Accrued Liabilities                 │         │ $50,000  │     │
├──────┼─────────┼────────────┼───────────────────────┼─────────┼──────────┼─────┤
│ ☐ ▾ │ AJE-002 │ 2026-01-20 │ Eliminate IC revenue  │ • posted│ elim.    │ ... │
│      │ 4000    │ Revenue                             │$120,000 │          │     │
│      │ 1300    │ Intercompany AR                     │         │$120,000  │     │
└──────┴─────────┴────────────┴───────────────────────┴─────────┴──────────┴─────┘
```

### Visual conventions

| Element | Convention |
|---|---|
| Chevron `▾` | Expand/collapse lines for that JE |
| Status dot | Amber = draft, green = posted, slate = reversed |
| Inline line rows | Indented under JE row; sub-table with lighter background on hover |
| Debit/credit | `formatCurrency` (no sign for zero, parentheses for negatives) |
| Source column | Plain text (`manual`, `tb_import`, etc.) |
| NI Impact | Green `+` prefix for positive; rose with `↓` for negative |

### Approval workflow removal

The following approval-related UI elements were intentionally removed per Phase 10 brief:

- "Submit for Approval" button
- Pending Approval tab
- Approval queue section
- `pending_approval` status filter option

Only `draft`, `posted`, and `reversed` status options remain in the filter.

### Known gaps

| Gap | Priority |
|---|---|
| No advisor notes panel | Medium — NI notes moved to the detail JE page |
| No rollforward tab | Low — rollforward view available via Bridge page |
| Materiality edit requires opening JE | Medium — direct inline badge-click edit removed with drawer |

---

## 4. Trial Balance

| Area | Observation | Status |
|---|---|
| Number formatting | Uses `Intl.NumberFormat` locally | OPEN — standardize to `format.ts` |
| Account type filter | Functional | OK |
| Entity/period selectors | Page-local (not WorkspaceProvider) | OPEN — Phase 1 |
| Export | CSV download present | OK |

---

## 5. Import Center

| Area | Observation | Status |
|---|---|
| Step indicator | Upload → Preview → Map → Apply steps shown | OK |
| Unmapped account gate | Warning banner when unmapped accounts > 0 | OK |
| PDF vs TB routing | Separate flows for TB import and PDF import | OK |
| Batch history | Shows previous imports with status badges | OK |

---

## 6. Mapping Center

| Area | Observation | Status |
|---|---|
| Drag-and-drop mapping | HTML5 drag-and-drop to taxonomy nodes | OK |
| Conflict badges | Red badges for taxonomy conflicts | OK |
| Bulk resolve | Select multiple + resolve action | OK |
| Save confirmation | Toast on save | OK |

---

## 7. Consolidation

| Area | Observation | Status |
|---|---|
| Entity matrix | Multi-entity column layout | OK |
| Eliminations | Elimination JEs subtracted correctly | OK |
| Minority interest | Not yet exposed in UI | OPEN — Phase 2 backlog |
| Number formatting | Uses local helpers | OPEN — standardize |

---

## 8. Intelligence Dashboard

| Area | Observation | Status |
|---|---|
| Rerun accumulation | Fixed in Phase 9A (DEFECT-01) | RESOLVED |
| Comparison period warning | Amber banner when no prior period | RESOLVED |
| Management inquiry questions | Populated from templates (DEFECT-03) | RESOLVED |
| Materiality floor warning | Shows when floor applied (DEFECT-07) | RESOLVED |
| EBITDA proxy label | Italicized note (DEFECT-06) | RESOLVED |
| Partial detection warnings | Red warning list (DEFECT-02) | RESOLVED |

---

## 9. Deliverables

| Area | Observation | Status |
|---|---|
| Snapshot lock | "Lock Deliverable" button present | OK |
| Compare to current | Diff view after lock | OK |
| Workspace cross-links | Links to Adjustment Bridge and Workbench | OK |
| Number formatting | Uses local `fmt()` helper | OPEN — standardize to `format.ts` |

---

## Global Format.ts Adoption Status

`frontend/src/lib/format.ts` was introduced in Phase 9A. The following pages now use it:

| Page | Status |
|---|---|
| `AdjustmentWorkspacePage.tsx` | `formatCurrency` ✓ |
| `AdjustmentBridgePage.tsx` | `formatCurrency` ✓ |
| `OverviewPage.tsx` | partial (compact format inline) |

Pages still using local helpers (future `format.ts` adoption pass):

- `FinancialStatementsPage.tsx` — uses `fmtN` / `Intl.NumberFormat`
- `TrialBalancePage.tsx` — local `fmt()`
- `ConsolidationPage.tsx` — local `fmt()`
- `DeliverablesPage.tsx` — local `fmt()`
- `AdjustmentBridgePage.tsx` (old rows grid path) — N/A (replaced)

---

## Phase 10 Checklist

| Part | Description | Status |
|---|---|---|
| Part 1 | Rebuild Adjustment Workbench with inline JE lines | ✓ Done |
| Part 2 | Remove approval workflow noise | ✓ Done |
| Part 3 | Rebuild Bridge as CPA-style per-AJE column workbook | ✓ Done |
| Part 4 | Account ordering by account number ascending | ✓ Done (backend) |
| Part 5 | Wire format.ts to Workbench + Bridge pages | ✓ Done |
| Part 6 | What's New update | ✓ Done (Phase 9A) |
| Part 7 | This visual audit document | ✓ Done |
