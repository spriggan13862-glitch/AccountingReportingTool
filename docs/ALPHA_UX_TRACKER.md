# Alpha UX Tracker

---

## E2E Shadow Testing Issues

This section tracks failures surfaced by the Playwright shadow-testing suite (`frontend/e2e/`).
Each entry records the test file, route, failing action, expected vs. actual behavior, root cause, and fix required.
Issues are **not marked resolved until the corresponding E2E test passes**.

### Last Run

| Date | Suite | Passed | Failed | Total |
|---|---|---|---|---|
| 2026-05-22 | `workflow.spec.ts` | 38 | 0 | 38 |
| 2026-05-22 | `accounting.spec.ts` | 22 | 0 | 22 |
| 2026-05-22 | `shadow.spec.ts` | 17 | 0 | 17 |
| 2026-05-22 | `smoke.spec.ts` | 2 | 5 | 7 |
| 2026-05-22 | Python unit tests | 578 | 0 | 578 |
| 2026-05-22 | Frontend vitest | 283 | 0 | 283 |

### E2E Failures

| ID | Test File | Test Name | Route / Page | Failing Action | Expected Behavior | Actual Behavior | Root Cause | Console / Network Error | Screenshot | Priority | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E2E-ST-001 | `smoke.spec.ts:99` | `Login flow › shows login form` | `/login` | `getByRole('heading', { name: /sign in/i })` — checks for h1 heading matching "sign in" | Heading with "Sign in" is visible | Not found — element(s) not found after 5 s | **Test assertion bug.** `LoginPage` renders `<h1>Accounting Tool</h1>` and `<p>Sign in to your account</p>`. The h1 role never matches `/sign in/i`. | No console or network error; page rendered correctly. | `test-results/smoke-Login-flow-shows-login-form-chromium/error-context.md` | Low | Open |
| E2E-ST-002 | `smoke.spec.ts:110` | `Login flow › successful login redirects to dashboard` | `/login → /` | Click Sign in with valid credentials, expect URL to become `/` or `/dashboard` | URL becomes `http://localhost:5173/` | URL stays `http://localhost:5173/login` after 5 s (13 polls) | **Test mock timing / route ordering bug.** The smoke mock re-registers `/me` to return 200 *after* `.click()`, but `login()` calls `getMe()` synchronously during the same microtask chain. By the time the `page.route()` re-registration runs, the `getMe()` XHR has already fired against the still-active 401 override, receiving 401, triggering `clearAuth()`, and throwing. Login handler sets form error state; navigate never fires. | Axios 401 on `/api/v1/auth/me` during login sequence. | `test-results/smoke-Login-flow-successful-login-redirects-to-dashboard-chromium/error-context.md` | Medium | Open |
| E2E-ST-003 | `smoke.spec.ts:128` | `Login flow › shows error on invalid credentials` | `/login` | Submit invalid credentials, expect text `/invalid credentials/i` to appear | Error message "Invalid credentials" shown in form | Element not found after 5 s | **Test mock bug.** The `route.fulfill({ status: 401, body: '...' })` call omits `contentType: 'application/json'`. Axios receives the body as a plain string and cannot parse `data.detail`. The error falls back to `error.message = "Request failed with status code 401"`, not "Invalid credentials". The form renders that fallback string instead. | No network error. XHR returns 401 as expected. | `test-results/smoke-Login-flow-shows-error-on-invalid-credentials-chromium/error-context.md` | Medium | Open |
| E2E-ST-004 | `smoke.spec.ts:150` | `Dashboard › shows dashboard with quick links` | `/` | `getByText(/quick links/i)` — expects Quick Links section to be visible | Dashboard renders `QuickLinks` component (h2 "Quick Links") | Login page rendered instead (`<h1>Accounting Tool</h1>`). Element not found after 5 s. | **Test mock route ordering bug (same as shadow spec had before fix).** `smoke.spec.ts` registers its catch-all `**/api/v1/**` *last*, giving it highest Playwright priority. The catch-all calls `route.continue()` for URLs containing `/auth/`. This forwards the `/api/v1/auth/me` request to the real network; since no backend is running, the request fails. `AuthProvider` catches the error, calls `clearAuth()`, sets `user = null`, `isAuthenticated = false`. `ProtectedRoute` redirects `/` to `/login`. Dashboard never renders. | `ERR_CONNECTION_REFUSED` on `http://localhost:5173/api/v1/auth/me` (network-level failure via proxy). | `test-results/smoke-Dashboard-shows-dashboard-with-quick-links-chromium/error-context.md` | High | Open |
| E2E-ST-005 | `smoke.spec.ts:158` | `Dashboard › shows demo banner for Acme org` | `/` | `getByText(/demo environment/i)` — expects a "demo environment" banner | Demo environment banner visible | Element not found; same redirect-to-login failure as E2E-ST-004. Secondary issue: even if auth worked, `DashboardPage` no longer contains any "demo environment" text — the banner was removed in a prior milestone. | **Two bugs:** (1) same route ordering / `route.continue()` bug as E2E-ST-004 causing auth failure; (2) **stale test assertion** — the "demo environment" banner no longer exists in `DashboardPage.tsx`. | Same as E2E-ST-004. | `test-results/smoke-Dashboard-shows-demo-banner-for-Acme-org-chromium/error-context.md` | Low | Open |

### Required Fixes for `smoke.spec.ts`

All five failures are **test infrastructure bugs**, not app bugs. The following changes will resolve them:

