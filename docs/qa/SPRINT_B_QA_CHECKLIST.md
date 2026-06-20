# Sprint B — Import Source Logic QA Checklist
Last updated: 2026-06-19

## Acceptance Criteria
- [ ] TB-only import creates accounts and balances
- [ ] COA-only import creates accounts but no balances
- [ ] FS-only import creates statement presentation only
- [ ] Import Readiness Matrix shows correct status for each source type
- [ ] Import wizard shows what each file type provides and what's missing
- [ ] get_readiness_status() returns correct booleans for COA+TB scenario

## Import Source Matrix
| Source | Creates Accounts | Creates Balances | Requires Period | Suggests FSLI |
|--------|-----------------|-----------------|-----------------|---------------|
| COA    | Yes (hierarchy) | No              | No              | No            |
| TB     | Yes             | Yes             | Yes             | Yes           |
| GL     | Yes             | Yes (derived)   | Yes             | No            |
| FS     | No              | No              | No              | Yes           |

## API Endpoints Added
- `GET /api/v1/import-readiness/?entity_id={id}&period_id={id}` — import readiness matrix

## New Files
- `app/services/import_source_logic.py` — `IMPORT_SOURCE_CAPABILITIES` + `get_readiness_status()`
- `app/api/routers/import_readiness.py` — readiness endpoint
- `frontend/src/api/importReadiness.ts` — API client
- `frontend/src/components/ui/ImportReadinessMatrix.tsx` — updated matrix component (replaces old)
- `frontend/src/test/import_readiness.test.tsx` — frontend tests
- `tests/test_import_readiness.py` — backend tests

## Test Coverage
- `tests/test_import_readiness.py`:
  - `test_empty_entity_readiness` — all false for entity with no imports
  - `test_coa_only_readiness` — COA present, no TB, not ready for accounting view
  - `test_tb_only_readiness` — TB posted, accounts created, ready_for_accounting_view=True
  - `test_coa_plus_tb_readiness` — COA + TB, missing list empty, ready gates pass
  - `test_taxonomy_mapped_pct` — 2/3 accounts mapped → 66.7%
- `frontend/src/test/import_readiness.test.tsx`:
  - Renders all four import type rows
  - Shows green check when coa_available
  - Shows missing list when not ready_for_accounting_view
  - Shows all four readiness badges

## Manual Smoke Tests
- [ ] Navigate to Import Center with an entity selected → Readiness Matrix appears
- [ ] Navigate to Import Wizard → Step 1 shows file type selector (TB/GL/COA/FS)
- [ ] Select each file type → info panel updates with what it provides/requires
- [ ] `GET /api/v1/import-readiness/?entity_id=1` returns JSON with all required fields
- [ ] After COA import: `coa_available=true`, `tb_has_balances=false`
- [ ] After TB import + post: `tb_available=true`, `ready_for_accounting_view=true`
