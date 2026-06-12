"""
Rule Engine Tests — Sprint 3.13A

Validates the rule execution engine: condition evaluation, rule evaluation,
batch execution, issue scoring, and metrics validation.
"""
import pytest

from app.services.rule_engine import (
    ConditionResult,
    RuleResult,
    evaluate_all_rules,
    evaluate_condition,
    evaluate_rule,
    score_issue,
    summarize_triggered,
    validate_metrics,
)
from app.data.metric_catalog import METRIC_CATALOG, QUALITATIVE_FLAGS, ALL_KNOWN_METRICS


# ---------------------------------------------------------------------------
# Metric Catalog
# ---------------------------------------------------------------------------

class TestMetricCatalog:
    def test_catalog_has_quantitative_metrics(self):
        assert len(METRIC_CATALOG) >= 40

    def test_qualitative_flags_nonempty(self):
        assert len(QUALITATIVE_FLAGS) >= 100

    def test_all_known_metrics_union(self):
        assert ALL_KNOWN_METRICS == frozenset(METRIC_CATALOG.keys()) | QUALITATIVE_FLAGS

    def test_catalog_entries_have_description_and_unit(self):
        for key, meta in METRIC_CATALOG.items():
            assert "description" in meta, f"{key} missing description"
            assert "unit" in meta, f"{key} missing unit"

    def test_known_metrics_present(self):
        for m in ("revenue", "current_ratio", "gross_margin_pct", "dso", "beneish_m_score"):
            assert m in METRIC_CATALOG

    def test_qualitative_flags_are_strings(self):
        assert all(isinstance(f, str) for f in QUALITATIVE_FLAGS)


# ---------------------------------------------------------------------------
# evaluate_condition — threshold operators
# ---------------------------------------------------------------------------

class TestEvaluateConditionThreshold:
    def _cond(self, metric, op, value, comparison_metric=None):
        return {"metric": metric, "operator": op, "value": value, "unit": "ratio",
                "comparison_metric": comparison_metric}

    def test_gt_triggered(self):
        r = evaluate_condition(self._cond("current_ratio", "gt", 1.0), {"current_ratio": 1.5})
        assert r.triggered is True
        assert r.magnitude == pytest.approx(0.5)

    def test_gt_not_triggered(self):
        r = evaluate_condition(self._cond("current_ratio", "gt", 1.0), {"current_ratio": 0.9})
        assert r.triggered is False

    def test_lt_triggered(self):
        r = evaluate_condition(self._cond("current_ratio", "lt", 1.0), {"current_ratio": 0.8})
        assert r.triggered is True
        assert r.magnitude == pytest.approx(0.2)

    def test_gte_boundary(self):
        r = evaluate_condition(self._cond("dso", "gte", 45.0), {"dso": 45.0})
        assert r.triggered is True

    def test_lte_boundary(self):
        r = evaluate_condition(self._cond("dso", "lte", 45.0), {"dso": 45.0})
        assert r.triggered is True

    def test_missing_metric_not_triggered(self):
        r = evaluate_condition(self._cond("current_ratio", "lt", 1.0), {})
        assert r.triggered is False
        assert "not provided" in r.explanation

    def test_negative_value(self):
        r = evaluate_condition(self._cond("cash", "lt", 0.0), {"cash": -5000.0})
        assert r.triggered is True


# ---------------------------------------------------------------------------
# evaluate_condition — pct_change operators
# ---------------------------------------------------------------------------

class TestEvaluateConditionPctChange:
    def test_pct_change_gt_triggered(self):
        cond = {"metric": "revenue", "operator": "pct_change_gt", "value": 25.0, "unit": "percent"}
        r = evaluate_condition(cond, {"revenue_pct_change": 40.0})
        assert r.triggered is True
        assert r.magnitude == pytest.approx(15.0)

    def test_pct_change_lt_triggered(self):
        cond = {"metric": "revenue", "operator": "pct_change_lt", "value": -10.0, "unit": "percent"}
        r = evaluate_condition(cond, {"revenue_pct_change": -20.0})
        assert r.triggered is True

    def test_pct_change_missing_key(self):
        cond = {"metric": "revenue", "operator": "pct_change_gt", "value": 25.0, "unit": "percent"}
        r = evaluate_condition(cond, {"revenue": 1000000})
        assert r.triggered is False

    def test_pct_change_at_threshold_not_triggered(self):
        cond = {"metric": "revenue", "operator": "pct_change_gt", "value": 25.0, "unit": "percent"}
        r = evaluate_condition(cond, {"revenue_pct_change": 25.0})
        assert r.triggered is False  # gt, not gte


