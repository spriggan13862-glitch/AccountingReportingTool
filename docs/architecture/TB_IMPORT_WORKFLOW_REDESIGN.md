# Trial Balance Import — Workflow Redesign Proposal

Status: **DRAFT — awaiting architectural approval before implementation**
Date: 2026-06-21
Audience: a CPA importing a QuickBooks trial balance for a client

## 1. Why this exists

Incremental fixes (Agents 1/2/3 + the simplified-wizard sprint) keep landing
without resolving the underlying problem: the system has **two import
wizards, two mapping workbenches, and a separate Auto-Map modal** that
together force the user to learn five overlapping screens just to import
one TB. This proposal collapses the workflow into a single linear wizard.

No code in this PR. Approve the proposal first.

## 2. Current workflow (as shipped)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          USER LANDS ON /import                            │
│                       (ImportCenterPage — readiness matrix)               │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
        ┌────────────────────────────────────────────────────┐
        │            Two competing wizards exist             │
        ├────────────────────────────────────────────────────┤
        │ TrialBalanceImportPage     │   ImportWizardPage    │
        │ /client-data/imports/      │   /client-data/       │
        │   trial-balance            │     imports           │
        │ 6 steps:                   │   7 steps:            │
        │  0 Upload                  │    Upload             │
        │  1 Sheet                   │    Sheet              │
        │  2 Column Mapping          │    Columns            │
        │  3 Suggest FS Lines (NEW)  │    Mapping Basis      │
        │  4 Review Exceptions       │    Preview            │
        │  5 Post                    │    Accounts           │
        │                            │    Confirm            │
        └────────────────────────────────────────────────────┘
                                  │
                                  ▼
   After upload, user is redirected to ImportReviewPage (yet another screen)
                                  │
                                  ▼
        Then — for any mapping work — the user must discover
        ┌──────────────────────────────────────────────────────────┐
        │                MappingWorkbenchPage                       │
        │                  /import/map/:id                          │
        │                                                           │
        │ • Source Account column                                   │
        │ • DR / CR / Balance                                       │
        │ • Matched COA / Status                                    │
        │ • FSLI Suggestion column                                  │
        │ • FSLI / Reporting Line dropdown                          │
        │ • Inherited From column                                   │
        │ • Sprint O / Legacy badges                                │
        │ • Auto-Map Taxonomies button → opens TaxonomySuggestion-  │
        │   Panel as a modal                                        │
        │ • Flat / Grouped toggle                                   │
        │ • 9 filter axes                                           │
        │ • Delete row / bulk delete / delete batch                 │
        │ • Override matched COA editor                             │
        │                                                           │
        │ Same page is the only place to fix unmapped accounts      │
        │ before posting.                                           │
        └──────────────────────────────────────────────────────────┘

   And also coexisting:
        ┌──────────────────────────────────────────────────────────┐
        │           TaxonomyMappingWorkbenchPage                    │
        │              /taxonomy/mapping                            │
        │ (Sprint H — yet another mapping screen for cross-entity   │
        │  taxonomy assignment)                                     │
        └──────────────────────────────────────────────────────────┘
```

**What the user sees:** five screens, two parallel wizards, three
mapping concepts (COA Match · FSLI Suggestion · Selected FSLI), badges
that leak implementation detail (Sprint O / Legacy), and a separate
"Auto-Map Taxonomies" button they must discover.

**Click count to import a QBO TB cleanly:** ~25–40 clicks including
navigation between wizard and Mapping Workbench.

## 3. Proposed workflow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          USER LANDS ON /import                            │
│                       (ImportCenterPage — list of imports only)           │
│                  primary action: "New Trial Balance Import"               │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │                      ONE wizard: /import/trial-balance                │
   │                                                                       │
   │  Step 1  Upload                                                       │
   │          • Drag-and-drop CSV/XLSX                                     │
   │          • Entity + period (pre-filled from ContextBar)               │
   │          • Continue                                                   │
   │                                                                       │
   │  Step 2  Confirm Worksheet & Header  (auto-skipped if single-sheet)   │
   │          • Auto-detected sheet + header row highlighted              │
   │          • Preview with sticky header, 480px scroll                   │
   │          • User adjusts if wrong; Continue                            │
   │                                                                       │
   │  Step 3  Confirm Columns                                              │
   │          • Auto-mapped from header + data inspection (Agent 1)        │
   │          • Green "auto-detected" labels; user can change any column   │
   │          • Combined "Account # + Name" supported as one column        │
   │          • Inline warning if amount-shaped column → account number    │
   │          • Continue                                                   │
   │                                                                       │
   │  Step 4  Map Financial Statement Lines                                │
   │          • Suggestion engine runs on raw account # / name automatically│
   │          • Picks US GAAP by default; structure dropdown collapsible   │
   │          • Inline table:                                              │
   │              Source Account # | Name | Debit | Credit | Suggested FS │
   │              Line | Confidence | Action(Accept/Change/Skip)           │
   │          • Counts at top: "187 of 249 auto-mapped (75%)"              │
   │          • "Accept all ≥ 80%" / "Accept selected" / row-level edits   │
   │          • Continue (button is disabled until ≥ X% mapped OR user     │
   │            explicitly chooses "Continue without mapping all")         │
   │                                                                       │
   │  Step 5  Review Exceptions                                            │
   │          • Only rows with issues (unbalanced, missing FSLI,           │
   │            duplicate, conflict)                                       │
   │          • Each issue has an inline resolver (no separate page)       │
   │          • "Show all accounts" expander                               │
   │          • Continue                                                   │
   │                                                                       │
   │  Step 6  Post to Ledger                                               │
   │          • JE number + notes                                          │
   │          • Posting summary (accounts created, balances, JE totals)    │
   │          • Post                                                       │
   └──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
              Posted batch → return to ImportCenterPage list
```

