"""
Milestone 10: FastAPI API layer proof-point tests.

Proof points:
  1.  GET /health returns 200
  2.  POST /entities/ creates entity, returns 201 with id
  3.  GET /entities/ returns paginated list
  4.  POST /accounts/ creates account, returns 201
  5.  POST /journal-entries/ posts a balanced JE, returns 201 with lines
  6.  POST /journal-entries/ with unbalanced amounts returns 400 with validation payload
  7.  POST /journal-entries/draft creates draft JE
  8.  POST /journal-entries/{id}/post transitions draft to posted
  9.  PUT /journal-entries/{id} updates draft header and lines
  10. POST /journal-entries/{id}/reverse reverses a posted JE, returns 201
"""

import datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 — registers all models with Base.metadata
from app.database import Base
from app.api.deps import get_db
from app.main import app

TODAY = datetime.date.today()
ENTRY_DATE = datetime.date(TODAY.year, 1, 1)


# ---------------------------------------------------------------------------
# Engine / client fixtures (module-scoped for speed)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def api_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,  # all sessions share the same in-memory DB
    )

    @event.listens_for(engine, "connect")
    def set_pragmas(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.close()

    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)


@pytest.fixture(scope="module")
def api_session_factory(api_engine):
    return sessionmaker(bind=api_engine)