1. **E2E-ST-001** — Change login heading assertion from `getByRole('heading', { name: /sign in/i })` to `getByRole('heading', { name: /accounting tool/i })`. Alternatively check for the `<p>` text `"Sign in to your account"`.
2. **E2E-ST-002** — Remove the post-click `page.route()` re-registration timing pattern. Register the catch-all route *first* (so specific handlers take priority), keep `/me` returning `MOCK_USER` unconditionally. Use no pre-set token and no token-in-sessionStorage; navigate directly to `/login` — `AuthProvider` skips the initial `/me` call when no token exists, allowing the post-login `getMe()` to return the user correctly.
3. **E2E-ST-003** — Add `contentType: 'application/json'` to all `route.fulfill()` error responses so axios parses `data.detail` correctly.
4. **E2E-ST-004 / E2E-ST-005** — Refactor `mockBackend()` in `smoke.spec.ts` to register the catch-all `**/api/v1/**` *first* with a plain `route.fulfill({ status: 200, body: '[]' })` (no `route.continue()`). Then register specific handlers for `/me`, `/login`, `/organizations/`, `/setup/` *after* the catch-all so they take priority. Replace the "demo environment" assertion with a check for `"Quick Links"` or `"Overview for Acme Manufacturing Co."`.

> **Reference implementation:** `frontend/e2e/shadow.spec.ts` uses this corrected pattern and all 17 tests pass.

---

## Accounting Correctness Shadow Testing (2026-05-22)

Validated using Live Marketing LLC fixtures (`live_marketing_coa.csv`, `live_marketing_tb.csv`) against the taxonomy reporting service.
All tests written in `tests/test_accounting_correctness.py` (64 Python tests) and `frontend/src/test/accounting_shadow.test.tsx` (28 vitest tests).

### Bugs Found and Fixed

| ID | Area | Bug | Root Cause | Fix Applied | Test Coverage |
|---|---|---|---|---|---|
| AC-001 | Taxonomy Mapping | `Accumulated Amortization` (1701, asset type) mapped to `depreciation_amort` (income statement) instead of `intangible_assets` (balance sheet) | `"amortization"` keyword in `ACCOUNT_NAME_KEYWORDS` matched before `"accumulated amort"` could be checked | Added `("accumulated amort", "intangible_assets")` before `("amortization", ...)` in keyword list | `test_1701_accum_amortization_maps_to_intangible_assets` |
| AC-002 | Taxonomy Mapping | `Depreciation Expense` with generic `"expense"` type mapped to `operating_expenses` instead of `depreciation_amort` | Step 3 of `get_suggested_taxonomy_code` returned immediately for `"expense"` type without checking name keywords | Added `_GENERAL_TYPE_CODES` set; general types now fall through to name keyword checks | `test_6400_02_depreciation_expense_maps_correctly` |
| AC-003 | Taxonomy Mapping | `Interest Expense` with generic `"expense"` type mapped to `operating_expenses` instead of `interest_expense` | Same as AC-002 | Same as AC-002 | `test_6400_05_interest_expense_maps_correctly` |
| AC-004 | Taxonomy Mapping | `Retained Earnings` with `"equity"` type mapped to `other_equity` instead of `retained_earnings` | `"equity"` type fell through to `other_equity` without checking `"retained earnings"` name keyword | Added `"equity"` to `_GENERAL_TYPE_CODES` | `test_3200_retained_earnings_maps_correctly` |
| AC-005 | Taxonomy Mapping | `"revenue"` type (Format-C COA import) not in `QB_TYPE_TO_TAXONOMY` — revenue accounts got no taxonomy assignment | `QB_TYPE_TO_TAXONOMY` only had `"income"` → `revenue`, not `"revenue"` → `revenue` | Added `"revenue": "revenue"` to both `QB_TYPE_TO_TAXONOMY` and `QB_TYPE_MAP` | `test_4000_revenue_accounts_map_to_revenue` |
| AC-006 | Taxonomy Mapping | `LOC - Aegis Business Credit` (liability) not recognized as short-term debt | `"loc -"` abbreviation not in name keyword list | Added `("loc -", "short_term_debt")` keyword | `test_2101_loc_maps_to_short_term_debt` |
| AC-007 | Taxonomy Mapping | `Other Current Liabilities` account name not recognized without authoritative QB type | `"other current liab"` not in name keyword list | Added `("other current liab", "other_current_liabilities")` keyword | `test_2520_other_current_liabilities` |

### Known Limitations (Not Bugs)

| ID | Area | Limitation | Impact | Suggested Workaround |
|---|---|---|---|---|
| AC-LIM-001 | COA Import / COGS | 5000-series COGS accounts in `live_marketing_coa.csv` use generic `"expense"` type. `"Paper and Stock"`, `"Printing and Digital Services"`, etc. map to `operating_expenses` instead of `cogs`. | Gross Profit is understated; COGS appears in Operating Expenses section | Re-export COA from QuickBooks with `"Cost of Goods Sold"` type, or manually reclassify 5000-series in Chart of Accounts page |
| AC-LIM-002 | Taxonomy Hierarchy | Standard taxonomy has no parent-child hierarchy (all 27 lines at depth=0). Full hierarchy support (e.g., `cash_equivalents` as child of `current_assets`) would require user-defined sub-lines | No rollup within BS sections; each line stands alone | Future: support user-defined taxonomy hierarchy with sub-lines |
| AC-LIM-003 | Net Income subtotal | No Net Income subtotal line in the standard taxonomy (only Gross Profit). Net Income = Revenue - All Expenses is not auto-computed | Income statement has no bottom-line total | Future: add `net_income` subtotal line to STANDARD_TAXONOMY_V2 |

### Validated Accounting Invariants (All Passing)

- **Rollup math**: parent totals correctly aggregate child balances; contra-assets (Acc.Depr.) reduce P&E total
- **Sign conventions**: credit-normal lines (liabilities, equity, revenue) sign_flip=True; debit-normal (assets, expenses) sign_flip=False
- **Gross Profit**: `is_subtotal=True`, `normal_balance="credit"`, sort_order=799 (after COGS=700)
- **BS order**: Assets (sort 100-220) < Liabilities (300-410) < Equity (500-520)
- **IS order**: Revenue (600) < COGS (700-799) < Expenses (800-920)
- **Hierarchy depth**: root=0, child=1, grandchild=2; all 27 standard lines are root-level
- **Taxonomy codes**: all unique; statement_type matches section category
- **Inheritance**: `propagate_taxonomy_to_children` walks parent chain and assigns nearest ancestor's taxonomy_line_id
- **Cycle guard**: `_rollup` handles circular parent references without infinite recursion

