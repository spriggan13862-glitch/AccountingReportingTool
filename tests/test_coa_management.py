"""
Sprint L — Chart of Accounts Management tests.

Tests:
  1. test_deactivate_account_with_zero_balance — succeeds
  2. test_deactivate_account_with_nonzero_balance_blocked — returns 409
  3. test_delete_account_with_je_lines_blocked — returns 409
  4. test_delete_safe_account — succeeds when no JEs and no children
  5. test_hierarchy_query — include_hierarchy=true returns nested children
"""
from __future__ import annotations

import datetime
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base
from app.api.deps import get_db
from app.main import app
from app.models.account import Account
from app.models.entity import Entity
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.models.scenario import Scenario


@pytest.fixture(scope="module")
def engine():
    e = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(e, "connect")
    def pragmas(conn, _):
        cur = conn.cursor()
        cur.execute("PRAGMA foreign_keys = OFF")
        cur.close()

    Base.metadata.create_all(e)
    yield e
    Base.metadata.drop_all(e)


@pytest.fixture(scope="module")
def session_factory(engine):
    return sessionmaker(bind=engine)


@pytest.fixture(scope="module")
def client(engine, session_factory):
    def override():
        db = session_factory()
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(scope="module")
def base_entity(session_factory):
    db = session_factory()
    entity = Entity(
        code="COAMGMT_E",
        name="COA Mgmt Entity",
        entity_type="operating",
        currency="USD",
        fiscal_year_end_month=12,
        fiscal_year_convention="calendar",
    )
    db.add(entity)
    db.flush()
    scenario = Scenario(
        code="COAMGMT_S",
        name="COA Mgmt Scenario",
        scenario_type="actual",
    )
    db.add(scenario)
    db.commit()
    eid = entity.id
    sid = scenario.id
    db.close()
    return eid, sid


def _make_account(session_factory, entity_id: int, number: str, name: str,
                  account_type: str = "asset", normal_balance: str = "debit",
                  parent_id: int | None = None) -> int:
    db = session_factory()
    acct = Account(
        entity_id=entity_id,
        account_number=number,
        account_name=name,
        account_type=account_type,
        normal_balance=normal_balance,
        parent_account_id=parent_id,
    )
    db.add(acct)
    db.commit()
    aid = acct.id
    db.close()
    return aid


def _make_je_line(session_factory, entity_id: int, scenario_id: int, account_id: int, debit: int, credit: int, je_number: str):
    db = session_factory()
    je = JournalEntry(
        je_number=je_number,
        entry_date=datetime.date(2024, 1, 1),
        entity_id=entity_id,
        scenario_id=scenario_id,
        description="test",
        source="manual",
        status="posted",
    )
    db.add(je)
    db.flush()
    line = JournalEntryLine(
        journal_entry_id=je.id,
        line_number=1,
        account_id=account_id,
        entity_id=entity_id,
        debit=debit,
        credit=credit,
    )
    db.add(line)
    db.commit()
    db.close()


def test_deactivate_account_with_zero_balance(client: TestClient, session_factory, base_entity):
    entity_id, _ = base_entity
    acct_id = _make_account(session_factory, entity_id, "A1000", "Cash Zero")
    r = client.post(f"/api/v1/accounts/{acct_id}/deactivate")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["active"] is False
    assert data["account_status"] == "inactive"


def test_deactivate_account_with_nonzero_balance_blocked(client: TestClient, session_factory, base_entity):
    entity_id, scenario_id = base_entity
    acct_id = _make_account(session_factory, entity_id, "A1100", "AR Nonzero")
    _make_je_line(session_factory, entity_id, scenario_id, acct_id, 100, 0, "JE-DEACT-NZ")
    r = client.post(f"/api/v1/accounts/{acct_id}/deactivate")
    assert r.status_code == 409, r.text
    assert "non-zero balance" in r.json()["detail"]


def test_delete_account_with_je_lines_blocked(client: TestClient, session_factory, base_entity):
    entity_id, scenario_id = base_entity
    acct_id = _make_account(session_factory, entity_id, "A2000", "Acct With JE")
    _make_je_line(session_factory, entity_id, scenario_id, acct_id, 50, 0, "JE-DEL-BLOCK")
    r = client.delete(f"/api/v1/accounts/{acct_id}")
    assert r.status_code == 409, r.text
    assert "posted journal entry lines" in r.json()["detail"]


def test_delete_safe_account(client: TestClient, session_factory, base_entity):
    entity_id, _ = base_entity
    acct_id = _make_account(session_factory, entity_id, "A3000", "Safe Delete Acct")
    r = client.delete(f"/api/v1/accounts/{acct_id}")
    assert r.status_code == 204, r.text
    r2 = client.get(f"/api/v1/accounts/{acct_id}")
    assert r2.status_code == 404


def test_hierarchy_query(client: TestClient, session_factory, base_entity):
    entity_id, _ = base_entity
    parent_id = _make_account(session_factory, entity_id, "A4000", "Parent Acct")
    child_id = _make_account(session_factory, entity_id, "A4100", "Child Acct", parent_id=parent_id)

    r = client.get(f"/api/v1/accounts/?entity_id={entity_id}&include_hierarchy=true")
    assert r.status_code == 200, r.text
    data = r.json()
    item_ids = [a["id"] for a in data["items"]]
    assert parent_id in item_ids
    assert child_id not in item_ids

    r2 = client.get(f"/api/v1/accounts/{parent_id}")
    assert r2.status_code == 200
    detail = r2.json()
    assert "children" in detail
    child_ids = [c["id"] for c in detail["children"]]
    assert child_id in child_ids
    assert "balance_summary" in detail
    assert "total_debit" in detail["balance_summary"]
