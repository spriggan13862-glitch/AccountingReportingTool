"""Tests for Sprint 3.16 — Advisory Analysis (EBITDA bridge, QoE, SBA, DSCR)."""
from __future__ import annotations

import datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base
from app.api.deps import get_db, get_current_user
from app.main import app
from app.models.adjustment_workspace import AdjustmentPackage, AdjustmentPackageMembership
from app.models.advisor_scenario import AdvisorScenario, AdvisorScenarioPackage
from app.models.account import Account
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.models.entity import Entity
from app.models.scenario import Scenario
from app.services import advisory_analysis_service as svc

BASE = "/api/v1"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(engine)


@pytest.fixture()
def client(db_session):
    def override():
        try:
            yield db_session
        finally:
            db_session.flush()

    class FakeUser:
        id = 1
        organization_id = "test-org"
        is_superuser = False

    app.dependency_overrides[get_db] = override
    app.dependency_overrides[get_current_user] = lambda: FakeUser()
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def entity(db_session) -> Entity:
    e = Entity(code="TEST01", name="Test Corp", entity_type="operating")
    db_session.add(e)
    db_session.flush()
    return e


@pytest.fixture()
def scenario(db_session) -> Scenario:
    s = Scenario(code="TOPSIDE", name="Topside", scenario_type="topside")
    db_session.add(s)
    db_session.flush()
    return s


@pytest.fixture()
def accounts(db_session, entity):
    cash = Account(
        account_number="1000", account_name="Cash",
        account_type="asset", normal_balance="debit",
        entity_id=entity.id,
    )
    expense = Account(
        account_number="6000", account_name="Owner Salary",
        account_type="expense", normal_balance="debit",
        entity_id=entity.id,
    )
    db_session.add_all([cash, expense])
    db_session.flush()
    return {"cash": cash, "expense": expense}


def _make_je(db_session, entity, scenario, accounts, je_number, overlay_group, amount):
    """Create a posted JE: debit expense / credit asset (cash).
    NI impact = +amount (expense addback convention in advisory context).
    """
    je = JournalEntry(
        je_number=je_number,
        entry_date=datetime.date(2026, 1, 15),
        entity_id=entity.id,
        scenario_id=scenario.id,
        description=f"Test adjustment {je_number}",
        source="manual",
        status="posted",
        overlay_group=overlay_group,
    )
    db_session.add(je)
    db_session.flush()
    line_dr = JournalEntryLine(
        journal_entry_id=je.id, line_number=1,
        account_id=accounts["expense"].id, entity_id=entity.id,
        debit=amount, credit=0,
    )
    line_cr = JournalEntryLine(
        journal_entry_id=je.id, line_number=2,
        account_id=accounts["cash"].id, entity_id=entity.id,
        debit=0, credit=amount,
    )
    db_session.add_all([line_dr, line_cr])
    db_session.flush()
    return je


def _make_pkg_scenario(db_session, entity, scenario_model, accounts, pkg_type, overlay_group, amount, je_suffix="A"):
    """Create package + advisor scenario + JE, return (advisor_scen, je)."""
    je = _make_je(db_session, entity, scenario_model, accounts, f"JE-{je_suffix}", overlay_group, amount)
    pkg = AdjustmentPackage(
        organization_id="test-org",
        name=f"Pkg-{je_suffix}",
        package_type=pkg_type,
    )
    db_session.add(pkg)
    db_session.flush()
    membership = AdjustmentPackageMembership(
        package_id=pkg.id, journal_entry_id=je.id
    )
    db_session.add(membership)
    adv_scen = AdvisorScenario(
        organization_id="test-org",
        name=f"Scenario-{je_suffix}",
        scenario_type="custom",
    )
    db_session.add(adv_scen)
    db_session.flush()
    asp = AdvisorScenarioPackage(
        scenario_id=adv_scen.id, package_id=pkg.id, included=True, include_order=0
    )
    db_session.add(asp)
    db_session.flush()
    return adv_scen, je


# ---------------------------------------------------------------------------
# Service unit tests (no HTTP)
# ---------------------------------------------------------------------------

