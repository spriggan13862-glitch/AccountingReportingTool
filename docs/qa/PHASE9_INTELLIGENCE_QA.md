# Phase 9 Accounting Intelligence QA Report

**Date:** 2026-06-15  
**Branch:** tier-3-accounting-intelligence-repository  
**Scope:** Sprint 4.0 Phase 9 — deterministic intelligence engine, three-path detection, materiality engine, trend engine, adjustment analysis, `/intelligence` page  
**Method:** Code-level audit + pytest (29 tests)

---

## Summary

| # | Verification Point | Result |
|---|---|---|
| 1 | Run Review works with comparison period | PASS |
| 2 | Run Review works without comparison period | PASS with caveat |
| 3 | Findings persist to `detected_issues` | PASS |
| 4 | Findings show source rule/template metadata | PARTIAL |
| 5 | Findings show suggested procedures | PASS |
| 6 | Findings show potential AJE guidance | PASS |
| 7 | Duplicate findings deduped by `issue_code` | PASS |
| 8 | Same entity/period can be rerun without corrupting results | **FAIL** |
| 9 | Materiality tab loads | PASS with caveat |
| 10 | Trends tab loads | PASS |
| 11 | Adjustments tab loads | PASS |

**Defects found:** 1 critical, 3 medium, 3 low  
**Tests run:** `pytest tests/test_accounting_intelligence.py tests/test_materiality_engine.py tests/test_trend_engine.py tests/test_adjustment_analysis.py` — all 29 pass

---

## Verification Detail

### 1. Run Review works with comparison period — PASS

`run_detection()` accepts `comparison_period_id: int | None`. When a comparison period is provided, all three detection paths execute:

- **Path 1**: 10 hardcoded comparison-period rule functions (`_ALL_RULES` list)
- **Path 2**: 200 repository rules via `evaluate_all_rules(metrics_dict)` with full pct_change fields populated
- **Path 3**: `run_single_period_detection()` for account-level anomalies

`_build_metrics_dict(cur, pri)` computes percentage changes, trend labels, and qualitative flags for all 18 `PeriodMetrics` fields. Rules that require `revenue_pct_change`, `ar_pct_change`, etc. receive real values.

API: `POST /accounting-intelligence/run-detection?entity_id=N&current_period_id=N&comparison_period_id=N` — returns `{entity_id, current_period_id, comparison_period_id, total_issues, issues[]}`.

### 2. Run Review works without comparison period — PASS with caveat

When `comparison_period_id` is omitted, Path 1 is skipped entirely (`if comparison_period is not None`). `pri = cur` is used, so all `pct_change` fields are 0% and trend labels are "stable". Repository rules with `pct_change` conditions will not fire. Only threshold/existence/sign-based rules from the repository and all of Path 3 will fire.

**Caveat (DEFECT-04):** The frontend shows no messaging when no comparison period is selected. The user receives fewer findings with no explanation of why — a silent degradation. See DEFECT-04.

### 3. Findings persist to `detected_issues` — PASS

When `persist=True` (the default from the API endpoint), `run_detection()` calls `db.add(row)` for each `DetectedIssue` and commits once at the end. The function then re-queries by `run_id` to return the database-confirmed rows including `id`, `created_at`, and all serialized fields.

`list_detected_issues()` at `GET /accounting-intelligence/issues` queries the `detected_issues` table with filters for `entity_id` and optionally `current_period_id`, confirming persistence across requests.

### 4. Findings show source rule/template metadata — PARTIAL

**Hardcoded rules (Path 1):** Each `DetectionResult` has `issue_code`, `category`, `severity`, `title`, `description`, `detection_trigger` (human-readable explanation of why it fired, e.g. "AR change (+18.2%) exceeded revenue change (+3.1%) by 15.1pp, threshold is 10pp"), `suggested_procedures`, `suggested_ajes`. All fields populated.