@pytest.fixture(scope="module")
def client(api_session_factory):
    """TestClient with get_db overridden to use the in-memory engine."""
    def override_get_db():
        db = api_session_factory()
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Seed data (module-scoped) — created once, shared across all tests
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def seeds(client, api_session_factory):
    """Create base entity, scenario, and accounts; return their IDs."""
    from app.models import Scenario

    # Entity via API
    r = client.post("/api/v1/entities/", json={
        "code": "API_E1",
        "name": "API Test Entity",
        "entity_type": "operating",
        "currency": "USD",
    })
    assert r.status_code == 201
    entity_id = r.json()["id"]

    # Scenario directly in DB (no Scenario API endpoint)
    db = api_session_factory()
    try:
        scenario = Scenario(code="API_ACT", name="Actual", scenario_type="actual")
        db.add(scenario)
        db.commit()
        scenario_id = scenario.id
    finally:
        db.close()

    # Cash account (debit-normal, asset)
    r = client.post("/api/v1/accounts/", json={
        "entity_id": entity_id,
        "account_number": "1000",
        "account_name": "Cash",
        "account_type": "asset",
        "normal_balance": "debit",
    })
    assert r.status_code == 201
    cash_id = r.json()["id"]

    # Revenue account (credit-normal, revenue)
    r = client.post("/api/v1/accounts/", json={
        "entity_id": entity_id,
        "account_number": "4000",
        "account_name": "Revenue",
        "account_type": "revenue",
        "normal_balance": "credit",
    })
    assert r.status_code == 201
    rev_id = r.json()["id"]

    return {
        "entity_id": entity_id,
        "scenario_id": scenario_id,
        "cash_id": cash_id,
        "rev_id": rev_id,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _balanced_je(seeds, je_number="JE-001", amount="1000.00"):
    return {
        "je_number": je_number,
        "entry_date": str(ENTRY_DATE),
        "entity_id": seeds["entity_id"],
        "scenario_id": seeds["scenario_id"],
        "description": "Test JE",
        "source": "test",
        "lines": [
            {
                "line_number": 1,
                "account_id": seeds["cash_id"],
                "entity_id": seeds["entity_id"],
                "debit": amount,
                "credit": "0",
            },
            {
                "line_number": 2,
                "account_id": seeds["rev_id"],
                "entity_id": seeds["entity_id"],
                "debit": "0",
                "credit": amount,
            },
        ],
    }


def _unbalanced_je(seeds):
    return {
        "je_number": "JE-BAD",
        "entry_date": str(ENTRY_DATE),
        "entity_id": seeds["entity_id"],
        "scenario_id": seeds["scenario_id"],
        "description": "Bad JE",
        "source": "test",
        "lines": [
            {
                "line_number": 1,
                "account_id": seeds["cash_id"],
                "entity_id": seeds["entity_id"],
                "debit": "500",
                "credit": "0",
            },
            {
                "line_number": 2,
                "account_id": seeds["rev_id"],
                "entity_id": seeds["entity_id"],
                "debit": "0",
                "credit": "999",
            },
        ],
    }


# ---------------------------------------------------------------------------
# Proof point 1: health check
# ---------------------------------------------------------------------------

def test_health_check(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Proof point 2: create entity
# ---------------------------------------------------------------------------

def test_create_entity_returns_201(client):
    r = client.post("/api/v1/entities/", json={
        "code": "E_NEW",
        "name": "New Entity",
        "entity_type": "operating",
        "currency": "EUR",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["code"] == "E_NEW"
    assert body["currency"] == "EUR"
    assert isinstance(body["id"], int)
    assert body["active"] is True


# ---------------------------------------------------------------------------
# Proof point 3: list entities with pagination
# ---------------------------------------------------------------------------

def test_list_entities_paginated(client, seeds):
    r = client.get("/api/v1/entities/?page=1&page_size=10")
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert "pages" in body
    assert body["page"] == 1
    assert body["page_size"] == 10
    assert body["total"] >= 1


# ---------------------------------------------------------------------------
# Proof point 4: create account
# ---------------------------------------------------------------------------

def test_create_account_returns_201(client, seeds):
    r = client.post("/api/v1/accounts/", json={
        "entity_id": seeds["entity_id"],
        "account_number": "9999",
        "account_name": "Test Account",
        "account_type": "expense",
        "normal_balance": "debit",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["account_number"] == "9999"
    assert body["normal_balance"] == "debit"
    assert body["active"] is True


# ---------------------------------------------------------------------------
# Proof point 5: post balanced JE
# ---------------------------------------------------------------------------

def test_post_balanced_je_returns_201_with_lines(client, seeds):
    r = client.post("/api/v1/journal-entries/", json=_balanced_je(seeds, "JE-P001"))
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "posted"
    assert body["je_number"] == "JE-P001"
    assert len(body["lines"]) == 2
    assert body["posted_at"] is not None
    assert isinstance(body["warnings"], list)


# ---------------------------------------------------------------------------
# Proof point 6: unbalanced JE returns 400 with validation payload
# ---------------------------------------------------------------------------

def test_unbalanced_je_returns_400_with_validation(client, seeds):
    r = client.post("/api/v1/journal-entries/", json=_unbalanced_je(seeds))
    assert r.status_code == 400
    body = r.json()
    assert "validation" in body
    validation = body["validation"]
    assert validation["success"] is False
    assert len(validation["errors"]) >= 1
    codes = [e["code"] for e in validation["errors"]]
    assert "JE_OUT_OF_BALANCE" in codes


# ---------------------------------------------------------------------------
# Proof point 7: create draft JE
# ---------------------------------------------------------------------------

def test_create_draft_je(client, seeds):
    r = client.post("/api/v1/journal-entries/draft", json=_balanced_je(seeds, "JE-D001"))
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "draft"
    assert body["je_number"] == "JE-D001"
    assert body["posted_at"] is None


# ---------------------------------------------------------------------------
# Proof point 8: post draft JE
# ---------------------------------------------------------------------------

def test_post_draft_je(client, seeds):
    # Create draft
    r = client.post("/api/v1/journal-entries/draft", json=_balanced_je(seeds, "JE-D002"))
    assert r.status_code == 201
    je_id = r.json()["id"]

    # Post it
    r = client.post(f"/api/v1/journal-entries/{je_id}/post")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "posted"
    assert body["posted_at"] is not None


# ---------------------------------------------------------------------------
# Proof point 9: update draft JE
# ---------------------------------------------------------------------------

def test_update_draft_je(client, seeds):
    # Create draft
    r = client.post("/api/v1/journal-entries/draft", json=_balanced_je(seeds, "JE-D003"))
    assert r.status_code == 201
    je_id = r.json()["id"]

    # Update with new description and amounts
    updated = _balanced_je(seeds, "JE-D003-UPD", amount="2000.00")
    updated["description"] = "Updated description"
    r = client.put(f"/api/v1/journal-entries/{je_id}", json=updated)
    assert r.status_code == 200
    body = r.json()
    assert body["description"] == "Updated description"
    assert body["je_number"] == "JE-D003-UPD"
    # Lines should reflect updated amounts
    debits = [Decimal(l["debit"]) for l in body["lines"]]
    assert Decimal("2000.00") in debits


# ---------------------------------------------------------------------------
# Proof point 10: reverse a posted JE
# ---------------------------------------------------------------------------

def test_reverse_posted_je_returns_201(client, seeds):
    # Post a JE
    r = client.post("/api/v1/journal-entries/", json=_balanced_je(seeds, "JE-R001"))
    assert r.status_code == 201
    je_id = r.json()["id"]

    # Reverse it
    r = client.post(f"/api/v1/journal-entries/{je_id}/reverse", json={
        "reversal_date": str(ENTRY_DATE),
        "je_number": "JE-R001-REV",
        "description": "Reversal of JE-R001",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "posted"
    assert body["reversal_of_id"] == je_id

    # Original should now be 'reversed'
    r = client.get(f"/api/v1/journal-entries/{je_id}")
    assert r.status_code == 200
    assert r.json()["status"] == "reversed"
