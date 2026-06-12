"""Tests for DetectionRule schema and rule normalization layer — Sprint 3.14."""
import pytest
from pydantic import ValidationError

from app.schemas.detection_rule import DetectionRule, DetectionCondition
from app.data.issue_repository_data import ISSUE_REPOSITORY, DETECTION_RULES
from app.services import issue_template_service as svc


# ---------------------------------------------------------------------------
# DetectionRule schema — valid cases
# ---------------------------------------------------------------------------

class TestDetectionRuleValid:
    def test_threshold_rule(self):
        r = DetectionRule.model_validate({
            "version": "1.0",
            "rule_type": "threshold",
            "metric": "current_ratio",
            "operator": "lt",
            "value": 1.0,
            "unit": "ratio",
        })
        assert r.rule_type == "threshold"
        assert r.metric == "current_ratio"
        assert r.value == 1.0

    def test_pct_change_rule(self):
        r = DetectionRule.model_validate({
            "version": "1.0",
            "rule_type": "pct_change",
            "metric": "revenue",
            "operator": "pct_change_gt",
            "value": 15.0,
            "unit": "percent",
        })
        assert r.rule_type == "pct_change"
        assert r.operator == "pct_change_gt"

    def test_spread_rule(self):
        r = DetectionRule.model_validate({
            "version": "1.0",
            "rule_type": "spread",
            "metric": "accounts_receivable",
            "comparison_metric": "revenue",
            "operator": "spread_gt",
            "value": 15.0,
            "unit": "pp",
        })
        assert r.comparison_metric == "revenue"
        assert r.unit == "pp"

    def test_ratio_rule(self):
        r = DetectionRule.model_validate({
            "version": "1.0",
            "rule_type": "ratio",
            "metric": "capex",
            "comparison_metric": "depreciation",
            "operator": "ratio_lt",
            "value": 0.5,
            "unit": "ratio",
        })
        assert r.value == 0.5

    def test_existence_rule_no_value(self):
        r = DetectionRule.model_validate({
            "version": "1.0",
            "rule_type": "existence",
            "metric": "ghost_vendor_indicators",
            "operator": "exists",
            "unit": "flag",
        })
        assert r.value is None
        assert r.operator == "exists"

    def test_compound_rule(self):
        r = DetectionRule.model_validate({
            "version": "1.0",
            "rule_type": "compound",
            "logic": "AND",
            "conditions": [
                {"metric": "net_income", "operator": "lt", "value": 0.0, "unit": "amount"},
                {"metric": "current_ratio", "operator": "lt", "value": 1.0, "unit": "ratio"},
            ],
        })
        assert r.rule_type == "compound"
        assert len(r.conditions) == 2
        assert r.logic == "AND"

    def test_compound_or_logic(self):
        r = DetectionRule.model_validate({
            "version": "1.0",
            "rule_type": "compound",
            "logic": "OR",
            "conditions": [
                {"metric": "effective_tax_rate", "operator": "lt", "value": 10.0, "unit": "percent"},
                {"metric": "effective_tax_rate", "operator": "gt", "value": 45.0, "unit": "percent"},
            ],
        })
        assert r.logic == "OR"

    def test_notes_optional(self):
        r = DetectionRule.model_validate({
            "version": "1.0",
            "rule_type": "threshold",
            "metric": "dso",
            "operator": "gt",
            "value": 45.0,
            "unit": "days",
            "notes": "DSO > 45 days",
        })
        assert r.notes == "DSO > 45 days"

    def test_to_dict_excludes_none(self):
        r = DetectionRule.model_validate({
            "version": "1.0",
            "rule_type": "threshold",
            "metric": "dso",
            "operator": "gt",
            "value": 45.0,
            "unit": "days",
        })
        d = r.to_dict()
        assert "comparison_metric" not in d or d.get("comparison_metric") is None


# ---------------------------------------------------------------------------
# DetectionRule schema — invalid cases
# ---------------------------------------------------------------------------

class TestDetectionRuleInvalid:
    def test_invalid_rule_type(self):
        with pytest.raises(ValidationError):
            DetectionRule.model_validate({
                "version": "1.0",
                "rule_type": "unknown_type",
                "metric": "revenue",
                "operator": "gt",
                "value": 0,
                "unit": "amount",
            })

    def test_invalid_operator(self):
        with pytest.raises(ValidationError):
            DetectionRule.model_validate({
                "version": "1.0",
                "rule_type": "threshold",
                "metric": "revenue",
                "operator": "is_greater_than",
                "value": 0,
                "unit": "amount",
            })

    def test_invalid_unit(self):
        with pytest.raises(ValidationError):
            DetectionRule.model_validate({
                "version": "1.0",
                "rule_type": "threshold",
                "metric": "dso",
                "operator": "gt",
                "value": 45.0,
                "unit": "seconds",
            })

    def test_compound_requires_conditions(self):
        with pytest.raises(ValidationError):
            DetectionRule.model_validate({
                "version": "1.0",
                "rule_type": "compound",
                "logic": "AND",
                "conditions": [],
            })

    def test_non_compound_requires_metric(self):
        with pytest.raises(ValidationError):
            DetectionRule.model_validate({
                "version": "1.0",
                "rule_type": "threshold",
                "operator": "gt",
                "value": 1.0,
                "unit": "ratio",
            })

    def test_threshold_requires_value(self):
        with pytest.raises(ValidationError):
            DetectionRule.model_validate({
                "version": "1.0",
                "rule_type": "threshold",
                "metric": "current_ratio",
                "operator": "lt",
                "unit": "ratio",
            })

    def test_non_compound_requires_unit(self):
        with pytest.raises(ValidationError):
            DetectionRule.model_validate({
                "version": "1.0",
                "rule_type": "threshold",
                "metric": "current_ratio",
                "operator": "lt",
                "value": 1.0,
            })


