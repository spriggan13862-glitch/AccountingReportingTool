# Tier 3 Architecture Document
**Status:** Awaiting Approval  
**Branch target:** `tier-3-navigation-and-architecture`  
**Produced:** 2026-06-11

---

## 1. Executive Summary

Tier 1 made the core accounting workflows function correctly.  
Tier 2 polished individual features (PDF quality, import corrections, COA UX).  
Tier 3 addresses the **information architecture** — the structure that holds all of those features together.

The app currently has **45 screens, 42 protected routes, and 16 nav items** arranged with no consistent grouping logic. Features added milestone-by-milestone accumulated as flat sidebar entries or orphaned routes with no nav entry at all. The result:

- **8 screens have no nav entry** (Close Management, Workpapers, Workflow, Issues, Comparative Financials, Variance Analysis, Draft Preview, Report Builder, Report Detail, COA Import, PDF Import)
- **3 legacy import pages overlap** with the central Import Center
- **4 reporting screens** are scattered across unrelated nav groups
- The sidebar reads as a feature dump, not a workflow

Tier 3 fixes this with a disciplined navigation redesign, route hierarchy consolidation, and a consistent page-level component system — **no new features, only structural improvement**.

---

## 2. Current State Assessment

### 2.1 Navigation Problems

| Problem | Count | Impact |
|---------|-------|--------|
| Screens with no sidebar nav entry | 8+ | Users cannot discover features |
| Top-level nav items with no logical grouping | 11 primary | Cognitive overload — reads like a list of features |
| Import-related pages split across 5+ separate routes | 5 | Confusing entry points for same workflow |
| Reporting screens in 4+ disconnected locations | 4 | No obvious "where do I find reports?" answer |
| Close Management 5-screen flow with no nav entry | 5 | Critical workflow hidden |
| Sidebar "Admin & Setup" mixes setup (Entities, Periods) with workflow (Reconciliations) | — | Wrong mental model |

### 2.2 Route Problems

| Problem | Example |
|---------|---------|
| Legacy import routes not under `/imports/` prefix | `/coa-import`, `/pdf-import` at root |
| Import wizard sub-routes inconsistent | `/import/new` vs `/import/:id` vs `/import/:id/mapping` |
| Close management uses `/close/:id` with no parent breadcrumb context | `/close/tasks/:id` orphaned |
| No route hierarchy signals sub-ownership | `/fs-builder` not nested under `/financials/` |

### 2.3 Component Duplication

| Pattern | Locations | Consolidation Opportunity |
|---------|-----------|--------------------------|
| Entity select + period select combo | TBPage, JE Create, GL Import, FS Page, Comparative, Variance | `WorkspaceFilterBar` component |
| Empty state with CTA | DashboardPage, COA, JE List, Reports, Close | Standardize `EmptyState` props |
| Two-panel layout (list + detail) | Reconciliations, Close Tasks, Workpapers, Reports | `SplitPanelLayout` component |
| Status badge (multiple status sets) | Close tasks, Import batches, JE status, Period status | Extend shared `StatusBadge` |
| Step wizard container | PDF Import, COA Import, FS Builder, JE Import | Shared `WizardShell` already exists in import-wizard but not used everywhere |

### 2.4 Unreachable / Orphaned Screens

These pages exist and are routed but have **no sidebar navigation entry** and no clear navigation path from other pages:

- `ComparativeFinancialsPage` — `/comparative-financials`
- `VarianceAnalysisPage` — `/variance-analysis`
- `DraftPreviewPage` — `/draft-preview`
- `ReportBuilderPage` — `/report-builder`
- `ReportsPage` — `/reports`
- `ReportDetailPage` — `/reports/:id`
- `COAImportPage` — `/coa-import`
- `PDFImportPage` — `/pdf-import`
- `CloseDashboardPage` — `/close` (no nav link)
- `CloseChecklistPage`, `CloseTaskDetailPage`, `WorkpaperCenterPage`, `WorkpaperDetailPage` — reachable only from Close Dashboard
- `WorkflowPage` — `/workflow`
- `IssuesPage` — `/issues`

---

## 3. Proposed Information Architecture

### 3.1 Navigation Groups

