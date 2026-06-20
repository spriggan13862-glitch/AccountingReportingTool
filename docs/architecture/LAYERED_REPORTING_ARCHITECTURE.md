# Layered Reporting Architecture

Status: Decision Record (Sprint P1)
Date: 2026-06-20

## Problem

The current codebase conflates two concerns inside the same set of models and services:

1. **Classification** — "which conceptual bucket does this account belong to?"
2. **Presentation** — "how is this bucket shown to the user, in what order, with what subtotals?"

This conflation lives in three places:

- `ReportingTaxonomyLine` carries presentation fields (`sort_order`, `is_subtotal`, `sign_behavior`) alongside classification fields (`section`, `statement_type`, `normal_balance`).
- `ReportingTaxonomyView` is named "View" but behaves like a Taxonomy: it groups FSLI lines into GAAP/Management buckets. It does not control row order, subtotals, calculations, or formatting.
- `taxonomy_reporting_service.get_taxonomy_fs_statement()` applies `sign_flip`, `display_balance`, and rollup inline — presentation logic embedded in a classification service.

Sprint O introduced a clean classification layer (`Taxonomy`, `TaxonomyNode`, `AccountTaxonomyMapping`) but it only powers the Taxonomy Library page. Financial Statement endpoints still consume the legacy mixed-concerns models.

## Layer Contract

```
Source Data        →  Normalization     →  Taxonomy           →  Reporting View      →  Reports
(Account, ImportBatch, (Account.source_*    (Taxonomy,           (ReportingView,        (FS, dashboards,
 JournalEntry, TbImport,  fields, AccountMapping) TaxonomyNode,        layout, calcs,         exports)
 PDFImportBatch,                            AccountTaxonomy         comparatives,
 COAImportBatch,                            Mapping)                formatting,
 bank txns)                                                         column layouts)
```

Each arrow is a one-way dependency. Code in a downstream layer may read upstream models; upstream code MUST NOT depend on downstream models.

### Layer 1 — Source Data

**Responsibility:** Preserve imported accounting data exactly as received.

**Models:** `Account` (when first created), `TbImport`, `ImportBatch`, `ImportLine`, `JournalEntry`, `JournalEntryLine`, `PDFImportBatch`, `PDFImportLine`, `COAImportBatch`.

**Rules:**
- Source values are never overwritten on import; corrections happen as adjusting JEs.
- Each row tracks `source_system`, original account number, original name.
- No classification or presentation logic in this layer.

### Layer 2 — Normalization

**Responsibility:** Translate vendor-specific schemas (QuickBooks, NetSuite, Xero) into the application's canonical Account model.

**Models:** `Account.source_system`, `Account.source_account_number`, `AccountMapping` (legacy source-to-canonical link).

**Rules:**
- Source account number and name preserved on the Account row.
- Normalization is reversible: given a canonical Account, we can identify its source.
- No reporting logic in this layer.

### Layer 3 — Taxonomy (Classification)

**Responsibility:** Answer "where does this account belong?" across many simultaneous classification systems.

**Models (canonical, Sprint O):** `Taxonomy`, `TaxonomyNode`, `AccountTaxonomyMapping`.

**Models (legacy, deprecated path):** `ReportingTaxonomyLine`, `ViewAccountOverride`.

**Rules:**
- One account → many taxonomies → one node per taxonomy (enforced by `(account_id, taxonomy_id)` unique constraint).
- Taxonomy nodes carry classification metadata: `section`, `statement_type`, `normal_balance`, `gaap_reference`, `ifrs_reference`, `xbrl_tag`, `cash_flow_classification`.
- Taxonomy nodes MUST NOT carry presentation metadata: row order is presentation, subtotals are presentation, sign-flipping for display is presentation. (Legacy `ReportingTaxonomyLine` violates this; the new `TaxonomyNode` correctly omits these fields.)
- System taxonomies (is_system=true) are immutable; users clone first.

### Layer 4 — Reporting View (Presentation)

**Responsibility:** Answer "how is this information shown?"

**Models (NEW — Sprint P2):** `ReportingView`, `ReportingViewSection`, `ReportingViewCalculation`, `ReportingViewColumn`.

**A Reporting View carries:**
- A reference to one `Taxonomy` (the classification it consumes)
- Row ordering (which sections in what order)
- Grouping (which nodes are aggregated into a single display row)
- Subtotal definitions (e.g., Gross Profit = Revenue − COGS)
- Calculated fields (EBITDA, Operating Income, Free Cash Flow)
- Comparative periods (current vs prior year, vs budget, vs forecast)
- Column layouts (single column, comparative two-column, scenario rollup)
- Formatting rules (negative format, scaling, decimal places — may inherit from `ReportingPresentationSettings`)