class TestEBITDABridgeService:
    def test_empty_scenarios_returns_zero_adjustments(self, db_session, entity):
        result = svc.compute_ebitda_bridge(db_session, entity.id, [], Decimal("500000"))
        assert result["base_ebitda"] == Decimal("500000")
        assert result["total_adjustments"] == Decimal("0")
        assert result["adjusted_ebitda"] == Decimal("500000")
        assert result["sections"] == []

    def test_bridge_groups_by_overlay_group(self, db_session, entity, scenario, accounts):
        adv_scen, je = _make_pkg_scenario(
            db_session, entity, scenario, accounts,
            "management", "normalization", 80000, "OC"
        )
        result = svc.compute_ebitda_bridge(
            db_session, entity.id, [adv_scen.id], Decimal("500000")
        )
        assert result["adjusted_ebitda"] == Decimal("580000")
        assert len(result["sections"]) == 1
        section = result["sections"][0]
        assert section["category"] == "Owner Compensation Normalization"
        assert section["overlay_group"] == "normalization"
        assert len(section["items"]) == 1

    def test_bridge_sums_multiple_sections(self, db_session, entity, scenario, accounts):
        adv1, _ = _make_pkg_scenario(
            db_session, entity, scenario, accounts,
            "management", "normalization", 80000, "OC2"
        )
        adv2, _ = _make_pkg_scenario(
            db_session, entity, scenario, accounts,
            "management", "topside", 25000, "NR2"
        )
        result = svc.compute_ebitda_bridge(
            db_session, entity.id, [adv1.id, adv2.id], Decimal("500000")
        )
        assert result["total_adjustments"] == Decimal("105000")
        assert result["adjusted_ebitda"] == Decimal("605000")

    def test_bridge_excludes_other_entity_jes(self, db_session, entity, scenario, accounts):
        other_entity = Entity(code="OTHER01", name="Other Corp", entity_type="operating")
        db_session.add(other_entity)
        db_session.flush()
        # JE for other entity
        je = _make_je(db_session, other_entity, scenario, accounts, "JE-OTH", "topside", 50000)
        pkg = AdjustmentPackage(organization_id="test-org", name="Pkg-OTH", package_type="management")
        db_session.add(pkg)
        db_session.flush()
        db_session.add(AdjustmentPackageMembership(package_id=pkg.id, journal_entry_id=je.id))
        adv = AdvisorScenario(organization_id="test-org", name="Scen-OTH", scenario_type="custom")
        db_session.add(adv)
        db_session.flush()
        db_session.add(AdvisorScenarioPackage(scenario_id=adv.id, package_id=pkg.id, included=True))
        db_session.flush()
        result = svc.compute_ebitda_bridge(db_session, entity.id, [adv.id])
        assert result["total_adjustments"] == Decimal("0")

    def test_excluded_package_not_in_bridge(self, db_session, entity, scenario, accounts):
        adv_scen, je = _make_pkg_scenario(
            db_session, entity, scenario, accounts,
            "management", "topside", 50000, "EX"
        )
        # Set included=False
        asp = db_session.query(AdvisorScenarioPackage).filter_by(scenario_id=adv_scen.id).first()
        asp.included = False
        db_session.flush()
        result = svc.compute_ebitda_bridge(db_session, entity.id, [adv_scen.id])
        assert result["total_adjustments"] == Decimal("0")


class TestQoEScheduleService:
    def test_empty_returns_zero(self, db_session, entity):
        result = svc.compute_qoe_schedule(db_session, entity.id, [])
        assert result["total"] == Decimal("0")
        assert result["items"] == []

    def test_qoe_packages_included(self, db_session, entity, scenario, accounts):
        adv_scen, _ = _make_pkg_scenario(
            db_session, entity, scenario, accounts, "qoe", "topside", 15000, "QQ"
        )
        result = svc.compute_qoe_schedule(db_session, entity.id, [adv_scen.id])
        assert result["count"] == 1
        assert result["total"] == Decimal("15000")
        assert result["items"][0]["package_type"] == "qoe"

    def test_non_qoe_packages_excluded(self, db_session, entity, scenario, accounts):
        adv_scen, _ = _make_pkg_scenario(
            db_session, entity, scenario, accounts, "management", "topside", 50000, "MG"
        )
        result = svc.compute_qoe_schedule(db_session, entity.id, [adv_scen.id])
        assert result["count"] == 0
        assert result["total"] == Decimal("0")


