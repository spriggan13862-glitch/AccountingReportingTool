"""
M31 entity tests — required fields validation, delete protection, deactivate.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base
from app.api.deps import get_db
from app.main import app

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

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
        cur.execute("PRAGMA foreign_keys = OFF")   # allow cascade-free deletes in tests
        cur.close()

    Base.metadata.create_all(e)
    yield e
    Base.metadata.drop_all(e)


@pytest.fixture(scope="module")
def client(engine):
    factory = sessionmaker(bind=engine)

    def override():
        db = factory()
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


# ---------------------------------------------------------------------------
# Required field validation
# ---------------------------------------------------------------------------

def test_create_entity_missing_fiscal_year_end_month(client):
    """fiscal_year_end_month is now required — omitting it must return 422."""
    r = client.post("/api/v1/entities/", json={
        "code": "NOFYE",
        "name": "No FYE Entity",
        "entity_type": "operating",
        "currency": "USD",
        "fiscal_year_convention": "calendar",
        # fiscal_year_end_month intentionally omitted
    })
    assert r.status_code == 422


def test_create_entity_missing_fiscal_year_convention(client):
    """fiscal_year_convention is now required — omitting it must return 422."""
    r = client.post("/api/v1/entities/", json={
        "code": "NOFYC",
        "name": "No FYC Entity",
        "entity_type": "operating",
        "currency": "USD",
        "fiscal_year_end_month": 12,
        # fiscal_year_convention intentionally omitted
    })
    assert r.status_code == 422


def test_create_entity_all_required_fields(client):
    """Entity creation succeeds when all required fields are provided."""
    r = client.post("/api/v1/entities/", json={
        "code": "FULL01",
        "name": "Fully Specified Entity",
        "entity_type": "operating",
        "currency": "USD",
        "fiscal_year_end_month": 12,
        "fiscal_year_convention": "calendar",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["fiscal_year_end_month"] == 12
    assert data["fiscal_year_convention"] == "calendar"


# ---------------------------------------------------------------------------
# Entity delete — no data
# ---------------------------------------------------------------------------

def test_delete_entity_with_no_data(client):
    """Empty entity can be deleted."""
    r = client.post("/api/v1/entities/", json={
        "code": "DEL01",
        "name": "Deletable Entity",
        "entity_type": "operating",
        "currency": "USD",
        "fiscal_year_end_month": 12,
        "fiscal_year_convention": "calendar",
    })
    assert r.status_code == 201
    entity_id = r.json()["id"]

    r = client.delete(f"/api/v1/entities/{entity_id}")
    assert r.status_code == 204


def test_delete_entity_not_found(client):
    r = client.delete("/api/v1/entities/99999")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Entity delete — blocked by journal entries
# ---------------------------------------------------------------------------

def test_delete_entity_blocked_by_journal_entries(client, engine):
    """Entity with journal entries cannot be deleted — must return 409."""
    from app.models.journal_entry import JournalEntry
    from app.models.journal_entry_line import JournalEntryLine
    from app.models.scenario import Scenario
    from app.models.account import Account
    import datetime

    factory = sessionmaker(bind=engine)
    db = factory()
    try:
        # Create entity
        r = client.post("/api/v1/entities/", json={
            "code": "BLOCKER",
            "name": "Blocked Entity",
            "entity_type": "operating",
            "currency": "USD",
            "fiscal_year_end_month": 12,
            "fiscal_year_convention": "calendar",
        })
        entity_id = r.json()["id"]

        # Seed scenario + accounts + JE directly
        sc = Scenario(code="ACTUAL-BLK", name="Actual", scenario_type="actual")
        db.add(sc)
        db.flush()

        acct = Account(entity_id=entity_id, account_number="1000", account_name="Cash",
                       account_type="asset", normal_balance="debit")
        db.add(acct)
        db.flush()

        je = JournalEntry(
            je_number="JE-BLK-001",
            entry_date=datetime.date.today(),
            entity_id=entity_id,
            scenario_id=sc.id,
            description="Blocker JE",
            source="test",
            status="draft",
        )
        db.add(je)
        db.flush()
        db.add(JournalEntryLine(
            journal_entry_id=je.id, line_number=1,
            account_id=acct.id, entity_id=entity_id,
            debit=100, credit=0,
        ))
        db.add(JournalEntryLine(
            journal_entry_id=je.id, line_number=2,
            account_id=acct.id, entity_id=entity_id,
            debit=0, credit=100,
        ))
        db.commit()
    finally:
        db.close()

    r = client.delete(f"/api/v1/entities/{entity_id}")
    assert r.status_code == 409
    assert "journal entries" in r.json()["detail"]


# ---------------------------------------------------------------------------
# Entity deactivate (PATCH active=false still works)
# ---------------------------------------------------------------------------

def test_deactivate_entity(client):
    """PATCH active=false deactivates without blocking."""
    r = client.post("/api/v1/entities/", json={
        "code": "DEACT01",
        "name": "Deactivatable Entity",
        "entity_type": "operating",
        "currency": "USD",
        "fiscal_year_end_month": 12,
        "fiscal_year_convention": "calendar",
    })
    entity_id = r.json()["id"]
    r = client.patch(f"/api/v1/entities/{entity_id}", json={"active": False})
    assert r.status_code == 200
    assert r.json()["active"] is False
