# File Impact Report
**Status:** Awaiting Approval  
**Produced:** 2026-06-11

Per-file breakdown of what changes in each Tier 3 sprint. Rated by impact: LOW (logic unchanged, text/style only), MEDIUM (structure changed, no API calls affected), HIGH (routing or data flow affected).

---

## Sprint 3.1 — Navigation Shell

Sprint 3.1 touches the sidebar and shell only. **No route paths change. No page components change.**

### Files Modified

| File | Change | Impact |
|------|--------|--------|
| `frontend/src/layouts/Sidebar.tsx` | Full rewrite — group-based nav structure, collapsible groups, active-state logic per group, 28 nav items across 8 groups | HIGH |
| `frontend/src/layouts/AppShell.tsx` | Minor — pass group collapse state down if needed; ensure Sidebar gets correct `location` for active state | LOW |

### Files Created

| File | Purpose |
|------|---------|
| `frontend/src/layouts/SidebarGroup.tsx` | Collapsible nav group component (label, icon, children, defaultOpen, persistKey) |
| `frontend/src/layouts/SidebarItem.tsx` | Single nav item (label, icon, to, exact match flag) |
| `frontend/src/config/nav.ts` | Nav configuration object — all groups, items, routes, icons, roles. Single source of truth. |

### Files NOT Changed in Sprint 3.1

- All 45 page files — untouched
- `AppRouter.tsx` — routes unchanged
- All API modules — unchanged
- All providers — unchanged
- All component files — unchanged

### Test Impact

- No existing Vitest tests reference the Sidebar component directly → 0 test failures expected
- Add new Sidebar tests: group renders, collapse/expand, active state, all 28 items render, admin-only item hidden from non-admin

---

## Sprint 3.2 — Route Consolidation

Sprint 3.2 changes route paths and updates every file that references them.

### Files Modified

| File | Change | Impact |
|------|--------|--------|
| `frontend/src/routes/AppRouter.tsx` | Add 15 renamed routes; add `<Navigate replace>` redirects for all old paths | HIGH |
| `frontend/src/config/nav.ts` | Update `to` values for renamed routes (created in 3.1) | MEDIUM |
| `frontend/src/layouts/Sidebar.tsx` | Update route references (driven by nav.ts) | LOW |
| `frontend/src/pages/DashboardPage.tsx` | Update QuickLinks `href` values (entities, periods, imports, FS, etc.) | MEDIUM |
| `frontend/src/pages/DocumentsPage.tsx` | Update `navToSource()` map — PDF import, COA import paths change | HIGH |
| `frontend/src/pages/ImportCenterPage.tsx` | Update card `navigate()` calls — `/import/new` → `/imports` | MEDIUM |
| `frontend/src/pages/EntitiesPage.tsx` | Update any internal navigation | LOW |
| `frontend/src/pages/PeriodsPage.tsx` | Update link to period detail `/periods/:id` → `/settings/periods/:id` | LOW |
| `frontend/src/pages/CloseDashboardPage.tsx` | Update checklist links (routes already under `/close/` — no change needed) | LOW |
| `frontend/src/pages/ChartOfAccountsPage.tsx` | Update COA import link `/coa-import` → `/imports/coa` | LOW |
| `frontend/src/pages/FinancialStatementsPage.tsx` | Update Setup Assistant action buttons (routes to entities, periods, imports) | MEDIUM |
| `frontend/src/pages/TaxonomyAdminPage.tsx` | Any internal nav to COA or imports | LOW |
| `frontend/src/pages/PDFImportPage.tsx` | Deep-link `?batch=` query param logic unchanged; `navToSource` may reference this | LOW |

### Files NOT Changed in Sprint 3.2

- All API modules — backend routes are unchanged; only frontend navigation routes change
- All backend files — unaffected; this is frontend routing only
- All providers — unaffected
- Most page files — only those with hardcoded `navigate()` or `Link` calls to renamed routes

---

## Sprint 3.3 — Import Hub Consolidation

### Files Modified

| File | Change | Impact |
|------|--------|--------|
| `frontend/src/routes/AppRouter.tsx` | Remove `ImportWizardPage` route; point `/imports/new` redirect to `/imports` | MEDIUM |
| `frontend/src/pages/ImportCenterPage.tsx` | Absorb ImportWizardPage flow OR confirm it's already the entry point | MEDIUM |

### Files Deleted (candidates)

| File | Reason | Route replacement |
|------|--------|-------------------|
| `frontend/src/pages/ImportWizardPage.tsx` | Import Center already serves this purpose | `<Navigate to="/imports" />` |

### Files Kept (assessment)

| File | Assessment |
|------|------------|
| `frontend/src/pages/TrialBalanceImportPage.tsx` | Keep — distinct 4-step flow; route stays at `/imports/trial-balance` |
| `frontend/src/pages/GeneralLedgerImportPage.tsx` | Keep — distinct 4-step flow; route stays at `/imports/general-ledger` |
| `frontend/src/pages/JournalEntryImportPage.tsx` | Keep — distinct flow; route stays at `/imports/journal-entries` |

---

## Sprint 3.4 — Page Layout System

### Files Created