**Click count to import a QBO TB cleanly:** ~10–15 clicks, no
inter-screen navigation, no "discover the mapping workbench" step.

## 4. Screens to eliminate

| Screen | Decision | Justification |
|--------|----------|---------------|
| `ImportWizardPage` (`/client-data/imports` 7-step variant) | **Eliminate** (redirect to `/import/trial-balance`) | Duplicate of TrialBalanceImportPage. The 7-step variant carries the "Mapping Basis" step the new wizard absorbs into step 4. |
| `MappingWorkbenchPage` (`/import/map/:id`) | **Eliminate from primary flow.** Keep as `/import/:id/advanced-mapping` for rare cases (multi-taxonomy editing of one batch after posting). NOT linked from primary nav. | Its 12 columns and 9 filters are overkill for the standard CPA flow. Everything a user needs to map a TB is now in wizard step 4. |
| `TaxonomySuggestionPanel` modal hosted inside MappingWorkbench | **Eliminate.** Suggestion display becomes the body of wizard step 4. | The modal was a workaround for the wizard not owning suggestions. Now the wizard owns them. |
| `ImportReviewPage` (`/import/:id`) | **Eliminate as separate page.** Merge into wizard step 5. | The "validation issues with grouped severities" UI moves into the step-5 panel. |

## 5. Screens to merge

| Screen | Merge into |
|--------|------------|
| Auto-Map Taxonomies modal | Wizard step 4 inline display |
| Mapping Workbench's Filter Bar | Wizard step 4 has a single "Filter: All / Auto-mapped / Needs review / Conflicts" chip group — that covers every real CPA need without a 9-axis filter palette. |
| Review/Validate page | Wizard step 5 (Review Exceptions) |
| Post step + post-success notification | Wizard step 6 |

## 6. Screens to keep (unchanged)

| Screen | Why |
|--------|-----|
| `ImportCenterPage` (`/import`) | Lists historical imports + primary "New Trial Balance Import" action. Empty state recommends starting an import. |
| `TaxonomyLibraryPage` (`/taxonomy/library`) | Manages the taxonomy DEFINITIONS (US GAAP / IFRS / Industry templates). Distinct from per-import mapping. |
| `TaxonomyMappingWorkbenchPage` (`/taxonomy/mapping`) | Renamed and demoted. Used for cross-entity / cross-period FSLI standardization. Not needed for the per-TB flow. Move to `/setup/taxonomy-mapping`. |

## 7. Data model impact

**No new tables.** All required fields already exist after the
simplified-wizard sprint:

| Field | Status |
|-------|--------|
| `ImportLine.suggested_fsli_taxonomy_node_id` | Already added — populated by step 4 suggestion engine |
| `ImportLine.selected_fsli_taxonomy_node_id` | Already added — populated when user accepts in step 4 |
| `ImportLine.suggested_fsli_confidence` / `_reason` | Already added |
| `Account.reporting_taxonomy_line_id` | Existing — set during post when an Account is created |
| `AccountTaxonomyMapping` (Sprint O) | Existing — populated for multi-taxonomy users via TaxonomyMappingWorkbench (out of TB flow) |

**No new endpoints.** Step 4 uses the existing
`POST /tb-imports/batches/{id}/suggest-fsli` and
`POST /tb-imports/batches/{id}/apply-fsli-suggestions` from last sprint.

**Endpoints to retire after redesign ships and burn-in completes:**

| Endpoint | After redesign |
|----------|----------------|
| All `/import/map/*` UI routes | No frontend caller |
| `TaxonomySuggestionPanel` mounted in MappingWorkbench | Component removed; the suggestion table component moves into the wizard |

(Backend retains the rules engine and mapping endpoints; only the UI surface shrinks.)

## 8. User acceptance flow — QuickBooks TB → posted ledger

The CPA flow we are optimizing for:

```
Time 0:00  CPA opens app, ContextBar shows entity + period.
Time 0:05  Clicks "New Trial Balance Import" on /import.
Time 0:15  Drags QuickBooks "Trial Balance.csv" onto upload area.
           Entity + period pre-filled.
Time 0:20  Clicks Continue → app parses file.

Time 0:25  Step 2 — single-sheet CSV, auto-skipped.
           (For an XLSX with multiple sheets: app shows sheet picker,
            CPA confirms in 3 seconds.)

Time 0:30  Step 3 — Column Mapping.
           "Account" column auto-detected as Account # + Name (combined).
           "Debit" auto-detected.
           "Credit" auto-detected.
           CPA scans the green labels for 5 seconds, clicks Continue.

Time 0:40  Step 4 — Map Financial Statement Lines.
           App has already run suggestions while CPA was on step 3.
           Top banner: "187 of 249 accounts auto-mapped (75%) using US GAAP."
           CPA clicks "Accept all ≥ 80% confidence" → 165 accounts mapped.
           Filter switches to "Needs review" → 84 accounts visible.
           CPA scrolls, accepts most, edits 4 lines via inline dropdown.
           Counts update live. Clicks Continue.

Time 1:45  Step 5 — Review Exceptions.
           Banner: "Imported 249 · Auto-mapped 245 · Need review 0 ·
                    Excluded 4 (total/header rows) · Errors 0".
           No exceptions. Clicks Continue.

Time 1:50  Step 6 — Post.
           JE number prefilled as "JE-TB-{batchId}-YYMMDD".
           Notes optional. Clicks Post.

Time 1:55  Toast: "Trial balance posted to general ledger." Returns to
           /import. New batch in list with status = Posted.

TOTAL: ~2 minutes for a clean QBO TB. ~13 clicks. No navigation outside
the wizard. No exposure to FSLI, taxonomy, COA matching, mapping basis,
or any other internal vocabulary.
```

## 9. What stays hidden from the user

- Word "FSLI" (use "Financial Statement Line" or just "FS Line")
- Word "Taxonomy" (use "Financial statement structure" — appears once)
- Words "Mapping basis", "Reporting view", "Inherited from"
- Implementation badges "Sprint O", "Legacy"
- "Will create new COA account" (now "New COA account candidate" — present only on hover)
- "COA Match" displayed only when a user explicitly chooses to override an auto-match in advanced mode

## 10. Backwards compatibility

- All existing `/import/map/:id` URLs redirect to the wizard with a deep link to step 4 (`/import/trial-balance?batch=:id&step=4`).
- Existing posted batches remain visible in ImportCenterPage history.
- The TaxonomySuggestionPanel component is preserved in the codebase as `<FsliSuggestionTable>` extracted from the wizard step 4 body — for any future need to embed it elsewhere.

## 11. Risks and rejections

- **Power-user complaint risk:** users who rely on the 9-axis Mapping Workbench filters will lose them. Mitigated by keeping `/import/:id/advanced-mapping` reachable from the wizard's step-4 overflow menu ("Open advanced mapping editor").
- **Data risk:** none. No schema change.
- **Build risk:** medium. Frontend file changes across TrialBalanceImportPage, ImportWizardPage (deletion), MappingWorkbenchPage (deletion or demotion), ImportReviewPage (deletion or absorption). All changes are additive on backend.
- **Test rewrite risk:** medium. Playwright workflow specs that drove MappingWorkbench will need to drive the wizard step 4 instead. Existing Phase 1–3 / Agent 1–3 / simplified-wizard tests largely keep working.

## 12. Implementation plan (after approval)

Phase A — Documentation (this PR): land this proposal as the canonical
spec. **Stop here.**

Phase B — Wizard step 4 absorbs the AutoMap panel: extract
`<FsliSuggestionTable>` from `TaxonomySuggestionPanel`. Step 4 body
becomes that table directly (no modal).

Phase C — ImportReviewPage merge: move IssuesPanel into wizard step 5.
Delete the route.

Phase D — Demote MappingWorkbench: hide from primary nav. Keep at
`/import/:id/advanced-mapping`. Update the wizard step 4 overflow menu
with an "Advanced mapping editor" link for power users.

Phase E — ImportWizardPage redirect: delete the duplicate 7-step wizard,
redirect its route to `/import/trial-balance`.

Phase F — Terminology sweep + Playwright rewrite + What's New + push.

Each phase is one commit, browser-verified independently. Estimated total
6 sequential commits.

## 13. Decision needed from reviewer

Please respond with one of:

1. **APPROVE** — proceed to Phase B.
2. **APPROVE WITH CHANGES** — list specific changes to this proposal.
3. **REJECT** — explain blocking concern; this proposal is shelved.
4. **DEFER** — keep current incremental approach; close this proposal.

Until a response arrives, no implementation work will start.
