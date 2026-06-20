# Sprint O — Default Taxonomy Foundation QA Checklist

Last updated: 2026-06-20

## Acceptance Criteria (from product spec)

| # | Criterion | Verification |
|---|-----------|--------------|
| 1 | Default system taxonomies exist after database seed | Run `python scripts/seed_taxonomies.py`, assert 11 rows in `taxonomies` table with `is_system=true` |
| 2 | System taxonomies cannot be edited directly | PATCH `/taxonomies/nodes/{id}` on a system node → 409 Conflict |
| 3 | Users can clone system taxonomies | POST `/taxonomies/{id}/clone` → returns new taxonomy with `is_system=false`, `parent_taxonomy_id` set |
| 4 | Imported accounts can map to multiple taxonomies | Create 3 mappings for one account with 3 different `taxonomy_id` → all coexist |
| 5 | Taxonomies downloadable in CSV/Excel/JSON | GET `/taxonomies/{id}/export/{csv|excel|json}` → 200 with correct content-type |
| 6 | Taxonomy Library page exists and is usable | Navigate to `/taxonomy/library`, see System + Custom sections, click into a taxonomy, see tree |
| 7 | Import workflow uses default taxonomies for suggestions | Click "Auto-Map Taxonomies" in Mapping Workbench, suggestions appear |
| 8 | Reports can group accounts by selected taxonomy | (Out of scope for Sprint O — covered by existing `view_id` selector in Financial Statements page) |
| 9 | Mapping architecture supports GAAP + IFRS + Management + Industry simultaneously | Same account has mappings in all 4 taxonomies; all visible in COA detail panel |
| 10 | Existing functionality is not broken | Run full test suite; UI smoke test all major flows |

## Sprint-by-Sprint Verification

### O1 — Data Model & Service Foundation

- [ ] `app/models/taxonomy.py` exists with `Taxonomy`, `TaxonomyNode`, `AccountTaxonomyMapping`
- [ ] Migration `sprint_o1_taxonomy_foundation` applies cleanly (alembic upgrade head)
- [ ] `AccountTaxonomyMapping` has unique constraint `(account_id, taxonomy_id)`
- [ ] `app/services/taxonomy_library_service.py` exposes: `seed_system_taxonomies`, `clone_taxonomy`, `map_account`, `bulk_map_accounts`, `get_taxonomy_tree`
- [ ] `TaxonomyImmutableError` raised when `update_node()` called on system taxonomy

### O2 — Seed Data

- [ ] 11 JSON files exist in `data/taxonomies/`:
  - [ ] `us_gaap.json` (180-250 nodes)
  - [ ] `ifrs.json` (150-220 nodes)
  - [ ] `management.json` (120-180 nodes)
  - [ ] `saas.json` (100-160 nodes)
  - [ ] `healthcare.json` (120-180 nodes)
  - [ ] `manufacturing.json` (120-180 nodes)
  - [ ] `construction.json` (120-180 nodes)
  - [ ] `real_estate.json` (100-160 nodes)
  - [ ] `financial_services.json` (120-180 nodes)
  - [ ] `nonprofit.json` (100-160 nodes)
  - [ ] `spac_public.json` (100-150 nodes)
- [ ] Each taxonomy uses canonical leaf node codes (CASH, AR, AP, REVENUE_SALES, etc.) so rule engine resolves
- [ ] `scripts/seed_taxonomies.py` is idempotent — running twice does not duplicate

### O3 — API + Downloads

- [ ] `GET /taxonomies` returns list of TaxonomyOut
- [ ] `GET /taxonomies/{id}/tree` returns nested tree
- [ ] `POST /taxonomies/{id}/clone` returns new TaxonomyOut with `is_system=false`
- [ ] `PATCH /taxonomies/nodes/{id}` returns 409 for system node
- [ ] `GET /taxonomies/{id}/export/csv` returns text/csv, Content-Disposition with filename
- [ ] `GET /taxonomies/{id}/export/excel` returns .xlsx
- [ ] `GET /taxonomies/{id}/export/json` returns nested tree
- [ ] `POST /taxonomies/mappings` upserts mapping
- [ ] `GET /taxonomies/mappings/account/{id}` returns all mappings across taxonomies
- [ ] 8 tests pass in `tests/test_taxonomy_library_api.py`

### O4 — Rule Engine

- [ ] `suggest_mapping(account, taxonomy, db)` returns MappingSuggestion or None
- [ ] Keyword match (high): "Cash" → CASH, confidence ≥ 0.85
- [ ] Number range match (medium): account 1050 → CASH, confidence 0.60
- [ ] Account type fallback (low): type=revenue, no other match → REVENUE_SALES, confidence 0.40
- [ ] "Deferred Revenue - Q4 SaaS" → DEFERRED_REVENUE high confidence
- [ ] "Payroll Tax" → PAYROLL_TAXES high confidence
- [ ] Returns None when no taxonomy node exists for the suggested code
- [ ] 7 tests pass in `tests/test_taxonomy_mapping_rules.py`

