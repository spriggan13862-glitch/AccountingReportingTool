"""
Sprint H — Taxonomy Mapping Workbench backend tests.
Tests: locked field prevents bulk-assign overwrites, copy-from-view, bulk-assign.
"""
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
from app.models.entity import Entity
from app.models.reporting_taxonomy import ReportingTaxonomyLine, ReportingTaxonomyView
from app.models.view_account_override import ViewAccountOverride


@pytest.fixture(scope="module")
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    db = Session()
    entity = Entity(id=1, code="TEST", name="Test Entity", entity_type="operating", currency="USD", fiscal_year_end_month=12, fiscal_year_convention="calendar", active=True)
    view_gaap = ReportingTaxonomyView(id=10, code="gaap", name="GAAP", is_default=True, is_system_defined=True, active=True)
    view_tax = ReportingTaxonomyView(id=11, code="tax", name="Tax", is_default=False, is_system_defined=False, active=True)
    tax_line_1 = ReportingTaxonomyLine(id=101, code="cash", name="Cash & Equivalents", section="asset", active=True, sort_order=1)
    tax_line_2 = ReportingTaxonomyLine(id=102, code="ar", name="Accounts Receivable", section="asset", active=True, sort_order=2)
    acct_1 = Account(id=1001, entity_id=1, account_number="1000", account_name="Cash", account_type="asset", normal_balance="debit", active=True, is_postable=True)
    acct_2 = Account(id=1002, entity_id=1, account_number="1100", account_name="Accounts Receivable", account_type="asset", normal_balance="debit", active=True, is_postable=True)
    acct_3 = Account(id=1003, entity_id=1, account_number="1200", account_name="Inventory", account_type="asset", normal_balance="debit", active=True, is_postable=True)
    db.add_all([entity, view_gaap, view_tax, tax_line_1, tax_line_2, acct_1, acct_2, acct_3])
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


def test_bulk_assign(client):
    """bulk-assign creates overrides for multiple accounts"""
    resp = client.post(
        "/api/v1/fsli-mappings/1/10/bulk-assign",
        json={"account_ids": [1001, 1002], "taxonomy_line_id": 101},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["updated"] == 2


def test_locked_field_prevents_bulk_overwrite(client):
    """Locked account is skipped in bulk-assign"""
    # Lock account 1001
    lock_resp = client.put(
        "/api/v1/fsli-mappings/1/10/1001",
        json={"locked": True, "taxonomy_line_id": 101},
    )
    assert lock_resp.status_code == 200

    # Now bulk-assign a different taxonomy line to both accounts
    resp = client.post(
        "/api/v1/fsli-mappings/1/10/bulk-assign",
        json={"account_ids": [1001, 1002], "taxonomy_line_id": 102},
    )
    assert resp.status_code == 200
    data = resp.json()
    # Only account 1002 should be updated (1001 is locked)
    assert data["updated"] == 1

    # Verify 1001 still has taxonomy_line_id=101
    list_resp = client.get("/api/v1/fsli-mappings/", params={"entity_id": 1, "view_id": 10})
    assert list_resp.status_code == 200
    mappings = {m["account_id"]: m for m in list_resp.json()}
    assert mappings[1001]["taxonomy_line_id"] == 101

    # Unlock account 1001 for subsequent tests
    client.put("/api/v1/fsli-mappings/1/10/1001", json={"locked": False, "taxonomy_line_id": 101})


def test_copy_from_view(client):
    """copy-from endpoint copies mappings from source to target view"""
    # Seed source view (GAAP=10) with a mapping for account 1003
    client.put(
        "/api/v1/fsli-mappings/1/10/1003",
        json={"taxonomy_line_id": 101},
    )

    # Copy from GAAP (10) to Tax (11)
    resp = client.post("/api/v1/fsli-mappings/1/11/copy-from/10")
    assert resp.status_code == 200
    data = resp.json()
    assert data["copied"] >= 1

    # Verify tax view now has account 1003 mapped
    list_resp = client.get("/api/v1/fsli-mappings/", params={"entity_id": 1, "view_id": 11})
    assert list_resp.status_code == 200
    tax_mappings = {m["account_id"]: m for m in list_resp.json()}
    assert 1003 in tax_mappings
    assert tax_mappings[1003]["taxonomy_line_id"] == 101


def test_copy_from_view_skips_existing(client):
    """Accounts already mapped in target view are skipped"""
    # account 1003 already exists in view 11 from previous test
    initial_resp = client.get("/api/v1/fsli-mappings/", params={"entity_id": 1, "view_id": 11})
    initial_count = len(initial_resp.json())

    # Copy again — should skip all already-mapped accounts
    resp = client.post("/api/v1/fsli-mappings/1/11/copy-from/10")
    assert resp.status_code == 200

    # Count should not have increased (all already there)
    after_resp = client.get("/api/v1/fsli-mappings/", params={"entity_id": 1, "view_id": 11})
    assert len(after_resp.json()) == initial_count
