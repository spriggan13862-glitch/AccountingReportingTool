"""Tests for issue_template_service — Sprint 3.13."""
import pytest

from app.services import issue_template_service as svc
from app.models.issue_template import IssueTemplate


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_template(session, code: str, category: str = "test_cat",
                   issue_type: str = "financial_analytics",
                   risk_level: str = "moderate") -> IssueTemplate:
    row = IssueTemplate(
        code=code,
        category=category,
        issue_type=issue_type,
        name=f"Template {code}",
        description=f"Description for {code}",
        risk_level=risk_level,
        is_active=True,
        is_system=True,
        sort_order=0,
    )
    session.add(row)
    session.flush()
    return row


# ---------------------------------------------------------------------------
# seed_issue_templates
# ---------------------------------------------------------------------------

class TestSeedIssueTemplates:
    def test_seed_populates_templates(self, session):
        added = svc.seed_issue_templates(session)
        assert added > 0
        count = session.query(IssueTemplate).count()
        assert count >= 200

    def test_seed_is_idempotent(self, session):
        svc.seed_issue_templates(session)
        count_before = session.query(IssueTemplate).count()

        added_second = svc.seed_issue_templates(session)
        count_after = session.query(IssueTemplate).count()

        assert added_second == 0
        assert count_after == count_before

    def test_seed_codes_are_unique(self, session):
        svc.seed_issue_templates(session)
        rows = session.query(IssueTemplate.code).all()
        codes = [r[0] for r in rows]
        assert len(codes) == len(set(codes))


# ---------------------------------------------------------------------------
# list_templates
# ---------------------------------------------------------------------------

class TestListTemplates:
    def test_list_returns_active_templates(self, session):
        svc.seed_issue_templates(session)
        results = svc.list_templates(session)
        assert len(results) >= 200
        assert all(r["is_active"] for r in results)

    def test_filter_by_category(self, session):
        svc.seed_issue_templates(session)
        results = svc.list_templates(session, category="revenue_recognition")
        assert len(results) > 0
        assert all(r["category"] == "revenue_recognition" for r in results)

    def test_filter_by_issue_type(self, session):
        svc.seed_issue_templates(session)
        results = svc.list_templates(session, issue_type="fraud")
        assert len(results) > 0
        assert all(r["issue_type"] == "fraud" for r in results)

    def test_filter_by_risk_level(self, session):
        svc.seed_issue_templates(session)
        results = svc.list_templates(session, risk_level="critical")
        assert len(results) > 0
        assert all(r["risk_level"] == "critical" for r in results)

    def test_filter_by_search_name(self, session):
        svc.seed_issue_templates(session)
        results = svc.list_templates(session, search="revenue")
        assert len(results) > 0

    def test_filter_by_search_code(self, session):
        svc.seed_issue_templates(session)
        results = svc.list_templates(session, search="REV_001")
        assert len(results) >= 1
        assert any(r["code"] == "REV_001" for r in results)

    def test_inactive_templates_excluded(self, session):
        svc.seed_issue_templates(session)
        row = session.query(IssueTemplate).first()
        row.is_active = False
        session.flush()

        results = svc.list_templates(session)
        codes = [r["code"] for r in results]
        assert row.code not in codes

    def test_result_has_array_fields(self, session):
        svc.seed_issue_templates(session)
        results = svc.list_templates(session, category="revenue_recognition")
        assert len(results) > 0
        r = results[0]
        assert isinstance(r["potential_causes"], list)
        assert isinstance(r["suggested_procedures"], list)
        assert isinstance(r["suggested_ajes"], list)
        assert isinstance(r["management_questions"], list)
        assert isinstance(r["audit_assertions"], list)
        assert isinstance(r["references"], list)

    def test_combined_filters(self, session):
        svc.seed_issue_templates(session)
        results = svc.list_templates(session, category="fraud_indicators", risk_level="high")
        assert all(r["category"] == "fraud_indicators" for r in results)
        assert all(r["risk_level"] == "high" for r in results)


# ---------------------------------------------------------------------------
# get_template
# ---------------------------------------------------------------------------

class TestGetTemplate:
    def test_get_existing_template(self, session):
        svc.seed_issue_templates(session)
        result = svc.get_template(session, "REV_001")
        assert result is not None
        assert result["code"] == "REV_001"
        assert result["category"] == "revenue_recognition"

    def test_get_missing_template_returns_none(self, session):
        svc.seed_issue_templates(session)
        result = svc.get_template(session, "DOES_NOT_EXIST")
        assert result is None

    def test_get_template_ar_001(self, session):
        svc.seed_issue_templates(session)
        result = svc.get_template(session, "AR_001")
        assert result is not None
        assert result["code"] == "AR_001"

    def test_get_template_returns_full_dict(self, session):
        svc.seed_issue_templates(session)
        result = svc.get_template(session, "INV_001")
        assert result is not None
        assert "name" in result
        assert "description" in result
        assert "risk_level" in result
        assert "detection_logic" in result
        assert "potential_causes" in result
        assert "suggested_procedures" in result
        assert "suggested_ajes" in result
        assert "management_questions" in result


# ---------------------------------------------------------------------------
# list_categories
# ---------------------------------------------------------------------------

class TestListCategories:
    def test_list_categories_returns_all(self, session):
        svc.seed_issue_templates(session)
        categories = svc.list_categories(session)
        assert len(categories) >= 20

    def test_categories_have_counts(self, session):
        svc.seed_issue_templates(session)
        categories = svc.list_categories(session)
        assert all("category" in c and "count" in c for c in categories)
        assert all(c["count"] > 0 for c in categories)

    def test_revenue_recognition_in_categories(self, session):
        svc.seed_issue_templates(session)
        categories = svc.list_categories(session)
        names = [c["category"] for c in categories]
        assert "revenue_recognition" in names

    def test_total_count_matches_templates(self, session):
        svc.seed_issue_templates(session)
        categories = svc.list_categories(session)
        total_from_categories = sum(c["count"] for c in categories)
        total_templates = len(svc.list_templates(session))
        assert total_from_categories == total_templates