---

## Tracker Rules

- This file is the source of truth for alpha usability and workflow issues.
- Add new issues immediately when discovered during testing.
- Update status when fixed.
- Reference issue IDs in milestone summaries and commits.
- Do not remove issues; move them to Resolved when complete.
- If partially fixed, keep status as Partial.

## Status Definitions

| Status | Meaning |
|---|---|
| Open | Not started |
| Partial | Some work completed, more required |
| In Progress | Actively being addressed |
| Blocked | Cannot proceed due to dependency |
| Resolved | Fixed, tested, and confirmed |
| Deferred | Intentionally postponed |

## Priority Definitions

| Priority | Meaning |
|---|---|
| Critical | Blocks alpha testing or core accounting workflow |
| High | Significant usability/accounting workflow issue |
| Medium | Important polish or workflow improvement |
| Low | Nice-to-have or future refinement |

## Open Issues

| ID | Area | Issue | Evidence / Observation | Priority | Status | Target Milestone | Suggested Fix |
|---|---|---|---|---|---|---|---|
| UX-014 | Entity Selector / Import Wizard | Import Wizard entity dropdown shows no entities. | Wizard showed "Select Entity" but no options. | Critical | Resolved | M29/M31 | Fixed in M29 (CORS/proxy). Import Wizard now uses entities from API. |
| UX-015 | Entities Page / Network Error | Entities page shows network error. | Browser showed failed entities API request. | Critical | Resolved | M29 | Fixed in M29 (Vite proxy + CORS). |
| UX-016 | Draft Preview / Network Error | Draft Preview calculation returns network error. | User saw network error on draft preview. | Critical | Resolved | M29 | Fixed in M29 (proxy setup). |
| UX-018 | Help Center / Templates | Help Center lacks downloadable TB/mapping templates with sample data. | User could not find templates for upload or mapping formats. | Critical | Resolved | M31 | Added 4 downloadable CSV templates (debit/credit, signed, combined, mapping) in Import Center format guidance. |
| UX-019 | Entity Setup Validation | Fiscal Year End and FY Convention are optional but should be required. | Entity form allowed blanks. | High | Resolved | M31 | Made required in EntityCreate Pydantic schema; EntityForm shows required markers, amber highlights, and missing-field validation. |
| UX-020 | Trial Balance Upload / Network Error | Uploading trial balance produces network error. | Browser showed upload request failing. | Critical | Resolved | M29 | Fixed in M29 (proxy/CORS/multipart). |
| UX-021 | Entity Creation / Network Error | Entity create/manage produces network error. | Create Entity form showed Network Error. | Critical | Resolved | M29 | Fixed in M29 (proxy). |
| UX-022 | Onboarding Progress / Entity Creation | Creating entity does not return user to setup flow or mark entity step complete. | User created Live Marketing / LM but Getting Started did not update. | Critical | Resolved | M31 | EntitiesPage mutations now invalidate onboarding-status query; SetupWizardPage URL fixed to /api/v1/. |
| UX-023 | Import Entity Dropdown | Newly-created entity does not appear in Import Center dropdown. | Live Marketing / LM not available in import dropdown. | Critical | Resolved | M31 | Entity list query uses TanStack Query with invalidation after mutations; entities appear after creation. |
| UX-024 | Import Entity Selector | Entity selector only accepts numeric IDs, not code/name. | User could not type/select LM. | High | Resolved | M31 | ImportCenterPage replaced number input with EntitySelect (searchable by code/name). |
| UX-025 | Upload Preview Not Displayed | Upload did not show expected preview of columns/data. | No preview of uploaded file columns/data shown. | Critical | Resolved | M29 | Import Wizard detect step shows sheet/column preview before upload. |
| UX-026 | Import Format Validation | Import did not show clear format warnings/errors. | No errors shown for possible wrong format. | Critical | Resolved | M31 | ImportCenterPage format guidance expanded with accepted formats, column patterns, and 4 download templates. |
| UX-027 | XLSX Upload Support Clarity | User unsure if XLSX is accepted. | UI did not clearly explain CSV/XLSX support. | High | Resolved | M31 | Drop zone and format guidance clearly state CSV/XLSX/QBO/NetSuite/Sage. |
| UX-028 | Account Name Parsing | Account name was not imported separately. | Source account showed combined account/name instead of separate fields. | Critical | Resolved | M31 | ImportReviewPage Lines tab now shows "Source Acct #" and "Source Acct Name" as separate columns. |
| UX-029 | Validation Issue Export | Import Center lacks export for validation issues. | User requested export of validation issues. | Medium | Resolved | M31 | Added Export Issues CSV button to ImportReviewPage Validation Issues tab. |
| UX-030 | Mapping Workbench Horizontal Usability | Mapping Workbench cannot scroll right / right-side fields inaccessible. | Table cut off and not usable horizontally. | Critical | Resolved | M31 | Added overflow-x-auto to MappingWorkbenchPage table wrapper. |
| UX-031 | Mapping Concept Clarity | User does not understand mapping hierarchy. | User unsure whether source accounts map to accounts or FS lines. | Critical | Resolved | M31 | Added mapping explanation banner: Source Account → Entity COA Account → Reporting Line. |
| UX-032 | Show Mapped Filter | Show mapped toggle does not filter mapped accounts correctly. | Toggle did not behave as expected. | High | Resolved | M31 | Toggle label updated to "Show all (including mapped)"; default shows only unmapped. |
| UX-033 | Suggestion Visibility | Suggestions are not visible before accepting. | UI says accept suggestions but user cannot inspect them. | Critical | Resolved | M30 | MappingWorkbench shows suggestion chip with account number/name per row with Accept button. |
| UX-034 | Export Mappings Endpoint | Export mappings returns `{detail: "Not Found"}`. | User clicked export mappings and got Not Found. | Critical | Resolved | M31 | Fixed double-prefixed URL bug in handleExportMappings; now uses direct API path. |
| UX-035 | COA Location / Setup Clarity | Platform chart of accounts location/setup is unclear. | User asked where platform COA is and how it is setup. | Critical | Resolved | M32 | ChartOfAccountsPage at /accounts with entity-specific COA tree view; sidebar nav item added. |
| UX-036 | Entity-Specific COA | COA should differ by entity. | User noted each entity may have a different COA. | Critical | Resolved | M32 | Accounts are entity-scoped (entity_id FK); /accounts?entity=N shows per-entity tree. |
| UX-037 | Reporting Taxonomy Clarity | Common reporting structure is unclear. | User asked how common reporting structure is determined/preset. | Critical | Resolved | M32 | ReportingTaxonomyLine model seeded with 27 standard lines; auto-mapped on COA import; editable in ChartOfAccountsPage. |
| UX-038 | QuickBooks-Style Account Types | Account setup should use account type/detail type dropdowns similar to QuickBooks. | User asked whether asset/liability/etc. should be selected like QuickBooks. | Critical | Resolved | M32 | COA import auto-detects QB account type/detail type; inline editing of detail_type in ChartOfAccountsPage. |