**Repository rules (Path 2):** Template metadata (`title`, `description`, `category`, `severity`, `suggested_procedures`, `suggested_ajes`) pulled from `ISSUE_REPOSITORY` via `template_by_code`. `detection_trigger` is set to `result.message` from the `RuleResult`. Fields are populated.

**Single-period rules (Path 3):** `detection_trigger`, `suggested_procedures`, `suggested_ajes` all populated inline in `run_single_period_detection()`.

**Defect (DEFECT-05):** `management_questions` is always `None` across all three paths. The template files (`DISC_disclosures.py` and all 25 other category files) include `management_questions` arrays. This data is never read from templates or mapped into `DetectedIssue.management_questions`. The column exists and is nullable by design for future AI use, but template-provided questions could be populated deterministically today.

### 5. Findings show suggested procedures — PASS

All three detection paths populate `suggested_procedures` as multi-line numbered strings (e.g., "1. Obtain aged AR schedule...\n2. Confirm revenue recognition timing..."). The `_serialize_issue()` function returns this field. `IntelligenceDashboardPage.tsx` renders it in the `FindingDetail` expanded view.

### 6. Findings show potential AJE guidance — PASS

`suggested_ajes` is populated across all three paths with "Consider: AJE to..." guidance. Returned in the serialized issue dict and rendered in the detail panel.

### 7. Duplicate findings deduped by `issue_code` — PASS

`triggered_codes: set[str]` is initialized from Path 1 results. Before adding any Path 2 or Path 3 finding, the code checks `if rr.code in triggered_codes: continue` / `if f["issue_code"] in triggered_codes: continue`. Within a single `run_detection()` call, no `issue_code` appears more than once in the output.

### 8. Same entity/period can be rerun without corrupting results — FAIL

**See DEFECT-01 (Critical).**

`run_detection()` generates a new `run_id = str(uuid.uuid4())` on every call. It inserts new `DetectedIssue` rows without deleting or superseding prior rows for the same `(entity_id, current_period_id)`. `list_detected_issues()` queries with no `run_id` filter, returning all rows across all runs.

**Effect:** Clicking "Run Review" N times results in N×findings in the issues list. Deduplication within a single run (point 7) does not prevent accumulation across runs.

### 9. Materiality tab loads — PASS with caveat

`GET /accounting-intelligence/materiality?entity_id=N&period_id=N` calls `_compute_metrics()` to get actual revenue, assets, equity, and net income. These four real values are passed to `MaterialityEngine.compute()`.

**Caveat (DEFECT-06):** EBITDA is not computed from actual data. The router uses `ebitda = max(rev * 0.10, ni or 0.0)` — a rough proxy rather than EBITDA derived from the financial statements (operating income + D&A). The `ebitda_basis` output in the materiality response reflects this approximation. This affects the accuracy of the AICPA blended benchmark for entities where EBITDA differs materially from 10% of revenue.

The same proxy appears in the review-package endpoint: `ebitda_approx = max(float(metrics.revenue) * 0.10, float(metrics.net_income))`.

**Caveat (DEFECT-07):** When no financial data exists for the entity/period, `MaterialityEngine.compute()` is called with all zeros, and the $10K floor applies. The response shows threshold values with no indication that they are floor values driven by missing data, not actual financial metrics.

### 10. Trends tab loads — PASS

`GET /accounting-intelligence/trends?entity_id=N&period_ids=A,B,C` parses the comma-separated `period_ids` string, requires ≥ 2 periods (returns 422 otherwise), and calls `TrendEngine.analyze()`. The frontend passes `periodIds.join(',')` when at least two periods are selected. The response includes `has_sufficient_data`, 14 metric series, 10 concern rules with triggered/not-triggered status, and an `advisory_message` when data is insufficient.

### 11. Adjustments tab loads — PASS

`GET /accounting-intelligence/adjustment-analysis?entity_id=N&period_id=N` calls `analyze_adjustments()`. The service loads `JournalEntry` rows with `status='posted'` and `overlay_group` set, loads their lines via a separate `JournalEntryLine` query (no `JournalEntry.lines` relationship exists on the ORM model), and caches lines as `je._lines_cache`. Returns classification breakdown by `overlay_group`, NI impact, materiality flags, concentration analysis, and trend data.

