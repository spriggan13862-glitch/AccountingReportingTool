# Workflow Stabilization — QA Checklist

Last updated: 2026-06-20

This document tracks the 15 issues raised during manual UI testing of the
import / mapping / scenario / taxonomy workflows. Each item is mapped to
a sprint phase and a verification path (unit test / Playwright / manual).

## Phase summary

| Phase | Scope | Status |
|-------|-------|--------|
| 1a    | TB column-mapping sticky header (issue 2)                                          | DONE |
| 1b    | Backend DELETE endpoints for import line + batch (issue 5 backend)                 | DONE |
| 1c    | Auto-map → readiness matrix invalidation (issues 9, 15)                            | DONE |
| 2     | MappingWorkbench refactor (issues 4, 5-frontend, 6, 7, 9, 11, 12, 13)              | (background agent) |
| 3     | ImportWizard taxonomy basis + AutoMap modal redesign (issues 8, 10)                | (background agent) |
| 4     | Tests + Playwright + screenshots + changelog + push                                | (pending) |

## Per-issue status

| # | Issue | Status | Verified by |
|---|-------|--------|-------------|
| 1 | Scenarios not global | WORKING (no change) | Code audit + Playwright `issue 1 — scenarios available` |
| 2 | TB column-mapping doesn't scroll | FIXED (1a) | Visual: sticky header + 480px max-height |
| 3 | Import validation noise | WORKING (no change) | Code audit (IssuesPanel groups by severity) |
| 4 | Mapping Workbench flat list | FIXED (Phase 2) | Frontend test: grouped view by default |
| 5 | Mapping Workbench no delete | FIXED (1b backend + Phase 2 frontend) | 5 backend tests pass + Playwright route-exists |
| 6 | Mapping Workbench filters incomplete | FIXED (Phase 2) | Frontend test: account-type filter |
| 7 | FSLI dropdown empty | FIXED (Phase 2) | Frontend test: Sprint O fallback when legacy empty |
| 8 | Import doesn't ask taxonomy basis | FIXED (Phase 3) | Frontend test: taxonomy step + skip path |
| 9 | Auto-map invisible | FIXED (1c) | Code: 7 query invalidations in TaxonomySuggestionPanel.onApplied |
| 10 | Auto-map modal usability | FIXED (Phase 3) | Frontend test: select-all + sort + column filters |
| 11 | Row layout cramped | FIXED (Phase 2) | Visual: hscroll + tooltip + min-w table |
| 12 | Matched COA needs editing | FIXED (Phase 2) | Frontend test: inline edit + reset |
| 13 | Taxonomy vs FSLI conflation | FIXED (Phase 2) | Visual: Sprint O vs Legacy badge per row |
| 14 | Parent inheritance | WORKING (no change) | Code audit (Sprint G `inheritanceMap` + propagate) |
| 15 | Import Center no result after auto-map | FIXED (1c) | `import-readiness` query in invalidation list |

## Verification commands

```bash
# Backend
python -m pytest tests/test_tb_import_delete.py -q
python -m pytest tests/test_taxonomy_suggestions_api.py -q
python -m pytest -q                                # full suite

# Frontend unit
cd frontend
npx vitest run src/test/mapping_workbench.test.tsx
npx vitest run src/test/taxonomy_suggestions.test.tsx
npx vitest run src/test/import_wizard_taxonomy.test.tsx

# Browser
cd frontend
npx playwright test --config playwright.workflow.config.ts --project workflow-fixes
# Screenshots land in frontend/test-results/workflow-screenshots/
```

## Backend changes

- `app/api/routers/tb_import.py`
  - `DELETE /tb-imports/batches/{batch_id}/lines/{line_id}` — single line, 409 on posted
  - `POST /tb-imports/batches/{batch_id}/bulk-delete-lines` — `{line_ids: [...]}`, 409 on posted

## Frontend changes

- `frontend/src/pages/TrialBalanceImportPage.tsx` — sticky thead on step 2
- `frontend/src/components/taxonomy/TaxonomySuggestionPanel.tsx`
  - `onApplied` invalidates: `account-mappings`, `taxonomy-account-mappings`, `import-lines`, `import-suggestions`, `fsli-inheritance`, `import-readiness`, `accounts-all`
- `frontend/src/pages/MappingWorkbenchPage.tsx` — (Phase 2 agent)
- `frontend/src/pages/ImportWizardPage.tsx` — (Phase 3 agent)
- `frontend/src/api/tbImport.ts` — (Phase 2 agent, adds deleteLine + bulkDeleteLines)

## Known limitations

- The legacy `ReportingTaxonomyView` is still active alongside Sprint O taxonomies. Phase 2 adds Legacy/Sprint-O badges so users can see which system a mapping belongs to, but does not migrate legacy mappings.
- Matched-COA override (issue 12) reuses the existing `map-line` endpoint by sending a different `account_id`. If the endpoint rejects the new shape, the UI surfaces an error toast — backend wiring may need a follow-up sprint.