```
OVERVIEW
  └── Dashboard                   /

JOURNAL ENTRIES
  └── Journal Entries             /journal-entries
      ├── New Entry               /journal-entries/new
      └── [Detail]                /journal-entries/:id

IMPORTS                           (collapsible group)
  ├── Import Center               /imports
  ├── Trial Balance               /imports/trial-balance
  ├── General Ledger              /imports/general-ledger
  ├── Journal Entries             /imports/journal-entries
  ├── Chart of Accounts           /imports/coa
  └── PDF Statement               /imports/pdf

CHART OF ACCOUNTS
  ├── Accounts                    /accounts
  └── Taxonomy                    /taxonomy-admin

FINANCIALS                        (collapsible group)
  ├── Trial Balances              /financials/trial-balances
  ├── Financial Statements        /financials/statements
  ├── FS Builder                  /financials/builder
  ├── Comparatives                /financials/comparative
  ├── Variance Analysis           /financials/variance
  └── Adjustment Bridge           /financials/adjustment-bridge

CLOSE                             (collapsible group)
  ├── Close Dashboard             /close
  └── Workpapers                  /close/workpapers

RECONCILIATIONS
  └── Reconciliations             /reconciliations
      └── [Detail]                /reconciliations/:id

REPORTS
  ├── Reports                     /reports
  └── Report Builder              /reports/builder

SETTINGS                          (collapsible group)
  ├── Entities                    /settings/entities
  ├── Periods                     /settings/periods
  ├── Consolidations              /settings/consolidations
  ├── Documents                   /settings/documents
  ├── Reporting Settings          /settings/reporting
  └── Admin                       /admin               [admin role only]

HELP
  └── Help Center                 /help
```

### 3.2 Navigation Design Principles

1. **Groups, not lists.** Nav items belong to a domain group. Groups are collapsible. No flat top-level list of 16 items.
2. **Every screen is reachable.** No orphaned routes — if it has a route, it has a nav path.
3. **Active state follows hierarchy.** Visiting `/financials/statements` highlights both the "Financials" group and the "Financial Statements" item.
4. **Settings are settings.** Entities, Periods, Consolidations, Documents, and Reporting Settings move under a single "Settings" collapsible. They are configuration, not workflow.
5. **Imports are a workflow, not a feature.** All import pages live under `/imports/` with the Import Center as the parent hub.
6. **Close is a workflow, not a setting.** Close Management moves out of the admin section into a first-class group.

---

## 4. Route Migration

### 4.1 Route Renames

| Old Route | New Route | Redirect Required |
|-----------|-----------|-------------------|
| `/import` | `/imports` | Yes (301) |
| `/import/new` | `/imports` (hub handles new) | Yes |
| `/import/:id` | `/imports/:id` | Yes |
| `/import/:id/mapping` | `/imports/:id/mapping` | Yes |
| `/coa-import` | `/imports/coa` | Yes |
| `/pdf-import` | `/imports/pdf` | Yes |
| `/imports/trial-balance` | keep | — |
| `/imports/general-ledger` | keep | — |
| `/imports/journal-entries` | keep | — |
| `/trial-balances` | `/financials/trial-balances` | Yes |
| `/financial-statements` | `/financials/statements` | Yes |
| `/fs-builder` | `/financials/builder` | Yes |
| `/comparative-financials` | `/financials/comparative` | Yes |
| `/variance-analysis` | `/financials/variance` | Yes |
| `/adjustment-bridge` | `/financials/adjustment-bridge` | Yes |
| `/draft-preview` | `/financials/draft-preview` | Yes |
| `/report-builder` | `/reports/builder` | Yes |
| `/entities` | `/settings/entities` | Yes |
| `/periods` | `/settings/periods` | Yes |
| `/periods/:id` | `/settings/periods/:id` | Yes |
| `/consolidations` | `/settings/consolidations` | Yes |
| `/documents` | `/settings/documents` | Yes |
| `/reporting-settings` | `/settings/reporting` | Yes |

Routes that do **not** change:
- `/` (Dashboard)
- `/login`, `/unauthorized`
- `/accounts`, `/taxonomy-admin`
- `/journal-entries`, `/journal-entries/new`, `/journal-entries/:id`
- `/reconciliations`, `/reconciliations/:id`
- `/close`, `/close/:id`, `/close/tasks/:id`, `/close/workpapers`, `/close/workpapers/:id`
- `/reports`, `/reports/:id`
- `/workflow`, `/issues`
- `/help`, `/admin`

### 4.2 Redirect Strategy

All old routes get a `<Navigate replace to={newRoute} />` entry in `AppRouter.tsx` so existing deep-links and bookmarks continue to work. These can be removed after one full sprint cycle.

