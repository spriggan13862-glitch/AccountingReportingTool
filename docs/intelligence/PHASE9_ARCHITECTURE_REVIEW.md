# Phase 9 Architecture Review — Accounting Intelligence Engine

## What Existed Before Phase 9

The Accounting Intelligence Engine entered Phase 9 with a substantial foundation:

**Detection infrastructure (Phases 3.12–3.14)**
- `accounting_intelligence_service.py` — `PeriodMetrics` dataclass aggregating 15+ financial metrics from posted journal entries; `_compute_metrics()` producing a fully-populated snapshot for any entity/period pair; `run_detection()` running all rules and persisting `DetectedIssue` rows.
- `rule_engine.py` — `evaluate_all_rules()`, `evaluate_condition()`, and `score_issue()` providing condition evaluation against JSON-encoded detection logic.
- `issue_template_service.py` — CRUD layer for the `IssueTemplate` table, allowing templates to be activated, deactivated, and filtered by category.
- `quarterly_review_service.py` — `generate_review()` producing an 8-section structured report (executive summary, income statement analysis, balance sheet analysis, cash flow, ratios, AJE summary, issues, recommendations) with Markdown and Excel export.

**Repository layer (Phase 3.13)**
- 203 issue templates across 26 detection categories with fully normalized `detection_logic_json` on every template.

**Rule counts by category:**
REV=12, AR=10, INV=10, CASH=8, AP=10, ACL=9, FA=10, IA=8, LEASE=9, DEBT=10, EQ=9, TAX=8, PAY=10, WC=8, GM=8, OPEX=9, EBITDA=8, QOE=11, SBA=8, RP=8, CF=7, FR=6, DISC=6, PRES=5, FRAUD=10, IND=7 — **203 total templates**.

**API surface (pre-Phase 9)**
Eight endpoints: run-detection, list-issues, update-issue, issue diagnostics, template repository (list, detail, activate/deactivate), quarterly-review generate and export.

---

## What Phase 9 Adds

**Materiality Engine (`materiality_engine.py`)**
Implements the AICPA blended benchmark approach. Five financial bases are computed (revenue at 0.5%, total assets at 0.5%, equity at 3%, EBITDA at 7%, net income at 5%) and averaged to produce a `MaterialityProfile` with overall, performance (75%), and trivial (3%) thresholds. A `classify_amount()` helper maps any dollar amount to critical/high/moderate/low/trivial severity bands. A $10,000 floor prevents materiality from collapsing to zero for pre-revenue entities.

**Trend Engine (`trend_engine.py`)**
Multi-period financial trend analysis operating on lists of `PeriodMetrics` objects. Computes year-over-year and recent-period percentage change for 14 financial metrics, assigns direction (increasing/decreasing/stable/volatile), and applies 10 concern rules with configurable thresholds (e.g., gross margin compression >3pp, revenue decline >10%, AR growth >30%). Returns a `TrendReport` with up to 10 prioritized key concerns.

**Adjustment Analysis Service (`adjustment_analysis_service.py`)**
Pattern detection across journal entries. Identifies three structural patterns: revenue adjustment concentration (>=3 posted AJEs touching revenue accounts), unposted AJE backlog (>=3 draft/pending entries), and single-entry dominance (one AJE representing >=50% of total posted adjustments). Cross-references against materiality to surface large individual entries requiring additional scrutiny.

**Four new API endpoints**
- `GET /intelligence/materiality` — per-entity/period materiality profile with all basis calculations and severity thresholds
- `GET /intelligence/trends` — comma-separated period IDs, returns full trend dataset and concern list
- `GET /intelligence/adjustment-analysis` — AJE pattern report for any entity/as-of-date combination
- `GET /intelligence/review-package` — single-call snapshot combining detection findings, materiality profile, and AJE summary for dashboard consumption

---

## Architecture Gaps Addressed by Phase 9

1. **No materiality context** — issue severity was relative, not anchored to GAAP materiality thresholds. Phase 9 fixes this.
2. **No longitudinal view** — the engine operated on a single period pair. Trend analysis now spans arbitrary period ranges.
3. **AJE blind spot** — the quarterly review included a static AJE count but no pattern detection. Phase 9 adds structural pattern identification.
4. **Dashboard integration gap** — fetching a complete intelligence snapshot required four separate API calls. The review-package endpoint reduces this to one.

---

## Remaining Gaps and Phase 10 Recommendations

1. **LLM narrative layer** — `DetectedIssue.narrative_prompt` and `narrative_output` columns are populated as empty strings. Phase 10 should wire a Claude API call to auto-generate finding narratives and management questions using the stored `narrative_prompt` field.
2. **Trend persistence** — trend results are computed on demand and not cached. For entities with 8+ periods this can be slow. Phase 10 should introduce a `TrendSnapshot` table populated by a background task.
3. **Materiality override** — auditors frequently override the blended materiality figure. A `MaterialityOverride` table (entity, period, override_amount, rationale, set_by) would allow the computed figure to be superseded without code changes.
4. **Rule engine feedback loop** — false positive rate per template is not tracked. Phase 10 should record user dispositions (accepted/rejected/overridden) on `DetectedIssue` and surface this as a template quality score in the repository UI.
5. **IND (industry benchmarking) category** — 7 templates exist but no benchmark data source is wired. Phase 10 should integrate an industry benchmark API (e.g., BLS, RMA) to populate comparison values dynamically.