**A Reporting View MUST NOT:**
- Remap accounts (that's classification; do it in the taxonomy)
- Reclassify nodes (the taxonomy is the source of truth)
- Read source `Account` rows directly (must go through `AccountTaxonomyMapping`)

**Examples — same US GAAP taxonomy supporting multiple views:**
- Standard Income Statement (Revenue → COGS → Gross Profit → OpEx → Operating Income → Other → Net Income)
- EBITDA View (adds EBITDA = Operating Income + D&A line)
- Comparative IS (two columns: current period, prior period, plus variance %)
- Departmental P&L (rows grouped by `Account.department`, same taxonomy)
- Audit Presentation (specific subtotals, footnote callouts)
- Lender Presentation (adjusted EBITDA with addbacks)

### Layer 5 — Reports / Analytics / Dashboards

**Responsibility:** Render the View as PDF, Excel, HTML, JSON.

**Code paths:** Frontend Financial Statements page, export service, drill-down APIs.

**Rules:**
- Reports consume a `(view_id, period, scenario)` triple.
- Reports never construct their own classification — they ask the view, which asks the taxonomy.
- Drill-down from a report row goes: View row → Taxonomy node → AccountTaxonomyMapping → Account → JournalEntryLine.

## Reporting Engine Rule (enforced)

```
Source Account
    ↓ Normalization
Normalized Account
    ↓ AccountTaxonomyMapping
TaxonomyNode
    ↓ ReportingView config
Display row
    ↓ formatting
Report output
```

Any code path that builds report output by reading `Account` rows directly (without going through `AccountTaxonomyMapping`) is a violation. Sprint P5 enforces this by refactoring `financial_statements.py` to consume the new chain.

## Import Intelligence

The system must dynamically determine what reports are possible from what's been imported.

**Capabilities matrix** (Sprint P4 enhances `import_source_logic.py`):

| Import Type | Provides | Enables |
|-------------|----------|---------|
| Chart of Accounts only | Account structure | Mapping suggestions |
| Trial Balance | Balances | Mapping + Statements + Comparatives + Drafts |
| General Ledger | Transactions | All TB capabilities + Drill-down + Rollforwards + Reconciliation |
| Financial Statements | Statement lines | Comparative presentations (no account-level support) |
| Bank Transactions | Cash activity | Categorization + Preliminary balances (review required) |

**Readiness Score** (Sprint P4): weighted aggregate (0–100) per capability, plus explicit list of missing data needed for each disabled capability.

## Migration Plan

Sprints P2–P7 deliver this architecture without breaking existing functionality:

- **P2** — Add `ReportingView` models alongside existing. No removals.
- **P3** — Extract presentation logic from `taxonomy_reporting_service.py` into `presentation_service.py`. Old service delegates to new. Tests pass on both paths.
- **P4** — Enhance import_source_logic → import_intelligence_service with scored readiness. Old function signatures preserved.
- **P5** — Add `?reporting_view_id=N` query parameter to `/financial-statements/accounting-view` and `/presentation-view`. When present, route through the new chain; when absent, fall back to legacy. Both paths tested.
- **P6** — Frontend: ReportingView selector + builder. Update Financial Statements page to use new view selector backed by `ReportingView`.
- **P7** — Changelog, Playwright spec, push. Legacy `ReportingTaxonomyView` marked deprecated in docstring; removal deferred to a future sprint after consumers migrate.

## Deprecation Register

| Symbol | Status | Replacement | Removal Sprint |
|--------|--------|-------------|----------------|
| `ReportingTaxonomyView` | DEPRECATED (Sprint P1) | `ReportingView` (Sprint P2) | Sprint P5+ after FS endpoints migrate |
| `ReportingTaxonomyLine.sort_order` | DEPRECATED | `ReportingViewRow.sort_order` | Sprint P5+ |
| `ReportingTaxonomyLine.is_subtotal` | DEPRECATED | `ReportingViewRow.row_type='subtotal'` | Sprint P5+ |
| `ReportingTaxonomyLine.sign_behavior` | DEPRECATED | `presentation_service.apply_sign_for_display()` | Sprint P5+ |
| Inline `sign_flip` / `display_balance` in `taxonomy_reporting_service.py` | DEPRECATED (Sprint P3) | `presentation_service.py` | Sprint P5+ |

Deprecation is signal-only during P2–P4: code still compiles and runs. Callers see `DeprecationWarning` only in P5+ when migration begins.

## Acceptance Criteria (mapping to original spec)

| # | Criterion | Sprint that satisfies it |
|---|-----------|--------------------------|
| 1 | Layers are distinct | P1 (this doc) + P2 + P3 |
| 2 | Taxonomies classify only | Sprint O (already done) + P3 (remove presentation from classifier) |
| 3 | Reporting Views present only | P2 (new model) |
| 4 | One account → many taxonomies | Sprint O (already done) |
| 5 | One taxonomy → many views | P2 (new model) |
| 6 | Import type drives capabilities | P4 |
| 7 | Reports go through mappings, not raw | P5 (refactor endpoints) |
| 8 | Import readiness assessment exists | P4 |
| 9 | FS generation follows architecture | P5 |
| 10 | Existing functionality intact | All sprints additive; legacy paths preserved |