class TestSBAAddbackService:
    def test_empty_returns_zero(self, db_session, entity):
        result = svc.compute_sba_addback(db_session, entity.id, [])
        assert result["total"] == Decimal("0")
        assert result["count"] == 0

    def test_sba_packages_included(self, db_session, entity, scenario, accounts):
        adv_scen, _ = _make_pkg_scenario(
            db_session, entity, scenario, accounts, "sba", "normalization", 45000, "SB"
        )
        result = svc.compute_sba_addback(db_session, entity.id, [adv_scen.id])
        assert result["count"] == 1
        assert result["total"] == Decimal("45000")
        assert "note" in result

    def test_non_sba_packages_excluded(self, db_session, entity, scenario, accounts):
        adv_scen, _ = _make_pkg_scenario(
            db_session, entity, scenario, accounts, "qoe", "topside", 30000, "NQ"
        )
        result = svc.compute_sba_addback(db_session, entity.id, [adv_scen.id])
        assert result["count"] == 0


class TestDSCRService:
    def test_zero_debt_service_returns_none_dscr(self, db_session, entity):
        result = svc.compute_dscr(
            db_session, entity.id, [], Decimal("500000"), Decimal("0")
        )
        assert result["dscr"] is None
        assert result["coverage_note"] == "No debt service provided"

    def test_strong_coverage(self, db_session, entity):
        result = svc.compute_dscr(
            db_session, entity.id, [], Decimal("500000"), Decimal("200000")
        )
        assert result["dscr"] == Decimal("2.50")
        assert result["coverage_note"] == "Strong coverage"

    def test_adequate_coverage(self, db_session, entity):
        result = svc.compute_dscr(
            db_session, entity.id, [], Decimal("120000"), Decimal("100000")
        )
        assert result["dscr"] == Decimal("1.20")
        assert result["coverage_note"] == "Adequate coverage"

    def test_below_threshold(self, db_session, entity):
        result = svc.compute_dscr(
            db_session, entity.id, [], Decimal("90000"), Decimal("100000")
        )
        assert result["dscr"] == Decimal("0.90")
        assert "Below" in result["coverage_note"]

    def test_dscr_includes_adjustments(self, db_session, entity, scenario, accounts):
        adv_scen, _ = _make_pkg_scenario(
            db_session, entity, scenario, accounts, "management", "normalization", 80000, "DC"
        )
        result = svc.compute_dscr(
            db_session, entity.id, [adv_scen.id], Decimal("500000"), Decimal("232000")
        )
        # adjusted = 580000, dscr = 580000 / 232000 = 2.50
        assert result["adjusted_ebitda"] == Decimal("580000")
        assert result["dscr"] == Decimal("2.50")


# ---------------------------------------------------------------------------
# HTTP endpoint tests
# ---------------------------------------------------------------------------

class TestAdvisoryAnalysisAPI:
    def test_ebitda_bridge_empty(self, client, entity):
        r = client.get(f"{BASE}/advisory-analysis/ebitda-bridge", params={"entity_id": entity.id})
        assert r.status_code == 200
        data = r.json()
        assert "sections" in data
        assert "adjusted_ebitda" in data

    def test_qoe_schedule_empty(self, client, entity):
        r = client.get(f"{BASE}/advisory-analysis/qoe-schedule", params={"entity_id": entity.id})
        assert r.status_code == 200
        assert r.json()["items"] == []

    def test_sba_addback_empty(self, client, entity):
        r = client.get(f"{BASE}/advisory-analysis/sba-addback", params={"entity_id": entity.id})
        assert r.status_code == 200
        assert r.json()["count"] == 0

    def test_dscr_no_debt_service(self, client, entity):
        r = client.get(f"{BASE}/advisory-analysis/dscr", params={"entity_id": entity.id})
        assert r.status_code == 200
        assert r.json()["dscr"] is None

    def test_dscr_with_debt_service(self, client, entity):
        r = client.get(
            f"{BASE}/advisory-analysis/dscr",
            params={"entity_id": entity.id, "base_ebitda": 600000, "annual_debt_service": 200000},
        )
        assert r.status_code == 200
        assert float(r.json()["dscr"]) == pytest.approx(3.0, abs=0.01)

    def test_export_returns_xlsx(self, client, entity):
        r = client.get(f"{BASE}/advisory-analysis/export", params={"entity_id": entity.id})
        assert r.status_code == 200
        assert "spreadsheet" in r.headers["content-type"]
        assert r.content[:4] == b"PK\x03\x04"  # xlsx zip magic bytes

    def test_ebitda_bridge_base_param(self, client, entity):
        r = client.get(
            f"{BASE}/advisory-analysis/ebitda-bridge",
            params={"entity_id": entity.id, "base_ebitda": 750000},
        )
        assert r.status_code == 200
        assert float(r.json()["base_ebitda"]) == 750000.0