# ---------------------------------------------------------------------------
# evaluate_condition — spread operators
# ---------------------------------------------------------------------------

class TestEvaluateConditionSpread:
    def _spread_cond(self, metric, comparison, op, value):
        return {"metric": metric, "operator": op, "value": value, "unit": "pp",
                "comparison_metric": comparison}

    def test_spread_gt_triggered(self):
        r = evaluate_condition(
            self._spread_cond("accounts_receivable", "revenue", "spread_gt", 15.0),
            {"accounts_receivable_pct_change": 50.0, "revenue_pct_change": 10.0},
        )
        assert r.triggered is True
        assert r.magnitude == pytest.approx(25.0)  # spread=40, threshold=15, excess=25

    def test_spread_gt_not_triggered(self):
        r = evaluate_condition(
            self._spread_cond("accounts_receivable", "revenue", "spread_gt", 15.0),
            {"accounts_receivable_pct_change": 20.0, "revenue_pct_change": 15.0},
        )
        assert r.triggered is False  # spread=5, threshold=15

    def test_spread_missing_comparison(self):
        r = evaluate_condition(
            self._spread_cond("inventory", "cogs", "spread_gt", 10.0),
            {"inventory_pct_change": 30.0},
        )
        assert r.triggered is False

    def test_spread_negative_spread_not_triggered_for_gt(self):
        r = evaluate_condition(
            self._spread_cond("inventory", "cogs", "spread_gt", 10.0),
            {"inventory_pct_change": 5.0, "cogs_pct_change": 20.0},
        )
        assert r.triggered is False  # spread = -15, threshold = 10


# ---------------------------------------------------------------------------
# evaluate_condition — ratio operators
# ---------------------------------------------------------------------------

class TestEvaluateConditionRatio:
    def test_ratio_lt_triggered(self):
        cond = {"metric": "capex", "operator": "ratio_lt", "value": 0.5, "unit": "ratio",
                "comparison_metric": "depreciation"}
        r = evaluate_condition(cond, {"capex": 40000.0, "depreciation": 200000.0})
        assert r.triggered is True  # 0.2 < 0.5

    def test_ratio_gt_triggered(self):
        cond = {"metric": "operating_cash_flow", "operator": "ratio_lt", "value": 0.7, "unit": "ratio",
                "comparison_metric": "net_income"}
        r = evaluate_condition(cond, {"operating_cash_flow": 50000.0, "net_income": 100000.0})
        assert r.triggered is True  # 0.5 < 0.7

    def test_ratio_zero_denominator_not_triggered(self):
        cond = {"metric": "capex", "operator": "ratio_lt", "value": 0.5, "unit": "ratio",
                "comparison_metric": "depreciation"}
        r = evaluate_condition(cond, {"capex": 40000.0, "depreciation": 0.0})
        assert r.triggered is False


# ---------------------------------------------------------------------------
# evaluate_condition — existence operators
# ---------------------------------------------------------------------------

class TestEvaluateConditionExistence:
    def test_exists_triggered(self):
        cond = {"metric": "ghost_vendor_indicators", "operator": "exists", "unit": "flag"}
        r = evaluate_condition(cond, {"ghost_vendor_indicators": True})
        assert r.triggered is True

    def test_exists_not_triggered_when_absent(self):
        cond = {"metric": "ghost_vendor_indicators", "operator": "exists", "unit": "flag"}
        r = evaluate_condition(cond, {})
        assert r.triggered is False

    def test_exists_not_triggered_when_false(self):
        cond = {"metric": "ghost_vendor_indicators", "operator": "exists", "unit": "flag"}
        r = evaluate_condition(cond, {"ghost_vendor_indicators": False})
        assert r.triggered is False

    def test_absent_triggered_when_missing(self):
        cond = {"metric": "physical_count_not_documented", "operator": "absent", "unit": "flag"}
        r = evaluate_condition(cond, {})
        assert r.triggered is True

    def test_absent_not_triggered_when_present(self):
        cond = {"metric": "physical_count_not_documented", "operator": "absent", "unit": "flag"}
        r = evaluate_condition(cond, {"physical_count_not_documented": True})
        assert r.triggered is False


# ---------------------------------------------------------------------------
# evaluate_rule
# ---------------------------------------------------------------------------