---

## 5. Sprint Plan

### Sprint 3.1 — Navigation Shell ✅ Complete
**Scope:** Sidebar redesign only. No route changes. No page changes.
- New sidebar group structure with collapsible groups
- All 45+ pages wired into the new nav (no orphaned routes)
- Active state logic for group-level highlighting
- Persistent group collapse state (localStorage)
- Sidebar collapse (existing behavior) preserved

**Why first:** Every other sprint depends on the sidebar being correct. Route changes reference nav links; page layout breadcrumbs reference nav groups.

### Sprint 3.2 — Route Normalization ✅ Complete
**Scope:** New route tree under structured prefixes + legacy redirects. Nav links updated. Lightweight breadcrumbs added.
- New canonical routes under `/engagement/`, `/client-data/`, `/workbench/`, `/financial-impact/`, `/deliverables/`, `/setup/`
- `<Navigate replace>` redirects for every old static path
- Routes with query strings (`/pdf-import?batch=`, `/import/:id`) kept as direct routes  
- `nav.ts` updated to all new canonical paths
- `import-center` nav item gets `end: true` (prevents false active match on sub-import pages)
- `Breadcrumb` component added to PDFImportPage, AdjustmentBridgePage, FinancialStatementsPage, ReportBuilderPage
- 494 tests passing, TypeScript clean

**Legacy redirect details:** See `docs/tier3/SCREEN_MIGRATION_MATRIX.md` Sprint 3.2 section.

### Sprint 3.2 — Route Consolidation (original plan — merged into above)
**Scope:** Rename routes, add redirects, update all internal links and `useNavigate` calls.
- All route renames from §4.1
- `<Navigate>` redirects for every old path
- Update `AppRouter.tsx`
- Update all `Link`, `useNavigate`, `navToSource` calls in pages and API modules

### Sprint 3.3 — Client Data Workspace ✅ Complete
**Scope:** Transform Client Data from a routing namespace into a coherent workspace showing book readiness.

**New screen — `ClientDataPage` at `/client-data`:**
- Book Readiness Grid (6 cards: COA, Trial Balance, PDF, GL, Taxonomy, Documents)
- Issues Panel (5 clickable metric cards: unmapped accounts, out of balance, validation errors, awaiting mapping, missing period)
- Import Quick Access bar (5 import type buttons)
- Workbench Launch section — shows imported accounts count, doc count, readiness status; "Launch Adjustment Workbench" CTA button (disabled until all issues resolved)
- All readiness computed from existing `tbImportApi`, `pdfImportApi`, `coaImportApi`, `importRegistryApi` — no new backend endpoints

**ImportCenterPage enhancements:**
- 4-step pipeline banner added at top: Import Data → Map & Classify → Validate → Ready for Workbench
- Step indicators show live counts from existing stats (awaitingMapping, validationIssues, recentlyFinalized)
- Navigate to relevant workflow on step click

**nav.ts additions:**
- `client-data-hub` item added at top of client-data group pointing to `/client-data`

**Future note:** Tier 4 Advisor Data Cube will extend the book readiness model with multi-period, multi-entity, multi-scenario dimensions. The `ClientDataPage` readiness panel will become the entry point for cube configuration.

---

## Client Data Workspace

The `/client-data` section is the "source of truth" preparation layer before adjustments begin. It answers: **are the client books ready for advisor corrections?**

| Signal | Source | API |
|--------|--------|-----|
| COA Ready | `COAImportBatch.status === 'applied'` | `coaImportApi.list()` |
| Trial Balance Imported | `ImportBatch.status ∈ {posted, ready_to_post, mapping_required}` | `tbImportApi.listBatches()` |
| PDF Applied | `PDFImportBatch.status === 'applied'` | `pdfImportApi.list()` |
| Unmapped Accounts | `ImportBatch.unmapped_row_count` sum | `tbImportApi.listBatches()` |
| Out of Balance | debit−credit > 0.01 on any TB batch | `tbImportApi.listBatches()` |
| Document Count | `ImportRegistryEntry.document_id != null` | `importRegistryApi.list()` |

Workbench is enabled only when: COA applied, TB imported, 0 unmapped rows, 0 out-of-balance batches, 0 validation errors.

---

### Sprint 3.4 — Workspace Framework ✅ Complete
**Scope:** Reusable workspace layout primitives applied to all major workflow pages.