### O5 — Frontend Taxonomy Library Page

- [ ] Route `/taxonomy/library` renders TaxonomyLibraryPage
- [ ] Left panel: "System Taxonomies" and "Custom Taxonomies" sections
- [ ] Filter input filters list by name
- [ ] Clicking taxonomy loads tree in right panel
- [ ] Download dropdown: CSV / Excel / JSON each trigger download
- [ ] Clone button opens modal with default name "{name} - Custom"
- [ ] Submitting clone creates new taxonomy, switches selection
- [ ] System taxonomy tree nodes are read-only (no Edit button)
- [ ] Custom taxonomy tree nodes have Edit/Deactivate/Add child buttons
- [ ] Tree search box filters nodes by name
- [ ] Nav item "Taxonomy Library" appears under Setup/Admin group
- [ ] 5 tests pass in `frontend/src/test/taxonomy_library.test.tsx`

### O6 — Import Workflow Integration

- [ ] `GET /taxonomies/suggest/{account_id}?taxonomy_ids=1,2,3` returns suggestions
- [ ] `POST /taxonomies/suggest/bulk` returns map of account_id → suggestions
- [ ] `POST /taxonomies/suggest/apply` creates AccountTaxonomyMappings with `mapping_source=ai_suggested`
- [ ] Existing mappings are NOT overwritten unless `overwrite_existing=true`
- [ ] MappingWorkbenchPage has "Auto-Map Taxonomies" button
- [ ] Button opens modal with checkboxes for selecting taxonomies
- [ ] Submitting opens TaxonomySuggestionPanel
- [ ] Apply Selected / Apply All buttons work
- [ ] Confidence chips: green ≥ 0.85, yellow 0.55-0.84, red < 0.55
- [ ] 5 backend tests pass + 4 frontend tests

### O7 — Multi-Taxonomy UI in COA

- [ ] Click account row in `/chart-of-accounts` → AccountPreviewSidebar opens
- [ ] Sidebar shows new "Multi-Taxonomy Mappings" section
- [ ] One card per taxonomy with current mapping or "Unmapped"
- [ ] Node picker dropdown shows available nodes
- [ ] Save button calls mapAccount, refreshes display
- [ ] Clear button removes mapping
- [ ] Mapping source badge color-coded by source
- [ ] 6 tests pass in `frontend/src/test/account_taxonomy_mappings.test.tsx`

## Regression Checks

- [ ] Existing Mapping Workbench (FSLI assignment) still works
- [ ] Existing Taxonomy Mapping Workbench at `/taxonomy/mapping` still works (Sprint H)
- [ ] Financial Statements view (AWV + FSP) renders correctly
- [ ] Adjustment Workbench NI/BS impact computation unchanged
- [ ] Consolidation page still functional
- [ ] All previously passing tests still pass: `python -m pytest -q` and `cd frontend && npm test`

## Visual QA

- [ ] Navigate to `/taxonomy/library`:
  - [ ] See 11 System taxonomies listed alphabetically
  - [ ] Click "US GAAP" → tree renders with ~200 nodes
  - [ ] Click Download → CSV → file downloads as `us_gaap_taxonomy.csv`
  - [ ] Click Clone → modal → enter "US GAAP - Acme Corp" → submit → new taxonomy appears in Custom section
- [ ] Navigate to Chart of Accounts, click an account:
  - [ ] Sidebar shows Multi-Taxonomy Mappings section with cards for each system taxonomy
  - [ ] Pick a node from US GAAP dropdown → Save → confirmation
  - [ ] Reload page → mapping persists
- [ ] Navigate to Mapping Workbench:
  - [ ] Click "Auto-Map Taxonomies"
  - [ ] Select US GAAP + IFRS
  - [ ] Click "Run Suggestions" → see suggestions table with confidence chips
  - [ ] Click "Apply All" → see success toast with N applied count
- [ ] Navigate to Overview / What's New section:
  - [ ] Top entry mentions Default Taxonomy Library
  - [ ] Bullet points cover: downloadable taxonomies, taxonomy cloning, multi-taxonomy account mapping, import mapping suggestions

## Known Limitations

- Sprint O does not modify the legacy `reporting_taxonomy_lines` / `reporting_taxonomy_views` system used by Financial Statements page — the new taxonomies coexist as a separate library. Migrating Financial Statements to consume the new taxonomies is a future sprint.
- Seed file node counts are at the lower end of the spec target range; expansion to full XBRL-level detail is ongoing.
- Industry taxonomy KPI nodes (`SAAS_ARR`, `HC_PATIENT_REVENUE`, etc.) use custom codes not in the rule engine — rule engine returns None for those, which is correct (KPIs are not auto-mappable from generic account names).
- The Clone modal does not yet enforce uniqueness on the user-supplied code field; backend rejects with 400 if collision.