| File | Purpose |
|------|---------|
| `frontend/src/components/ui/PageShell.tsx` | Page wrapper: PageHeader + content area |
| `frontend/src/components/ui/PageHeader.tsx` | Title, breadcrumb trail, action button slot |
| `frontend/src/components/ui/Breadcrumb.tsx` | Auto-breadcrumb from nav config (if not exists already) |

### Files Modified (all 45 pages audited)

High-churn pages (significant layout changes expected):

| File | Current Layout Issue |
|------|---------------------|
| `frontend/src/pages/DashboardPage.tsx` | Custom header, not using PageLayout consistently |
| `frontend/src/pages/CloseDashboardPage.tsx` | No breadcrumb, no back nav |
| `frontend/src/pages/CloseChecklistPage.tsx` | No breadcrumb trail (Close > Checklist) |
| `frontend/src/pages/CloseTaskDetailPage.tsx` | No breadcrumb (Close > Checklist > Task) |
| `frontend/src/pages/WorkpaperDetailPage.tsx` | No breadcrumb |
| `frontend/src/pages/ReconciliationDetailPage.tsx` | No breadcrumb |
| `frontend/src/pages/ReportDetailPage.tsx` | No breadcrumb |
| `frontend/src/pages/PeriodDetailPage.tsx` | No breadcrumb |
| `frontend/src/pages/JournalEntryDetailPage.tsx` | No breadcrumb |

Low-churn pages (minor padding/layout normalisation):

| File | Change |
|------|--------|
| All remaining pages | Wrap in `<PageShell>` if not already; verify consistent padding |

---

## Sprint 3.5 — Component Consolidation

### Files Created

| File | Replaces |
|------|---------|
| `frontend/src/components/ui/WorkspaceFilterBar.tsx` | Ad-hoc entity+period+scenario combos in 6+ pages |
| `frontend/src/components/ui/SplitPanelLayout.tsx` | Duplicated list+detail two-panel layout |

### Files Modified (pages migrated to shared components)

| File | Change |
|------|--------|
| `frontend/src/pages/TrialBalancesPage.tsx` | Use `WorkspaceFilterBar` |
| `frontend/src/pages/FinancialStatementsPage.tsx` | Use `WorkspaceFilterBar` |
| `frontend/src/pages/ComparativeFinancialsPage.tsx` | Use `WorkspaceFilterBar` |
| `frontend/src/pages/VarianceAnalysisPage.tsx` | Use `WorkspaceFilterBar` |
| `frontend/src/pages/JournalEntryCreatePage.tsx` | Use `WorkspaceFilterBar` |
| `frontend/src/pages/AdjustmentBridgePage.tsx` | Entity select normalization |
| `frontend/src/pages/ReconciliationPage.tsx` | Use `SplitPanelLayout` |
| `frontend/src/pages/CloseDashboardPage.tsx` | Use `SplitPanelLayout` |
| `frontend/src/pages/WorkpaperCenterPage.tsx` | Use `SplitPanelLayout` |
| `frontend/src/pages/ReportsPage.tsx` | Use `SplitPanelLayout` |

---

## Full File Change Summary (All Sprints)

### Backend Files

**Zero backend files change in Tier 3.** All route renames are frontend-only (React Router). The backend API paths (`/api/v1/...`) are unchanged throughout.

### Frontend Files

| Category | Files Changed | Files Created | Files Deleted |
|----------|--------------|---------------|---------------|
| Sprint 3.1 (Nav) | 2 | 3 | 0 |
| Sprint 3.2 (Routes) | ~14 | 0 | 0 |
| Sprint 3.3 (Import Hub) | 2 | 0 | 1 |
| Sprint 3.4 (Page Layout) | ~25 | 3 | 0 |
| Sprint 3.5 (Components) | ~10 | 2 | 0 |
| **Total** | **~53** | **8** | **1** |

### Risk by Sprint

| Sprint | Risk | Notes |
|--------|------|-------|
| 3.1 | Low | No routes or pages change |
| 3.2 | Medium | Route renames must be exhaustive — any missed `navigate()` call creates a dead link |
| 3.3 | Low | Only one page deleted; all flows preserved via redirect |
| 3.4 | Medium | Touching 25+ pages; visual regressions possible |
| 3.5 | Medium | Shared components must be prop-compatible with all consuming pages |

---

## Testing Requirements

### Sprint 3.1
- Vitest: New `sidebar.test.tsx` — all 28 nav items render, groups collapse/expand, active state, admin item gated by role
- Manual: Verify all groups visible; collapse persists across page refresh

### Sprint 3.2
- Vitest: Update `routing.test.tsx` — all 15 renamed routes resolve; all old routes redirect correctly
- Manual: Click every nav item; verify URL, verify page loads

### Sprint 3.3
- Vitest: Verify `/import/new` redirects to `/imports`
- Manual: Full import flow from Import Center for each import type

### Sprint 3.4
- Vitest: No logic changes — visual regression tests only if Playwright E2E covers it
- Manual: Check breadcrumbs on every multi-level page

### Sprint 3.5
- Vitest: Unit tests for `WorkspaceFilterBar` and `SplitPanelLayout`
- Manual: Verify consuming pages render correctly with shared components