**New component library — `frontend/src/components/workspace/`:**
- `WorkspaceShell` — page wrapper with consistent flex column layout
- `WorkspaceHeader` — title + description + breadcrumbs + status + actions slots
- `WorkspaceContextBar` — read-only context pills (Entity from `useWorkspace()`, Period / Scenario / ReportingView as optional string props)
- `WorkspaceFilterBar` — horizontal filter control row
- `WorkspaceStatusBadge` — accounting workflow status badges (draft, ready, out_of_balance, mapped, validated, posted, needs_review, finalized, failed, pending, applied, mapping_required)
- `WorkspaceToolbar` — left/right action button row
- `WorkspaceEmptyState` — empty state with optional CTA action slot
- `WorkspaceBody` — scrollable padded content area
- `index.ts` — barrel exports

**`PageLayout` extended** with `contextBar?: ReactNode` slot (rendered between title row and children).

**Breadcrumbs added to pages missing them:**
- `JournalEntriesPage` — `Workbench > Journal Entries` + `WorkspaceContextBar`
- `DraftPreviewPage` — `Workbench > Draft Preview` + `WorkspaceContextBar` (title corrected from "Adjustment Bridge")
- `AdjustmentBridgePage` — `WorkspaceContextBar` added (breadcrumb already existed)
- `DocumentsPage` — `Client Data > Documents`
- `ChartOfAccountsPage` — `Client Data > Chart of Accounts`
- `TaxonomyAdminPage` — `Client Data > Taxonomy Mapping` (title normalized)

**Tests:** 37 new tests in `src/test/tier3_workspace.test.tsx` covering all 8 components.  
541 tests passing, TypeScript clean.

### Sprint 3.5 — Component Consolidation
**Scope:** Eliminate duplication identified in §2.3.
- `WorkspaceFilterBar` (entity + period + scenario row — used in 6+ pages)
- `SplitPanelLayout` (list + detail — used in reconciliations, close, workpapers)
- Extend `StatusBadge` to cover all status domains
- Migrate pages to use consolidated components

---

## 6. Success Criteria

| Criterion | Current | Target |
|-----------|---------|--------|
| Screens reachable from sidebar | ~33/45 | 45/45 |
| Nav items at top level (flat list) | 16 | 0 (all grouped) |
| Distinct nav groups | 2 (primary, admin) | 8 |
| Orphaned routes | 12+ | 0 |
| Import entry point routes | 5 (scattered) | 1 hub + 5 sub-routes |
| Pages using consistent PageShell | ~20 | 45 |
| Duplicate entity+period filter patterns | 6+ | 1 (WorkspaceFilterBar) |

---

## 7. Tier 4 — Advisor Data Cube (Future)

> **Note — not in scope for any Tier 3 sprint. Documented here for future planning only.**

After the navigation shell (3.1), route consolidation (3.2–3.3), and layout polish (3.4–3.5) are complete, the next architectural layer is the **Advisor Data Cube**: a multi-dimensional data model that allows the workbench to slice adjustments by entity, period, scenario, and fiscal year in a single unified query layer.

Key design decisions deferred to Tier 4:
- **Scenario management** — named scenarios (Baseline, Draft, Reviewed, Final) that version the full adjustment set
- **Cross-period comparatives** — the data model needs explicit period-over-period linkage (currently derived at query time)
- **Cube API** — a `/api/v1/cube/slice` endpoint that returns a pre-aggregated view by any combination of dimensions (replaces ad-hoc filtering on TB, FS, and comparative pages)
- **Segment dimension** — entity-level segmentation for multi-entity engagements (Tier 4 replaces the current `ConsolidationsPage` with a proper elimination engine)

Tier 4 depends on Tier 3 being complete because:
1. Stable routes are required for deep-linking into cube slices
2. The `WorkspaceFilterBar` (Sprint 3.5) becomes the Cube dimension picker in Tier 4
3. Breadcrumb trail in Sprint 3.4 must carry scenario context for Tier 4 scenario comparison views

---

## 8. Risk Register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Route renames break deep-links in Documents "go to source" | Medium | Implement redirects before removing old routes; update `navToSource` in Sprint 3.2 |
| Active state logic for nested routes misfires | Low | Test each group independently; use `useMatch` with `end: false` |
| Group collapse state interferes with existing sidebar collapse | Low | Separate localStorage keys; group state is independent of sidebar width state |
| TypeScript errors from renamed route constants | Medium | Create `ROUTES` constant object in Sprint 3.2; all links reference it |