## Resolved Issues

| ID | Area | Issue | Resolution | Resolved In | Evidence |
|---|---|---|---|---|---|
| UX-014 | Import Wizard Entity Dropdown | Wizard showed no entities | M29 proxy/CORS fix; M31 EntitySelect in wizard | M29/M31 | entities API functional |
| UX-015 | Entities Page Network Error | Page failed to load entities | M29 Vite proxy and CORS config | M29 | entities page functional |
| UX-016 | Draft Preview Network Error | Preview returned network error | M29 proxy setup | M29 | draft preview functional |
| UX-018 | Import Templates | No downloadable templates | Added 4 CSV templates (A/B/C/D) with client-side download in ImportCenterPage | M31 | Download buttons in format guidance panel |
| UX-019 | Entity Required Fields | FY End/Convention optional | Made required in EntityCreate schema; form validation UI added | M31 | test_m31_entity.py passes 422 |
| UX-020 | TB Upload Network Error | Upload failed | M29 proxy/CORS/multipart fix | M29 | upload functional |
| UX-021 | Entity Creation Network Error | Create form failed | M29 proxy fix | M29 | entity creation functional |
| UX-022 | Onboarding Progress | Entity creation didn't update Getting Started | Invalidate onboarding-status query after mutations; SetupWizardPage URL fixed | M31 | Progress bar updates after entity create |
| UX-023 | Import Entity Dropdown Stale | New entity not in dropdown | TanStack Query invalidation on entity mutations | M31 | EntitySelect queries fresh on mount |
| UX-024 | Import Numeric Entity Input | Entity selector was number input | Replaced with EntitySelect component (searchable) | M31 | ImportCenterPage uses EntitySelect |
| UX-025 | Upload Preview | No column/sheet preview | Import Wizard detect step added in M29 | M29 | Preview tab functional |
| UX-026 | Import Format Guidance | No format warnings | Expanded format guidance with accepted formats, auto-detected patterns, templates | M31 | Format help panel in ImportCenterPage |
| UX-027 | XLSX Support Clarity | UI unclear on formats | Drop zone and format guidance list CSV/XLSX/QBO/NetSuite/Sage | M31 | Text update in ImportCenterPage |
| UX-028 | Account Name Parsing Display | Combined account column | Lines tab split into "Source Acct #" and "Source Acct Name" columns | M31 | ImportReviewPage table header |
| UX-029 | Validation Issue Export | No export button | Export Issues CSV button added to Validation Issues tab | M31 | Button in ImportReviewPage issues tab |
| UX-030 | Mapping Workbench Scroll | Table not scrollable | overflow-x-auto added to table wrapper | M31 | MappingWorkbenchPage table div |
| UX-031 | Mapping Concept Clarity | Mapping hierarchy unclear | Explanation banner: Source Account → COA Account → Reporting Line | M31 | Banner above toolbar in MappingWorkbenchPage |
| UX-032 | Show Mapped Toggle | Toggle label confusing | Label updated to "Show all (including mapped)" | M31 | Toggle label in MappingWorkbenchPage |
| UX-033 | Suggestion Visibility | Suggestions not inspectable | Per-row suggestion chip with account # and name + Accept button | M30 | MappingWorkbenchPage suggestion chip |
| UX-034 | Export Mappings URL | Export returned 404 | Fixed double /api prefix bug in handleExportMappings | M31 | window.open(url) direct |
| UX-035 | COA Location / Setup Clarity | COA location unclear | ChartOfAccountsPage at /accounts; "Chart of Accounts" nav item in Setup group | M32 | Sidebar + /accounts route |
| UX-036 | Entity-Specific COA | COA not per-entity | entity_id FK on accounts; /accounts?entity=N tree view | M32 | accountsApi.tree(entityId) |
| UX-037 | Reporting Taxonomy Clarity | Taxonomy unclear | 27 seeded standard taxonomy lines; auto-mapped on import; editable inline | M32 | reportingTaxonomyApi + ChartOfAccountsPage |
| UX-038 | QB-Style Account Types | Account type/detail type missing | QB type/detail type auto-detected; inline edit in ChartOfAccountsPage | M32 | coa_import_service QB_TYPE_MAP |

