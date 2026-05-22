"""
M35b — Scenario CRUD + Taxonomy-based FS generation.

Proof points:
  1.  POST /scenarios/ creates scenario (201)
  2.  POST /scenarios/ duplicate code → 409
  3.  POST /scenarios/ invalid type → 422
  4.  GET /scenarios/ lists (filter by active, org, type)
  5.  GET /scenarios/{id} retrieves single
  6.  PATCH /scenarios/{id} updates name/description/active
  7.  DELETE /scenarios/{id} soft-deletes (active=False)
  8.  GET /financial-statements/taxonomy/balance-sheet returns list (may be empty)
  9.  GET /financial-statements/taxonomy/income-statement returns list (may be empty)
  10. POST /financial-statements/taxonomy/inherit returns updated/already_set/no_ancestor counts
  11. Taxonomy BS with seeded accounts + taxonomy lines returns non-empty rows with rollup
  12. sign_flip on credit-normal lines
  13. hierarchy_depth computation (child > parent)
  14. Taxonomy inherit propagates parent taxonomy_line_id to child accounts
"""
from __future__ import annotations

import datetime
import pytest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base
from app.api.deps import get_db
from app.main import app
from app.models.scenario import Scenario
from app.models.account import Account
from app.models.reporting_taxonomy import ReportingTaxonomyLine
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine

BASE = "/api/v1"


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
        yield db_session

    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Scenario CRUD
# ---------------------------------------------------------------------------