class TestEvaluateRule:
    def test_threshold_rule(self):
        rule = {"version": "1.0", "rule_type": "threshold", "metric": "current_ratio",
                "operator": "lt", "value": 1.0, "unit": "ratio"}
        triggered, mag, exp, crs = evaluate_rule(rule, {"current_ratio": 0.8})
        assert triggered is True
        assert mag == pytest.approx(0.2)

    def test_pct_change_rule(self):
        rule = {"version": "1.0", "rule_type": "pct_change", "metric": "revenue",
                "operator": "pct_change_gt", "value": 15.0, "unit": "percent"}
        triggered, mag, _, _ = evaluate_rule(rule, {"revenue_pct_change": 40.0})
        assert triggered is True
        assert mag == pytest.approx(25.0)

    def test_spread_rule(self):
        rule = {"version": "1.0", "rule_type": "spread",
                "metric": "inventory", "comparison_metric": "cogs",
                "operator": "spread_gt", "value": 15.0, "unit": "pp"}
        triggered, mag, _, _ = evaluate_rule(rule, {
            "inventory_pct_change": 40.0, "cogs_pct_change": 10.0,
        })
        assert triggered is True
        assert mag == pytest.approx(15.0)  # spread=30, threshold=15, excess=15

    def test_ratio_rule(self):
        rule = {"version": "1.0", "rule_type": "ratio",
                "metric": "capex", "comparison_metric": "depreciation",
                "operator": "ratio_lt", "value": 0.5, "unit": "ratio"}
        triggered, _, _, _ = evaluate_rule(rule, {"capex": 50000, "depreciation": 200000})
        assert triggered is True  # 0.25 < 0.5

    def test_existence_rule(self):
        rule = {"version": "1.0", "rule_type": "existence",
                "metric": "ghost_vendor_indicators", "operator": "exists", "unit": "flag"}
        triggered, mag, _, _ = evaluate_rule(rule, {"ghost_vendor_indicators": True})
        assert triggered is True
        assert mag is None

    def test_compound_and_all_true(self):
        rule = {
            "version": "1.0", "rule_type": "compound", "logic": "AND",
            "conditions": [
                {"metric": "net_income", "operator": "lt", "value": 0.0, "unit": "amount"},
                {"metric": "current_ratio", "operator": "lt", "value": 1.0, "unit": "ratio"},
            ],
        }
        triggered, _, _, crs = evaluate_rule(rule, {"net_income": -50000, "current_ratio": 0.8})
        assert triggered is True
        assert all(r.triggered for r in crs)

    def test_compound_and_one_false(self):
        rule = {
            "version": "1.0", "rule_type": "compound", "logic": "AND",
            "conditions": [
                {"metric": "net_income", "operator": "lt", "value": 0.0, "unit": "amount"},
                {"metric": "current_ratio", "operator": "lt", "value": 1.0, "unit": "ratio"},
            ],
        }
        triggered, _, _, _ = evaluate_rule(rule, {"net_income": 50000, "current_ratio": 0.8})
        assert triggered is False

    def test_compound_or_one_true(self):
        rule = {
            "version": "1.0", "rule_type": "compound", "logic": "OR",
            "conditions": [
                {"metric": "effective_tax_rate", "operator": "lt", "value": 10.0, "unit": "percent"},
                {"metric": "effective_tax_rate", "operator": "gt", "value": 45.0, "unit": "percent"},
            ],
        }
        triggered, _, _, _ = evaluate_rule(rule, {"effective_tax_rate": 5.0})
        assert triggered is True

    def test_compound_or_none_true(self):
        rule = {
            "version": "1.0", "rule_type": "compound", "logic": "OR",
            "conditions": [
                {"metric": "effective_tax_rate", "operator": "lt", "value": 10.0, "unit": "percent"},
                {"metric": "effective_tax_rate", "operator": "gt", "value": 45.0, "unit": "percent"},
            ],
        }
        triggered, _, _, _ = evaluate_rule(rule, {"effective_tax_rate": 25.0})
        assert triggered is False

    def test_condition_results_returned(self):
        rule = {
            "version": "1.0", "rule_type": "compound", "logic": "AND",
            "conditions": [
                {"metric": "net_income", "operator": "lt", "value": 0.0, "unit": "amount"},
                {"metric": "current_ratio", "operator": "lt", "value": 1.0, "unit": "ratio"},
            ],
        }
        _, _, _, crs = evaluate_rule(rule, {"net_income": -1000, "current_ratio": 0.8})
        assert len(crs) == 2
        assert all(isinstance(cr, ConditionResult) for cr in crs)