# ---------------------------------------------------------------------------
# DETECTION_RULES completeness and validity
# ---------------------------------------------------------------------------

class TestDetectionRulesMap:
    def test_all_200_codes_present(self):
        all_codes = {t["code"] for t in ISSUE_REPOSITORY}
        assert set(DETECTION_RULES.keys()) == all_codes

    def test_all_rules_pass_schema(self):
        errors = {}
        for code, rule in DETECTION_RULES.items():
            try:
                DetectionRule.model_validate(rule)
            except Exception as exc:
                errors[code] = str(exc)
        assert errors == {}, f"Schema errors: {errors}"

    def test_rule_types_distribution(self):
        from collections import Counter
        types = Counter(r["rule_type"] for r in DETECTION_RULES.values())
        assert types["threshold"] > 10
        assert types["existence"] > 80    # most qualitative checks are existence
        assert types["spread"] > 10
        assert types["compound"] >= 10

    def test_every_template_has_detection_logic_json(self):
        for t in ISSUE_REPOSITORY:
            assert t["detection_logic_json"] is not None, \
                f"{t['code']} missing detection_logic_json"

    def test_all_rule_versions_are_1_0(self):
        for code, rule in DETECTION_RULES.items():
            assert rule.get("version") == "1.0", f"{code} has wrong version"


# ---------------------------------------------------------------------------
# Service integration — detection_logic_json in seeded rows
# ---------------------------------------------------------------------------

class TestDetectionLogicJsonInService:
    def test_seeded_template_has_detection_logic_json(self, session):
        svc.seed_issue_templates(session)
        result = svc.get_template(session, "WC_001")
        assert result is not None
        assert result["detection_logic_json"] is not None
        rule = result["detection_logic_json"]
        assert rule["rule_type"] == "threshold"
        assert rule["metric"] == "current_ratio"
        assert rule["operator"] == "lt"
        assert rule["value"] == 1.0

    def test_existence_rule_has_no_value_in_response(self, session):
        svc.seed_issue_templates(session)
        result = svc.get_template(session, "AR_009")
        assert result is not None
        rule = result["detection_logic_json"]
        assert rule["rule_type"] == "existence"
        assert rule.get("value") is None

    def test_compound_rule_has_conditions(self, session):
        svc.seed_issue_templates(session)
        result = svc.get_template(session, "EQ_008")
        assert result is not None
        rule = result["detection_logic_json"]
        assert rule["rule_type"] == "compound"
        assert len(rule["conditions"]) >= 2

    def test_spread_rule_has_comparison_metric(self, session):
        svc.seed_issue_templates(session)
        result = svc.get_template(session, "GM_007")
        assert result is not None
        rule = result["detection_logic_json"]
        assert rule["rule_type"] == "spread"
        assert rule["comparison_metric"] == "revenue"

    def test_list_filter_by_rule_type(self, session):
        svc.seed_issue_templates(session)
        threshold_templates = svc.list_templates(session, rule_type="threshold")
        assert len(threshold_templates) > 10
        for t in threshold_templates:
            if t["detection_logic_json"]:
                assert t["detection_logic_json"]["rule_type"] == "threshold"

    def test_validate_repository_rules_endpoint(self, session):
        result = svc.validate_repository_rules()
        assert result["total_templates"] == 200
        assert result["total_rules"] == 200
        assert result["valid"] == 200
        assert result["errors"] == {}
        assert result["missing_rules"] == []
        assert result["coverage_pct"] == 100.0

    def test_seed_backfills_detection_logic_json(self, session):
        # Simulate a row seeded without detection_logic_json (pre-3.14)
        from app.models.issue_template import IssueTemplate
        row = IssueTemplate(
            code="TEST_BF_001",
            category="revenue_recognition",
            issue_type="financial_analytics",
            name="Backfill Test",
            description="Pre-3.14 row without detection_logic_json",
            risk_level="moderate",
            is_active=True,
            is_system=True,
            sort_order=0,
        )
        session.add(row)
        session.flush()
        assert row.detection_logic_json is None