def test_create_scenario(client):
    r = client.post(f"{BASE}/scenarios/", json={
        "code": "ACT-2025",
        "name": "Actuals 2025",
        "scenario_type": "actual",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["code"] == "ACT-2025"
    assert data["scenario_type"] == "actual"
    assert data["active"] is True


def test_create_scenario_duplicate_code(client):
    client.post(f"{BASE}/scenarios/", json={"code": "DUP", "name": "D1", "scenario_type": "actual"})
    r = client.post(f"{BASE}/scenarios/", json={"code": "DUP", "name": "D2", "scenario_type": "budget"})
    assert r.status_code == 409


def test_create_scenario_invalid_type(client):
    r = client.post(f"{BASE}/scenarios/", json={"code": "BAD", "name": "Bad", "scenario_type": "unknown_type"})
    assert r.status_code == 422


def test_list_scenarios(client):
    client.post(f"{BASE}/scenarios/", json={"code": "S1", "name": "S1", "scenario_type": "actual"})
    client.post(f"{BASE}/scenarios/", json={"code": "S2", "name": "S2", "scenario_type": "budget"})
    r = client.get(f"{BASE}/scenarios/")
    assert r.status_code == 200
    assert len(r.json()) >= 2


def test_list_scenarios_filter_type(client):
    client.post(f"{BASE}/scenarios/", json={"code": "B1", "name": "B1", "scenario_type": "budget"})
    client.post(f"{BASE}/scenarios/", json={"code": "A1", "name": "A1", "scenario_type": "actual"})
    r = client.get(f"{BASE}/scenarios/", params={"scenario_type": "budget"})
    assert r.status_code == 200
    codes = [s["code"] for s in r.json()]
    assert "B1" in codes
    assert "A1" not in codes


def test_get_scenario(client):
    r = client.post(f"{BASE}/scenarios/", json={"code": "G1", "name": "G1", "scenario_type": "forecast"})
    sid = r.json()["id"]
    r2 = client.get(f"{BASE}/scenarios/{sid}")
    assert r2.status_code == 200
    assert r2.json()["id"] == sid


def test_get_scenario_not_found(client):
    r = client.get(f"{BASE}/scenarios/99999")
    assert r.status_code == 404


def test_update_scenario(client):
    r = client.post(f"{BASE}/scenarios/", json={"code": "UPD", "name": "Before", "scenario_type": "budget"})
    sid = r.json()["id"]
    r2 = client.patch(f"{BASE}/scenarios/{sid}", json={"name": "After", "description": "Desc"})
    assert r2.status_code == 200
    assert r2.json()["name"] == "After"
    assert r2.json()["description"] == "Desc"


def test_soft_delete_scenario(client):
    r = client.post(f"{BASE}/scenarios/", json={"code": "DEL", "name": "Del", "scenario_type": "actual"})
    sid = r.json()["id"]
    r2 = client.delete(f"{BASE}/scenarios/{sid}")
    assert r2.status_code == 204
    r3 = client.get(f"{BASE}/scenarios/{sid}")
    assert r3.json()["active"] is False


def test_filter_active_scenarios(client):
    r = client.post(f"{BASE}/scenarios/", json={"code": "ACT", "name": "Active", "scenario_type": "actual"})
    sid = r.json()["id"]
    client.delete(f"{BASE}/scenarios/{sid}")
    r2 = client.get(f"{BASE}/scenarios/", params={"active": "true"})
    ids = [s["id"] for s in r2.json()]
    assert sid not in ids


# ---------------------------------------------------------------------------
# Taxonomy FS endpoints (empty state)
# ---------------------------------------------------------------------------

def test_taxonomy_bs_empty(client):
    r = client.get(f"{BASE}/financial-statements/taxonomy/balance-sheet", params={
        "entity_id": 1,
        "as_of_date": "2025-12-31",
    })
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_taxonomy_is_empty(client):
    r = client.get(f"{BASE}/financial-statements/taxonomy/income-statement", params={
        "entity_id": 1,
        "as_of_date": "2025-12-31",
    })
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_taxonomy_inherit_empty(client):
    r = client.post(f"{BASE}/financial-statements/taxonomy/inherit", params={"entity_id": 1})
    assert r.status_code == 200
    data = r.json()
    assert "updated" in data
    assert "already_set" in data
    assert "no_ancestor" in data


# ---------------------------------------------------------------------------
# Taxonomy FS with seeded data
# ---------------------------------------------------------------------------

def _seed_taxonomy_and_accounts(db_session):
    """Create a minimal taxonomy + entity + accounts + journal entry for BS test."""
    from app.models.entity import Entity
    from app.models.organization import Organization

    org = Organization(name="Test Org", slug="test-org-m35b")
    db_session.add(org)
    db_session.flush()

    entity = Entity(name="Test Entity", code="TENT", organization_id=org.id, entity_type="operating")
    db_session.add(entity)
    db_session.flush()

    # Taxonomy: Assets (parent) → Cash (child)
    assets_line = ReportingTaxonomyLine(
        code="1000",
        name="Assets",
        section="assets",
        statement_type="balance_sheet",
        sort_order=10,
        is_subtotal=False,
        normal_balance="debit",
        active=True,
        system_defined=False,
    )
    db_session.add(assets_line)
    db_session.flush()

    cash_line = ReportingTaxonomyLine(
        code="1100",
        name="Cash",
        section="assets",
        statement_type="balance_sheet",
        sort_order=20,
        parent_id=assets_line.id,
        is_subtotal=False,
        normal_balance="debit",
        active=True,
        system_defined=False,
    )
    db_session.add(cash_line)
    db_session.flush()

    equity_line = ReportingTaxonomyLine(
        code="3000",
        name="Equity",
        section="equity",
        statement_type="balance_sheet",
        sort_order=100,
        is_subtotal=False,
        normal_balance="credit",
        active=True,
        system_defined=False,
    )
    db_session.add(equity_line)
    db_session.flush()

    # Accounts
    cash_account = Account(
        entity_id=entity.id,
        account_number="1010",
        account_name="Cash - Checking",
        account_type="asset",
        normal_balance="debit",
        reporting_taxonomy_line_id=cash_line.id,
    )
    equity_account = Account(
        entity_id=entity.id,
        account_number="3010",
        account_name="Retained Earnings",
        account_type="equity",
        normal_balance="credit",
        reporting_taxonomy_line_id=equity_line.id,
    )
    db_session.add_all([cash_account, equity_account])
    db_session.flush()

    # Scenario
    scenario = Scenario(code="ACT", name="Actuals", scenario_type="actual", active=True)
    db_session.add(scenario)
    db_session.flush()

    # Journal entry: debit Cash $500, credit Equity $500
    je = JournalEntry(
        entity_id=entity.id,
        scenario_id=scenario.id,
        je_number="JE-001",
        entry_date=datetime.date(2025, 12, 15),
        description="Test entry",
        status="posted",
    )
    db_session.add(je)
    db_session.flush()

    jel_debit = JournalEntryLine(
        journal_entry_id=je.id,
        line_number=1,
        account_id=cash_account.id,
        entity_id=entity.id,
        debit=500,
        credit=0,
    )
    jel_credit = JournalEntryLine(
        journal_entry_id=je.id,
        line_number=2,
        account_id=equity_account.id,
        entity_id=entity.id,
        debit=0,
        credit=500,
    )
    db_session.add_all([jel_debit, jel_credit])
    db_session.flush()

    return entity.id, scenario.id, cash_line.id, assets_line.id, equity_line.id


def test_taxonomy_bs_with_data(client, db_session):
    entity_id, scenario_id, cash_line_id, assets_line_id, equity_line_id = _seed_taxonomy_and_accounts(db_session)

    r = client.get(f"{BASE}/financial-statements/taxonomy/balance-sheet", params={
        "entity_id": entity_id,
        "as_of_date": "2025-12-31",
        "scenario_ids": scenario_id,
    })
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) > 0

    by_id = {row["taxonomy_id"]: row for row in rows}
    # Cash line has $500 debit → own_balance = 500
    assert cash_line_id in by_id
    assert float(by_id[cash_line_id]["own_balance"]) == 500.0

    # Assets (parent) rolls up Cash → total_balance = 500
    assert assets_line_id in by_id
    assert float(by_id[assets_line_id]["total_balance"]) == 500.0


def test_taxonomy_sign_flip_credit_line(client, db_session):
    entity_id, scenario_id, _cash, _assets, equity_line_id = _seed_taxonomy_and_accounts(db_session)

    r = client.get(f"{BASE}/financial-statements/taxonomy/balance-sheet", params={
        "entity_id": entity_id,
        "as_of_date": "2025-12-31",
        "scenario_ids": scenario_id,
    })
    rows = r.json()
    by_id = {row["taxonomy_id"]: row for row in rows}

    equity_row = by_id[equity_line_id]
    # Equity is credit-normal → sign_flip=True, display_balance should be positive
    assert equity_row["sign_flip"] is True
    assert float(equity_row["display_balance"]) > 0


def test_taxonomy_hierarchy_depths(client, db_session):
    entity_id, scenario_id, cash_line_id, assets_line_id, _equity = _seed_taxonomy_and_accounts(db_session)

    r = client.get(f"{BASE}/financial-statements/taxonomy/balance-sheet", params={
        "entity_id": entity_id,
        "as_of_date": "2025-12-31",
    })
    rows = r.json()
    by_id = {row["taxonomy_id"]: row for row in rows}

    # Assets is root (depth 0), Cash is child (depth 1)
    assert by_id[assets_line_id]["hierarchy_depth"] == 0
    assert by_id[cash_line_id]["hierarchy_depth"] == 1


def test_taxonomy_inherit_propagates(client, db_session):
    """Child account with no taxonomy_line_id inherits from parent account."""
    from app.models.entity import Entity
    from app.models.organization import Organization

    org = Organization(name="Org2", slug="org2-m35b")
    db_session.add(org)
    db_session.flush()

    entity = Entity(name="E2", code="E2X", organization_id=org.id, entity_type="operating")
    db_session.add(entity)
    db_session.flush()

    tax_line = ReportingTaxonomyLine(
        code="9000", name="Misc", section="misc",
        statement_type="balance_sheet", sort_order=1,
        is_subtotal=False, active=True, system_defined=False,
    )
    db_session.add(tax_line)
    db_session.flush()

    parent_acct = Account(
        entity_id=entity.id, account_number="9000", account_name="Parent",
        account_type="asset", normal_balance="debit",
        reporting_taxonomy_line_id=tax_line.id,
    )
    db_session.add(parent_acct)
    db_session.flush()

    child_acct = Account(
        entity_id=entity.id, account_number="9001", account_name="Child",
        account_type="asset", normal_balance="debit",
        parent_account_id=parent_acct.id,
        reporting_taxonomy_line_id=None,
    )
    db_session.add(child_acct)
    db_session.flush()

    r = client.post(f"{BASE}/financial-statements/taxonomy/inherit", params={"entity_id": entity.id})
    assert r.status_code == 200
    data = r.json()
    assert data["updated"] == 1
    assert data["already_set"] == 1

    db_session.refresh(child_acct)
    assert child_acct.reporting_taxonomy_line_id == tax_line.id