# ---------------------------------------------------------------------------
# score_issue
# ---------------------------------------------------------------------------

class TestScoreIssue:
    def test_not_triggered_is_zero(self):
        assert score_issue("critical", 100.0, "threshold", False) == 0

    def test_critical_base_80(self):
        assert score_issue("critical", None, "existence", True) == 80

    def test_high_base_60(self):
        assert score_issue("high", None, "existence", True) == 60

    def test_moderate_base_40(self):
        assert score_issue("moderate", None, "existence", True) == 40

    def test_low_base_20(self):
        assert score_issue("low", None, "existence", True) == 20

    def test_magnitude_bonus_capped_at_20(self):
        # magnitude 1000 → bonus = min(20, int(1000/5)) = 20
        score = score_issue("high", 1000.0, "threshold", True)
        assert score == 80

    def test_magnitude_bonus_partial(self):
        # magnitude=10 → bonus=min(20,2)=2 → 60+2=62
        score = score_issue("high", 10.0, "threshold", True)
        assert score == 62

    def test_score_never_exceeds_100(self):
        score = score_issue("critical", 99999.0, "threshold", True)
        assert score <= 100

    def test_existence_rule_no_magnitude_bonus(self):
        # existence rules: no bonus regardless of magnitude parameter
        score_with = score_issue("high", 50.0, "existence", True)
        # magnitude is ignored for existence type in scoring
        assert score_with == 60  # base only

    def test_unknown_risk_level_defaults_to_moderate(self):
        score = score_issue("unknown_level", None, "existence", True)
        assert score == 40


# ---------------------------------------------------------------------------
# evaluate_all_rules
# ---------------------------------------------------------------------------

class TestEvaluateAllRules:
    def test_returns_200_results(self):
        results = evaluate_all_rules({})
        assert len(results) == 200

    def test_all_results_are_rule_result_instances(self):
        results = evaluate_all_rules({})
        assert all(isinstance(r, RuleResult) for r in results)

    def test_all_results_have_required_fields(self):
        results = evaluate_all_rules({})
        for r in results:
            assert r.code
            assert r.name
            assert r.category
            assert r.risk_level in ("low", "moderate", "high", "critical")
            assert isinstance(r.triggered, bool)
            assert isinstance(r.score, int)

    def test_empty_metrics_no_threshold_triggers(self):
        results = evaluate_all_rules({})
        threshold_triggered = [
            r for r in results
            if r.triggered and r.rule_type in ("threshold", "pct_change", "spread", "ratio")
        ]
        assert len(threshold_triggered) == 0

    def test_current_ratio_below_1_triggers_wc001(self):
        results = evaluate_all_rules({"current_ratio": 0.7})
        triggered = {r.code for r in results if r.triggered}
        assert "WC_001" in triggered

    def test_ar_growth_exceeds_revenue_triggers_ar003(self):
        results = evaluate_all_rules({
            "accounts_receivable_pct_change": 80.0,
            "revenue_pct_change": 10.0,
        })
        triggered = {r.code for r in results if r.triggered}
        assert "AR_003" in triggered

    def test_dso_over_45_triggers_ar002(self):
        results = evaluate_all_rules({"dso": 60.0})
        triggered = {r.code for r in results if r.triggered}
        assert "AR_002" in triggered

    def test_debt_to_equity_over_3_triggers_debt001(self):
        results = evaluate_all_rules({"debt_to_equity": 4.0})
        triggered = {r.code for r in results if r.triggered}
        assert "DEBT_001" in triggered

    def test_existence_flag_triggers_ap003(self):
        results = evaluate_all_rules({"ghost_vendor_indicators": True})
        triggered = {r.code for r in results if r.triggered}
        assert "AP_003" in triggered

    def test_beneish_m_score_triggers_fraud005(self):
        results = evaluate_all_rules({"beneish_m_score": -1.0})
        triggered = {r.code for r in results if r.triggered}
        assert "FRAUD_005" in triggered

    def test_dscr_below_1_25_triggers_sba001(self):
        results = evaluate_all_rules({"dscr": 1.0})
        triggered = {r.code for r in results if r.triggered}
        assert "SBA_001" in triggered

    def test_custom_templates_subset(self):
        custom = [{"code": "TEST_001", "name": "Test", "category": "test", "risk_level": "moderate",
                   "detection_logic_json": {
                       "version": "1.0", "rule_type": "threshold",
                       "metric": "current_ratio", "operator": "lt", "value": 1.5, "unit": "ratio",
                   }}]
        results = evaluate_all_rules({"current_ratio": 1.0}, templates=custom)
        assert len(results) == 1
        assert results[0].triggered is True

    def test_triggered_issues_have_scores(self):
        metrics = {
            "current_ratio": 0.6,
            "dso": 90.0,
            "accounts_receivable_pct_change": 60.0,
            "revenue_pct_change": 5.0,
        }
        results = evaluate_all_rules(metrics)
        triggered = [r for r in results if r.triggered]
        assert all(r.score > 0 for r in triggered)