| UX-039 | COA Preview / Filter Chips | Classification chips in COA review step are not clickable — no filter behavior. | Chips were `<span>` elements with no click handler or state. | Critical | Resolved | M33 | Chips converted to `<button>` with `typeFilter` state; clicking filters preview table; clicking again clears. Count shows filtered total. |
| UX-040 | COA Import / FSLI Mapping | QB Tax Line column not driving Reporting/FSLI mapping — detail type used instead. | Tax Line data available but not used; detail_type-only lookup produced wrong FSLI assignments. | Critical | Resolved | M33 | `TAX_LINE_TO_TAXONOMY` (70+ entries) added to taxonomy service; `get_suggested_taxonomy_code()` prefers tax_line over detail_type; `apply_coa_import` uses tax_line→detail_type priority + user override. Preview shows QB Tax Line and Suggested Reporting Line columns with inline override select. |
| UX-041 | COA / Create Account | No way to add a new account to the entity COA without re-importing. | ChartOfAccountsPage had no create workflow. | High | Resolved | M33 | "Create Account" button added to ChartOfAccountsPage; `CreateAccountModal` with QB-style account type selector (7 main + 9 other types), detail type dropdown, parent account, reporting line, description, tax line, active toggle. |
| UX-042 | COA / QB Account Creation UX | Account type selection not QB-style (no categories, no help text). | Account type was a raw text input with no guidance. | High | Resolved | M33 | `CreateAccountModal` uses a 4-column grid of labeled buttons (Bank, Credit Card, Income, Expense, Fixed Asset, Loan/LT Liability, Equity + 9 other types). Selecting a type shows contextual help text and pre-populates detail type options. |
| UX-043 | COA Import / FSLI Evidence Hierarchy | Fixed Asset accounts assigned wrong FSLI when tax line was deductions-type (e.g. Depreciation). | Tax line was overriding authoritative QB type. | Critical | Resolved | M34 | Added `AUTHORITATIVE_QB_TYPES` (Fixed Asset, AR, AP, COGS, Credit Card) that unconditionally override tax line. `BAD_TAX_LINE_PATTERNS` skip obsolete/n/a tax lines. Evidence hierarchy: Auth Type → Tax Line (if valid) → QB Type → Detail Type → Name Keywords. |
| UX-044 | COA Import / Source Evidence Transparency | No way to see why a reporting line was assigned to an account. | Users had to guess whether the suggestion came from the tax line, detail type, or something else. | High | Resolved | M34 | `source_evidence` field added to preview rows. Evidence column in preview table shows e.g. "Tax Line = B/S-Assets: Cash" or "Type = Fixed Assets". Help icon on Reporting Line header explains the priority chain. |
| UX-045 | COA Import / Unassigned Filter | No way to find accounts that were not assigned a reporting line. | Accounts with null `suggested_reporting_line` blended in with assigned accounts; user had to scroll the whole list. | High | Resolved | M34 | Amber "Unassigned · N" chip added to filter chips row; clicking shows only unassigned accounts; clicking again clears. |
| UX-046 | COA Import / Preview Filtering | Preview table could not be searched or filtered by reporting line. | Table had only type chips; searching required manual scrolling. | High | Resolved | M34 | Global search input (name, number, detail type, tax line) and reporting-line filter dropdown added to preview toolbar. All filters composable with type chip and unassigned chip. |
| UX-047 | COA Import / Parent Account Visibility | Child accounts had no visible link to their parent in the preview. | Account number grouping (4000-01 → 4000) and indent-based parents were computed but not shown. | High | Resolved | M34 | `parent_account_number`, `parent_account_name`, `hierarchy_depth` added to preview rows and schema. Parent Account column shown in preview table; indentation now driven by hierarchy_depth. `_find_parent_by_account_number()` handles dash-separated, dot-separated, and numeric-truncation patterns. |
| UX-048 | COA / Parent Account Edit | No way to change parent account of an existing account inline. | ChartOfAccountsPage edit mode only exposed detail type, status, and reporting line. | Medium | Resolved | M34 | Parent selector added to inline edit row in ChartOfAccountsPage — lists all entity accounts (excluding self); PATCH sends `parent_account_id`; Parent column added to COA table header. |
| UX-049 | Taxonomy / No Admin UI | Reporting taxonomy was seeded but not editable in the UI. | No page existed for taxonomy CRUD, import/export, or view management. | High | Resolved | M35 | `TaxonomyAdminPage` (`/taxonomy-admin`) added: tree table with expandable rows, inline edit, create modal, CSV export/import with preview→apply, reseed, and ReportingViewsPanel (create/clone/delete/set-default). |
| UX-050 | Taxonomy / CSV Import | No way to bulk-load or template the taxonomy. | No import endpoint existed; structure was only set by seed. | High | Resolved | M35 | `POST /reporting-taxonomy/import/preview` + `POST /reporting-taxonomy/import/apply` added. Two-pass apply (create first, link parents second) with circular hierarchy check. `GET /reporting-taxonomy/export.csv` provides round-trippable template. |
| UX-051 | Reporting Views | No named views (GAAP, Management, SBA, etc.) to drive different report presentations. | `ReportingTaxonomyView` model and endpoints did not exist. | High | Resolved | M35 | `ReportingTaxonomyView` model + `/reporting-views/` CRUD added. 5 system views seeded (GAAP, Management, SBA Lender, QoE, Tax Basis). Views panel in TaxonomyAdminPage supports create, clone, delete, set-default. |
| UX-052 | Reporting Settings | No global display settings for scaling, decimals, negative format, date format, or report presentation. | `ReportingPresentationSettings` model and settings page did not exist. | High | Resolved | M35 | `ReportingPresentationSettings` model + `/reporting-settings/` GET+PUT added. `ReportingSettingsPage` (`/reporting-settings`) built with radio-card sections (scaling, decimals, negative format, date format), currency symbol input, statement display toggles, presentation toggles, and live preview panel. |
| UX-053 | Taxonomy / Confidence Scoring | No confidence indicator on FSLI assignments from COA import. | `get_confidence()` and `CONFIDENCE_BY_EVIDENCE` mapping did not exist. | Medium | Resolved | M35 | `get_confidence(evidence)` added to taxonomy service; returns "high"/"medium"/"low" based on evidence string keywords. High = auth_type/tax_line match; Medium = detail_type/QB_type; Low = name keywords/fallback. |

