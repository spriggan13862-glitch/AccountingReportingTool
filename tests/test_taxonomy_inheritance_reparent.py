from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models
from app.database import Base
from app.api.deps import get_db
from app.main import app
from app.models.account import Account
from app.models.reporting_taxonomy import ReportingTaxonomyLine

@pytest.fixture(scope="module")
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    # Seed basic taxonomy lines
    db = Session()
    tax_rev = ReportingTaxonomyLine(id=101, code="revenue", name="Revenue", section="revenue", active=True, sort_order=1)
    tax_exp = ReportingTaxonomyLine(id=102, code="expense", name="Operating Expenses", section="expense", active=True, sort_order=2)
    db.add_all([tax_rev, tax_exp])
    db.commit()
    db.close()

    def override_db():
        db = Session()
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(scope="module")
def entity_id(client):
    r = client.post("/api/v1/entities/", json={
        "code": "TXNH",
        "name": "Taxonomy Inheritance Test Entity",
        "entity_type": "operating",
        "currency": "USD",
        "fiscal_year_end_month": 12,
        "fiscal_year_convention": "calendar",
    })
    assert r.status_code == 201
    return r.json()["id"]


def test_clear_reporting_taxonomy_line(client, entity_id):
    # Create account with a mapping
    r = client.post("/api/v1/accounts/", json={
        "entity_id": entity_id,
        "account_number": "4000",
        "account_name": "Sales",
        "account_type": "revenue",
        "normal_balance": "credit",
        "reporting_taxonomy_line_id": 101,
    })
    assert r.status_code == 201
    acct = r.json()
    acct_id = acct["id"]
    assert acct["reporting_taxonomy_line_id"] == 101

    # Update and explicitly set reporting_taxonomy_line_id to None
    r2 = client.patch(f"/api/v1/accounts/{acct_id}", json={
        "reporting_taxonomy_line_id": None
    })
    assert r2.status_code == 200
    assert r2.json()["reporting_taxonomy_line_id"] is None


def test_reparent_taxonomy_inheritance_cascade(client, entity_id):
    # Setup:
    # Parent A (revenue line 101)
    # Child B (inherits 101)
    # Target Parent C (expense line 102)
    r_a = client.post("/api/v1/accounts/", json={
        "entity_id": entity_id,
        "account_number": "5000",
        "account_name": "Parent A",
        "account_type": "revenue",
        "normal_balance": "credit",
        "reporting_taxonomy_line_id": 101,
    })
    acct_a = r_a.json()

    r_b = client.post("/api/v1/accounts/", json={
        "entity_id": entity_id,
        "account_number": "5001",
        "account_name": "Child B",
        "account_type": "revenue",
        "normal_balance": "credit",
        "parent_account_id": acct_a["id"],
        "reporting_taxonomy_line_id": 101,  # inherited from parent
    })
    acct_b = r_b.json()

    r_c = client.post("/api/v1/accounts/", json={
        "entity_id": entity_id,
        "account_number": "6000",
        "account_name": "Parent C",
        "account_type": "expense",
        "normal_balance": "debit",
        "reporting_taxonomy_line_id": 102,
    })
    acct_c = r_c.json()

    # Reparent B to C. Since B matches A's mapping (101), B's mapping should update to C's mapping (102).
    r_rep = client.post(f"/api/v1/accounts/{acct_b['id']}/reparent", json={
        "parent_account_id": acct_c["id"]
    })
    assert r_rep.status_code == 200

    # Fetch B to verify updated mapping
    r_b_updated = client.get(f"/api/v1/accounts/{acct_b['id']}")
    assert r_b_updated.json()["reporting_taxonomy_line_id"] == 102


def test_reparent_taxonomy_override_persists(client, entity_id):
    # Setup:
    # Parent A (revenue line 101)
    # Child B (manual override: expense line 102)
    # Target Parent C (revenue line 101)
    r_a = client.post("/api/v1/accounts/", json={
        "entity_id": entity_id,
        "account_number": "7000",
        "account_name": "Parent A",
        "account_type": "revenue",
        "normal_balance": "credit",
        "reporting_taxonomy_line_id": 101,
    })
    acct_a = r_a.json()

    r_b = client.post("/api/v1/accounts/", json={
        "entity_id": entity_id,
        "account_number": "7001",
        "account_name": "Child B (manual override)",
        "account_type": "expense",
        "normal_balance": "debit",
        "parent_account_id": acct_a["id"],
        "reporting_taxonomy_line_id": 102,  # Manual override
    })
    acct_b = r_b.json()

    r_c = client.post("/api/v1/accounts/", json={
        "entity_id": entity_id,
        "account_number": "8000",
        "account_name": "Parent C",
        "account_type": "revenue",
        "normal_balance": "credit",
        "reporting_taxonomy_line_id": 101,
    })
    acct_c = r_c.json()

    # Reparent B to C. Since B's mapping (102) does NOT match A's mapping (101), it is a manual override and should NOT change.
    r_rep = client.post(f"/api/v1/accounts/{acct_b['id']}/reparent", json={
        "parent_account_id": acct_c["id"]
    })
    assert r_rep.status_code == 200

    # Fetch B to verify mapping remains 102
    r_b_updated = client.get(f"/api/v1/accounts/{acct_b['id']}")
    assert r_b_updated.json()["reporting_taxonomy_line_id"] == 102