---

## Defect Register

### DEFECT-01 — CRITICAL: Rerun accumulation corrupts findings list

**QA Point:** 8  
**File:** `app/services/accounting_intelligence_service.py:1466`, `app/services/accounting_intelligence_service.py:1629`

**Description:** Each call to `run_detection(persist=True)` inserts new `DetectedIssue` rows with a fresh `run_id`. `list_detected_issues()` applies no `run_id` filter, so it returns issues from all historical runs for the entity/period. Clicking "Run Review" N times multiplies findings N-fold in the UI.

**Evidence:**
```python
# run_detection() — new run_id every call
run_id = str(uuid.uuid4())
# ... inserts rows ...
db.commit()

# list_detected_issues() — no run_id filter
q = db.query(DetectedIssue).filter(DetectedIssue.entity_id == entity_id)
if current_period_id:
    q = q.filter(DetectedIssue.current_period_id == current_period_id)
# returns ALL rows across all runs
```

**Impact:** The user sees e.g. 14 findings after run 1, 28 after run 2, 42 after run 3. Acknowledging a finding from run 1 does not prevent its duplicate from run 2 from appearing as "open".

**Fix options (not implemented — per QA-only scope):**
- Delete all existing rows for `(entity_id, current_period_id)` before inserting new run's rows, OR
- Store the latest `run_id` per `(entity_id, current_period_id)` and filter `list_detected_issues()` to the latest run only, OR
- Add a `superseded_by_run_id` column and soft-delete prior rows on re-run

---

### DEFECT-02 — MEDIUM: Exception swallowing in Paths 2 and 3 masks failures silently

**QA Point:** 1, 2  
**File:** `app/services/accounting_intelligence_service.py:1509–1524`, `1528–1560`

**Description:** Both the repository rule path and the single-period detection path are wrapped in bare `except Exception: pass`. If either path throws (e.g., a template file is malformed, a DB query fails, `_build_metrics_dict` raises), the failure is silently swallowed. The caller receives a partial result that looks complete.

**Evidence:**
```python
try:
    repo_results = evaluate_all_rules(metrics_dict)
    ...
except Exception:
    pass  # repository rules are additive — never block core detection

try:
    sp_findings = run_single_period_detection(...)
    ...
except Exception:
    pass
```

**Impact:** A bug in `evaluate_all_rules()` or any of the 200 rule evaluations would produce zero Path-2 findings with no error surfaced to the API response or logs.

---

### DEFECT-03 — MEDIUM: `management_questions` always NULL despite template data

**QA Point:** 4  
**File:** `app/services/accounting_intelligence_service.py:1406–1425`, `docs/accounting_intelligence/*.py`

**Description:** All 200 issue templates across 26 category files include a `management_questions` list. The `DetectedIssue` model has a nullable `management_questions` column reserved for this data. `_repo_rule_to_detected_issue()` sets `management_questions=None` unconditionally, ignoring the template's `management_questions` array.

**Evidence:**
```python
# Template (DISC_disclosures.py line 31):
"management_questions": [
    "Are accounting policy disclosures current and specific to the company?",
    "Have any accounting policies changed in the current period?",
]

# Service (line 1424):
management_questions=None,  # template data ignored
```

**Impact:** The intelligence engine's "management questions" capability is listed in the architecture but produces no output. An auditor using this system has no AI-or-deterministic-generated management inquiry questions to work from.

---

### DEFECT-04 — MEDIUM: No UI messaging when no comparison period is selected

**QA Point:** 2  
**File:** `frontend/src/pages/IntelligenceDashboardPage.tsx`

**Description:** When a user runs detection without selecting a comparison period, Path 1 (10 comparison rules) is skipped, and all `pct_change` fields in the metrics dict are 0%, preventing most repository rules from firing. The UI shows fewer findings than a comparative run, with no explanation.