## Resolved Issues

| ID | Area | Issue | Resolution | Resolved In | Evidence |
|---|---|---|---|---|---|
| UX-014 | Import Wizard Entity Dropdown | Wizard showed no entities | M29 proxy/CORS fix; M31 EntitySelect in wizard | M29/M31 | entities API functional |
| UX-015 | Entities Page Network Error | Page failed to load entities | M29 Vite proxy and CORS config | M29 | entities page functional |
| UX-016 | Draft Preview Network Error | Preview returned network error | M29 proxy setup | M29 | draft preview functional |
| UX-018 | Import Templates | No downloadable templates | Added 4 CSV templates (A/B/C/D) with client-side download in ImportCenterPage | M31 | Download buttons in format guidance panel |
| UX-019 | Entity Required Fields | FY End/Convention optional | Made required in EntityCreate schema; form validation UI added | M31 | test_m31_entity.py passes 422 |
| UX-020 | TB Upload Network Error | Upload failed | M29 proxy/CORS/multipart fix | M29 | upload functional |
| UX-021 | Entity Creation Network Error | Create form failed | M29 proxy fix | M29 | entity creation functional |
| UX-022 | Onboarding Progress | Entity creation didn't update Getting Started | Invalidate onboarding-status query after mutations; SetupWizardPage URL fixed | M31 | Progress bar updates after entity create |
| UX-023 | Import Entity Dropdown Stale | New entity not in dropdown | TanStack Query invalidation on entity mutations | M31 | EntitySelect queries fresh on mount |
| UX-024 | Import Numeric Entity Input | Entity selector was number input | Replaced with EntitySelect component (searchable) | M31 | ImportCenterPage uses EntitySelect |
| UX-025 | Upload Preview | No column/sheet preview | Import Wizard detect step added in M29 | M29 | Preview tab functional |
| UX-026 | Import Format Guidance | No format warnings | Expanded format guidance with accepted formats, auto-detected patterns, templates | M31 | Format help panel in ImportCenterPage |
| UX-027 | XLSX Support Clarity | UI unclear on formats | Drop zone and format guidance list CSV/XLSX/QBO/NetSuite/Sage | M31 | Text update in ImportCenterPage |
| UX-028 | Account Name Parsing Display | Combined account column | Lines tab split into "Source Acct #" and "Source Acct Name" columns | M31 | ImportReviewPage table header |
| UX-029 | Validation Issue Export | No export button | Export Issues CSV button added to Validation Issues tab | M31 | Button in ImportReviewPage issues tab |
| UX-030 | Mapping Workbench Scroll | Table not scrollable | overflow-x-auto added to table wrapper | M31 | MappingWorkbenchPage table div |
| UX-031 | Mapping Concept Clarity | Mapping hierarchy unclear | Explanation banner: Source Account → COA Account → Reporting Line | M31 | Banner above toolbar in MappingWorkbenchPage |
| UX-032 | Show Mapped Toggle | Toggle label confusing | Label updated to "Show all (including mapped)" | M31 | Toggle label in MappingWorkbenchPage |
| UX-033 | Suggestion Visibility | Suggestions not inspectable | Per-row suggestion chip with account # and name + Accept button | M30 | MappingWorkbenchPage suggestion chip |
| UX-034 | Export Mappings URL | Export returned 404 | Fixed double /api prefix bug in handleExportMappings | M31 | window.open(url) direct |
| UX-035 | COA Location / Setup Clarity | COA location unclear | ChartOfAccountsPage at /accounts; "Chart of Accounts" nav item in Setup group | M32 | Sidebar + /accounts route |
| UX-036 | Entity-Specific COA | COA not per-entity | entity_id FK on accounts; /accounts?entity=N tree view | M32 | accountsApi.tree(entityId) |
| UX-037 | Reporting Taxonomy Clarity | Taxonomy unclear | 27 seeded standard taxonomy lines; auto-mapped on import; editable inline | M32 | reportingTaxonomyApi + ChartOfAccountsPage |
| UX-038 | QB-Style Account Types | Account type/detail type missing | QB type/detail type auto-detected; inline edit in ChartOfAccountsPage | M32 | coa_import_service QB_TYPE_MAP |
| UX-039 | COA Preview Filter Chips | Chips non-clickable | `<button>` chips with typeFilter state; table filtered on click; click again clears | M33 | milestone33.test.tsx filter chip tests |
| UX-040 | QB Tax Line / FSLI Mapping | Tax Line not driving FSLI | TAX_LINE_TO_TAXONOMY (70+ entries); tax_line priority in apply; override select in preview | M33 | milestone33.test.tsx + test_m32_coa.py |
| UX-041 | Create Account Workflow | No inline account creation | CreateAccountModal with full QB-style form; "Create Account" button in ChartOfAccountsPage | M33 | milestone33.test.tsx CreateAccountModal tests |
| UX-042 | QB Account Creation UX | No type guidance | QB-style category buttons (7 + 9 other); contextual help text; detail type dropdown per category | M33 | milestone33.test.tsx type selector tests |
| UX-043 | FSLI Evidence Hierarchy | Fixed Asset overridden by tax line | AUTHORITATIVE_QB_TYPES unconditionally override; BAD_TAX_LINE_PATTERNS skip obsolete lines | M34 | test_m34_coa.py auth_type tests |
| UX-044 | Source Evidence Transparency | No visibility into why FSLI was assigned | source_evidence field in preview; Evidence column; help icon on Reporting Line header | M34 | milestone34.test.tsx Evidence column |
| UX-045 | Unassigned Filter Chip | Unassigned accounts not findable | Amber "Unassigned · N" chip; filters to null suggested_reporting_line rows | M34 | milestone34.test.tsx unassigned chip |
| UX-046 | Preview Filtering | No search/filter in COA preview | Global search input + reporting-line filter dropdown; composable with type/unassigned chips | M34 | milestone34.test.tsx search tests |
| UX-047 | Parent Account in Preview | Child accounts had no visible parent link | parent_account_number/name/hierarchy_depth in schema; Parent Account column; _find_parent_by_account_number() | M34 | milestone34.test.tsx + test_m34_coa.py |
| UX-048 | Parent Account Inline Edit | No way to change parent in COA tree | Parent selector in ChartOfAccountsPage inline edit; PATCH sends parent_account_id | M34 | milestone34.test.tsx parent selector test |
| UX-049 | Taxonomy Admin UI | Taxonomy not editable in UI | TaxonomyAdminPage with tree table, inline edit, create modal, import/export panel, views panel | M35 | milestone35.test.tsx TaxonomyAdminPage suite |
| UX-050 | Taxonomy CSV Import/Export | No bulk taxonomy management | /import/preview + /import/apply (two-pass); /export.csv round-trippable template | M35 | test_m35_taxonomy.py import/export tests |
| UX-051 | Reporting Views | No named views for different presentations | ReportingTaxonomyView CRUD + 5 seeded views; /reporting-views/ endpoints + views panel | M35 | test_m35_taxonomy.py views tests |
| UX-052 | Reporting Settings Page | No global display settings | ReportingPresentationSettings model + /reporting-settings/ GET/PUT + ReportingSettingsPage with live preview | M35 | milestone35.test.tsx ReportingSettingsPage suite |
| UX-053 | Confidence Scoring | No confidence on FSLI assignments | get_confidence() → high/medium/low tiers; CONFIDENCE_BY_EVIDENCE keyword mapping | M35 | reporting_taxonomy_service.py |

