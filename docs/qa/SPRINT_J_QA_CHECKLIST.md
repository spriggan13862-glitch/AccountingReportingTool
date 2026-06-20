# Sprint J — Global Table Filter Framework QA Checklist
Last updated: 2026-06-19

## Acceptance Criteria
- [ ] FilterBar component renders correctly above COA table
- [ ] COA page: filter by account number (text contains)
- [ ] COA page: filter by account name (text contains)
- [ ] COA page: filter by account type (checklist: asset/liability/equity/revenue/cogs/expense)
- [ ] COA page: filter by normal balance (checklist: debit/credit)
- [ ] COA page: filter by mapping status (checklist: mapped/unmapped)
- [ ] COA page: filter by active status (checklist: active/inactive)
- [ ] COA filter bar shows "N filters active" count badge
- [ ] COA filter bar clear all button resets all filter bar filters
- [ ] Adjustment Workbench: filter bar renders above adjustment table
- [ ] Adjustment Workbench: filter by description (text contains)
- [ ] Adjustment Workbench: filter by status (checklist: draft/posted/reversed)
- [ ] Adjustment Workbench: filter by NI impact min/max
- [ ] Adjustment Workbench: filter by BS impact min/max
- [ ] Adjustment Workbench: filter by date range
- [ ] Adjustment Workbench: clear all resets all filter bar filters
- [ ] Adjustment Workbench: filtered count updates totals row correctly
- [ ] Checklist filter type available: clicking dropdown shows checkboxes
- [ ] Checklist filter: Select All selects every option
- [ ] Checklist filter: Clear deselects all options
- [ ] ColumnFilterMenu: checklist mode renders when filterType='checklist'
- [ ] ColumnFilterMenu: checklist selections propagate via onChecklistChange
- [ ] useGridState: columnFilterChecklists included in state
- [ ] useGridState: setColumnFilterChecklist updates state and resets page
- [ ] useGridState: clearFilters resets columnFilterChecklists
- [ ] useGridState: activeFilterCount includes checklist active count
- [ ] FilterBar component reusable: accepts filters array as props
- [ ] FilterBar: text filter input updates on change
- [ ] FilterBar: numeric-range renders min/max inputs with ${key}-min/${key}-max testids
- [ ] FilterBar: date-range renders from/to date inputs
- [ ] Backend GET /accounts/?account_type=asset returns only assets
- [ ] Backend GET /accounts/?active=true returns only active accounts
- [ ] Backend GET /accounts/?active=false returns only inactive accounts
- [ ] Backend GET /accounts/?search=cash returns matching accounts by name
- [ ] Backend GET /accounts/?search=1000 returns matching accounts by number
- [ ] AdjustmentBridgePage: skip noted in source comment (dynamic per-AJE columns)

## Data-testids Verified
- `coa-filter-bar` — FilterBar wrapper on ChartOfAccountsPage
- `coa-filter-account-number` — text input for account number
- `coa-filter-account-name` — text input for account name
- `coa-filter-account-type` — checklist dropdown for account type
- `coa-filter-clear` — clear all button for COA filter bar
- `coa-active-filter-count` — active filter count badge
- `adj-filter-bar` — FilterBar wrapper on AdjustmentWorkspacePage
- `adj-filter-description` — text input for description
- `adj-filter-status` — checklist dropdown for status
- `adj-filter-ni-impact-min` — NI impact minimum (from numeric-range, key=adj-filter-ni-impact)
- `adj-filter-ni-impact-max` — NI impact maximum
- `adj-filter-clear` — clear all button for adjustment filter bar
- `filter-active-count` — active count badge (inside FilterBar)

## Files Modified
- `frontend/src/components/data-grid/types.ts` — added filterType 'checklist', checklistValues, columnFilterChecklists
- `frontend/src/components/data-grid/useGridState.ts` — added setColumnFilterChecklist, checklist filtering logic
- `frontend/src/components/data-grid/ColumnFilterMenu.tsx` — added checklist UI mode
- `frontend/src/components/data-grid/FilterBar.tsx` — new reusable filter bar component
- `frontend/src/components/data-grid/index.ts` — export FilterBar
- `frontend/src/pages/ChartOfAccountsPage.tsx` — added FilterBar with 6 filter dimensions
- `frontend/src/pages/AdjustmentWorkspacePage.tsx` — added FilterBar with 5 filter dimensions
- `frontend/src/pages/AdjustmentBridgePage.tsx` — skip comment added
- `tests/test_accounts_filter_params.py` — backend filter param tests
- `frontend/src/test/filter_framework.test.tsx` — frontend component tests