# ---------------------------------------------------------------------------
# summarize_triggered
# ---------------------------------------------------------------------------

class TestSummarizeTriggered:
    def test_summary_structure(self):
        results = evaluate_all_rules({})
        summary = summarize_triggered(results)
        assert "total_evaluated" in summary
        assert "total_triggered" in summary
        assert "by_category" in summary
        assert "by_risk_level" in summary
        assert "top_scores" in summary

    def test_summary_with_triggers(self):
        results = evaluate_all_rules({
            "current_ratio": 0.5,
            "ghost_vendor_indicators": True,
            "dso": 120.0,
        })
        summary = summarize_triggered(results)
        assert summary["total_triggered"] >= 3
        assert summary["total_evaluated"] == 200

    def test_top_scores_at_most_10(self):
        results = evaluate_all_rules({
            k: True for k in list(QUALITATIVE_FLAGS)[:20]
        })
        summary = summarize_triggered(results)
        assert len(summary["top_scores"]) <= 10


# ---------------------------------------------------------------------------
# validate_metrics
# ---------------------------------------------------------------------------

class TestValidateMetrics:
    def test_empty_metrics_no_warnings(self):
        result = validate_metrics({})
        assert result["provided"] == 0
        assert result["warning"] is None

    def test_known_metrics_no_unknowns(self):
        result = validate_metrics({"current_ratio": 1.2, "revenue": 500000})
        assert result["unknown_keys"] == []
        assert result["warning"] is None

    def test_pct_change_variants_accepted(self):
        result = validate_metrics({"revenue_pct_change": 15.0, "inventory_pct_change": 30.0})
        assert result["unknown_keys"] == []

    def test_qualitative_flags_accepted(self):
        result = validate_metrics({"ghost_vendor_indicators": True})
        assert result["unknown_keys"] == []

    def test_unknown_key_flagged(self):
        result = validate_metrics({"some_unknown_metric_xyz": 99.0})
        assert "some_unknown_metric_xyz" in result["unknown_keys"]
        assert result["warning"] is not None

    def test_provided_count_correct(self):
        result = validate_metrics({"revenue": 1000, "cogs": 600, "gross_margin_pct": 40.0})
        assert result["provided"] == 3


# ---------------------------------------------------------------------------
# Integration: evaluate_all_rules with ISSUE_REPOSITORY codes
# ---------------------------------------------------------------------------

class TestEvaluateAllRulesIntegration:
    def test_all_200_codes_represented(self):
        results = evaluate_all_rules({})
        codes = {r.code for r in results}
        from app.data.issue_repository_data import ISSUE_REPOSITORY
        expected = {t["code"] for t in ISSUE_REPOSITORY if t.get("detection_logic_json")}
        assert codes == expected

    def test_ocf_to_net_income_ratio_triggers_cash008(self):
        results = evaluate_all_rules({
            "operating_cash_flow": 50000.0,
            "net_income": 200000.0,
        })
        triggered = {r.code for r in results if r.triggered}
        assert "CASH_008" in triggered

    def test_capex_depreciation_ratio_triggers_fa006(self):
        results = evaluate_all_rules({"capex": 30000.0, "depreciation": 200000.0})
        triggered = {r.code for r in results if r.triggered}
        assert "FA_006" in triggered

    def test_inventory_cogs_spread_triggers_inv001(self):
        results = evaluate_all_rules({
            "inventory_pct_change": 50.0,
            "cogs_pct_change": 5.0,
        })
        triggered = {r.code for r in results if r.triggered}
        assert "INV_001" in triggered

    def test_accrual_ratio_triggers_qoe001(self):
        results = evaluate_all_rules({"accrual_ratio": 0.10})
        triggered = {r.code for r in results if r.triggered}
        assert "QOE_001" in triggered

    def test_ccc_high_triggers_wc007(self):
        results = evaluate_all_rules({"ccc": 100.0})
        triggered = {r.code for r in results if r.triggered}
        assert "WC_007" in triggered