| UX-054 | Alembic / Migration 008 | `alembic upgrade head` failed on SQLite with "Cannot add a column with non-constant default". | Migration 008 added `created_at`/`updated_at` to `reporting_taxonomy_lines` using `sa.func.now()` — SQLite rejects non-constant column defaults in ALTER TABLE. `ReportingTaxonomyLine` queries (including `get_taxonomy_id_for_account`) failed with "no such column" until migration applied. | Critical | Resolved | M35-recovery | Fixed migration 008: detect SQLite dialect, pass `server_default=None` for datetime columns. `alembic upgrade head` now applies cleanly. |
| UX-055 | TypeScript Build / reportingTaxonomyApi.list | Frontend build failed: `reportingTaxonomyApi.list` passed directly as `queryFn` caused TS type error (function signature incompatible with TanStack Query's QueryFunction). | `list(activeOnly?, statementType?)` has typed params; passing bare reference misleads TS overload resolver. | High | Resolved | M35-recovery | Wrapped in arrow function `() => reportingTaxonomyApi.list()` in ChartOfAccountsPage, COAImportPage, and CreateAccountModal. |
| UX-056 | TypeScript Build / ReportingSettingsPage | `DEFAULTS` object missing `default_view_id` field required by `Omit<ReportingPresentationSettings, 'id' \| 'org_id'>`. | `default_view_id` was added to the type in M35 but not to the DEFAULTS constant. | High | Resolved | M35-recovery | Added `default_view_id: null` to DEFAULTS in ReportingSettingsPage. |

| UX-057 | Comparative / Variance pages | Scenario ID input is a raw number field — should use ScenarioMultiSelect or a dedicated ScenarioSelect. | Not blocking alpha testing; scenario is optional. | Low | Resolved | M35b | ScenarioSelect component built and integrated into ComparativeFinancialsPage and VarianceAnalysisPage. Raw number inputs removed. |
| UX-058 | Financial Statements / Blank Output | BS/IS pages showed blank output for entities that imported a COA (taxonomy-based mapping path), because the old FsLineItem/AccountMapping system was used but no AccountMapping records existed. | Critical | Resolved | M35b | New taxonomy-based FS reporting service (`taxonomy_reporting_service.py`) added. `GET /financial-statements/taxonomy/balance-sheet` and `/income-statement` serve the COA-import path. FinancialStatementsPage rebuilt with three tabs (BS/IS/CF), EntitySelect, ScenarioSelect, and hierarchy-rendered taxonomy tables. |
| UX-059 | Financial Statements / Parameters | Entity and Scenario fields were raw ID inputs or required a modal. | High | Resolved | M35b | FinancialStatementsPage now uses EntitySelect + date picker + ScenarioSelect inline; no modal required. |
| UX-060 | Scenario Management | No way to create, edit, or deactivate scenarios — only listed from `/scenarios/`. | High | Resolved | M35b | `POST /scenarios/` (create + type validation + code uniqueness), `PATCH /scenarios/{id}` (name/description/active), `DELETE /scenarios/{id}` (soft-delete) added. `scenariosApi.create/update/deactivate` added to frontend. ScenarioSelect component built. |
| UX-061 | COA / Hierarchy Manager — No Reparent Actions | No way to restructure the account hierarchy interactively. Users had to re-import to change parent/child relationships. Only the inline-edit parent selector existed, requiring a separate edit row open for every change. No multi-step drag or right-click workflow. | High | Resolved | M35c | `⋮` hierarchy menu button per row + right-click `contextmenu` event open a fixed-position `HierarchyContextMenu` with four actions: **Make Parent** (next row becomes child of selected), **Make Child** (selected becomes child of previous row), **Outdent** (move to root, disabled if no parent), **Move To** (searchable `MoveToParentModal` lists all other accounts with `move-to-root` option). Backend: `POST /accounts/{id}/reparent` with circular-hierarchy detection (`_would_create_cycle`), self-parent, cross-entity, and not-found validation; returns old+new parent info for audit trail. Visual: 2-second amber row highlight, specific toast ("2101 LOC - Aegis moved under 2100 Lines of Credit"). 15 backend tests (`tests/test_m35c_hierarchy.py`), 21 frontend tests (`milestone35c.test.tsx`). |
| UX-062 | COA / Drag-and-Drop Hierarchy | No drag/drop for hierarchy management — only context menu actions available. True tree-style reparenting via drag requires clicking through a menu every time. | High | Resolved | M35d | HTML5 native drag API on `<tr>` rows. `draggable={true}` with `GripVertical` handle column. `onDragStart` records dragged node + subtree IDs to prevent circular drop. `onDragOver` computes drop position (before/inside/after) from mouse Y ratio within row; highlights row with colored border (before/after) or indigo ring (inside). `onDrop` calls `reparentMutation` with `parentId = targetId` (inside) or `target.parent_account_id` (before/after). Self-drop and descendant-drop blocked client-side. 1 frontend test confirms `draggable=true` attribute. |
| UX-063 | COA / No Undo for Hierarchy Changes | Accidental reparents (drag/drop, context menu) cannot be undone — users must manually reverse each operation. | High | Resolved | M35d | Session-based undo/redo stack. Each `reparent` success pushes `{ accountId, oldParentId, newParentId, description }` to `undoStack`. Undo pops stack, calls `reparent(id, oldParentId)`, pushes to `redoStack`. Redo reverses. Keyboard: Ctrl+Z (undo), Ctrl+Shift+Z (redo). Undo/Redo buttons in toolbar show last action in `title` tooltip. Stack cleared on new (non-undo) action. 3 frontend tests (`milestone35d.test.tsx`). |
| UX-064 | COA / Move To Child Missing | Context menu only had "Move To Parent" — no way to pick an account to absorb as a child (make selected account parent of another). | Medium | Resolved | M35d | `action-move-to-child` added to `HierarchyContextMenu`. `MoveToChildModal` (testid `move-to-child-modal`, search via `move-to-child-search`, accounts via `move-to-child-account-{id}`) opens on click. On selection: `reparent(pickedId, selectedAccount.id)` — selected account becomes parent of picked account. Self excluded. Escape closes. 5 frontend tests. |
| UX-065 | COA / No Expand/Collapse All | Tree had per-node expand/collapse but no bulk expand or collapse buttons. Large COAs required clicking every parent to collapse/expand. | Low | Resolved | M35d | `ChevronsUpDown` (expand all) and `ChevronsDownUp` (collapse all) buttons in toolbar. Collapse all adds all parent node IDs to `collapsedIds` set; expand all clears it. Child counts shown in `(N)` next to account names. Tree controlled via `HierarchyCtx` — each row reads `collapsedIds.has(node.id)` from context. 1 test confirms buttons render. |
| UX-066 | Financial Statements / Blank Output | BS/IS tabs showed blank output without any explanation of why — no trial balance, no taxonomy mapping, no error. Users couldn't tell if the data was missing or if there was a system error. | Critical | Resolved | M35d | `TaxonomyTable` now shows distinct states: (1) loading spinner while fetching; (2) "No reporting data found" empty state with guidance ("assign accounts to reporting lines, then Inherit Taxonomy"); (3) amber $0 warning if all rows have zero balance but taxonomy lines exist ("No trial balance data found for this entity and date"). CF tab shows structured error with guidance. 2 frontend tests. |
| UX-067 | Financial Statements / Inherit Taxonomy — Opaque Result | "Inherit Taxonomy" button showed only "Inherited: 0 accounts updated" with no explanation of why 0 accounts were updated. Users couldn't tell if the operation was complete or broken. | High | Resolved | M35d | `InheritFeedback` component renders three distinct cases: (1) `updated > 0` → "Inherited: N accounts classified (M already set)"; (2) `no_ancestor > 0 && updated === 0` → "No eligible parent mappings found. Assign reporting lines to parent accounts first"; (3) `already_set > 0 && updated === 0 && no_ancestor === 0` → "All N accounts already have reporting lines". Backend returns `{updated, already_set, no_ancestor}`. 3 frontend tests. |
| UX-068 | Draft Overlay / Raw ID Inputs | DraftOverlayModal required typing numeric Entity ID and Scenario ID — unusable for non-technical users. No searchable dropdowns, no validation, no entity/scenario names shown. | Critical | Resolved | M35d | `Input[type=number]` fields for Entity ID and Scenario ID replaced with `EntitySelect` (searchable by code/name) and `ScenarioSelect` (shows type badge + name). "What is Draft Overlay?" explanation panel added: explains preview-only, non-official, use cases (QoE, lender, pro forma), with visual equation Official + Draft = Preview. Workflow now labeled Step 1 (Entity/Scenario), Step 2 (Overlay Groups), Step 3 (Draft Entries). |
| UX-069 | Financial Statements / No Debug Visibility | No way to understand why statements were blank — no diagnostic information about what was loaded, how many accounts were mapped, or what was missing. | High | Resolved | M35d | Collapsible `StatementDebugPanel` shown in dev mode (`import.meta.env.DEV`). Shows: entity_id, as_of_date, scenario_id, BS/IS row counts, mapped account counts per statement, unmapped line counts (amber if > 0). Tip: "Run Inherit Taxonomy if accounts exist but balances are $0." |

## Deferred Issues

| ID | Area | Issue | Reason Deferred | Target |
|---|---|---|---|---|