**Impact:** A user who hasn't selected a comparison period may interpret a small finding count as "clean books" rather than "insufficient data for comparative analysis."

---

### DEFECT-05 — LOW: Type annotation mismatch — `comparison_period_id: int` accepts `None`

**QA Point:** N/A (code quality)  
**File:** `app/services/accounting_intelligence_service.py:1386`, `1584`

**Description:** `_repo_rule_to_detected_issue()` and `_serialize_result()` declare `comparison_period_id: int` but the callers pass `comparison_period_id: int | None` since it was made optional. No runtime impact (column is nullable), but the annotation is incorrect.

---

### DEFECT-06 — LOW: EBITDA is a proxy, not computed from financial statements

**QA Point:** 9  
**File:** `app/api/routers/accounting_intelligence.py:463`, `682`

**Description:** The materiality endpoint uses `ebitda = max(rev * 0.10, ni or 0.0)` as an EBITDA approximation. Actual EBITDA requires operating income + depreciation + amortization, which are derivable from posted JEs using account classifications. The proxy is accurate only when EBITDA ≈ 10% of revenue.

**Impact:** The `ebitda_basis` line in the materiality response is unreliable for capital-intensive businesses where D&A is material. The AICPA blended benchmark will underweight or overweight the EBITDA component.

---

### DEFECT-07 — LOW: $10K floor materiality shows no warning when financial data is missing

**QA Point:** 9  
**File:** `app/api/routers/accounting_intelligence.py:465–471`, `app/services/materiality_engine.py`

**Description:** When an entity/period has no financial data, `_compute_metrics()` returns zeros for all fields. `MaterialityEngine.compute(revenue=0, total_assets=0, equity=0, ebitda=0, net_income=None)` applies the $10K floor and returns a valid-looking profile. The response contains no `data_available: false` flag or warning that the thresholds are floor values.

**Impact:** The materiality tab appears to produce real thresholds even when there is no financial data to base them on. A user cannot distinguish a computed threshold from a floor threshold.

---

## Non-Defects Confirmed

The following items were investigated and confirmed correct:

- **Deduplication within a run** (point 7): `triggered_codes` set is maintained across all three paths correctly
- **`suggested_procedures` and `suggested_ajes`** (points 5–6): populated for all three detection paths; template arrays are joined with `\n` bullets correctly in `_repo_rule_to_detected_issue()`
- **`detection_trigger`** field: contains a human-readable explanation for all issue types (not just a code)
- **`supporting_metrics_json`** field: stores the raw metric values that caused the rule to fire
- **`affected_accounts_json`** field: populated by single-period rules (Path 3) for account-specific findings
- **Trend engine ≥2 period guard**: returns `has_sufficient_data: false` with `advisory_message` when fewer than 2 periods are provided — does not crash
- **Adjustment analysis `_lines_cache` pattern**: correctly loads `JournalEntryLine` rows via separate query and caches on JE object — no `AttributeError`
- **Frontend handles both response shapes**: `Array.isArray(issuesData) ? issuesData : issuesData?.issues ?? []` correctly handles the router's `{issues: [...]}` wrapper and any direct array fallback
- **`comparison_period_id` optional on API**: correctly omitted from URL params when `null` (`if (params.comparison_period_id != null) p.set(...)`)

---

## Test Coverage

| Test file | Tests | Result |
|---|---|---|
| `tests/test_accounting_intelligence.py` | 29 | All pass |
| `tests/test_materiality_engine.py` | 14 | All pass |
| `tests/test_trend_engine.py` | 13 | All pass |
| `tests/test_adjustment_analysis.py` | 13 | All pass |

Pre-existing frontend test failures (unrelated to Phase 9):
- `frontend/src/test/adjustment_workspace.test.tsx` — 2 failures (pre-existing)
- `frontend/src/test/advisory_analysis.test.tsx` — 2 failures (pre-existing)
- `frontend/src/test/deliverables_workspace.test.tsx` — 2 failures (pre-existing)
