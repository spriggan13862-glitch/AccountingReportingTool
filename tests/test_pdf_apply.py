"""
Reproducer for PDF import apply 500 error.

Uploads the hero_group PDF fixture, then POSTs to /apply and asserts status 200.
If the endpoint returns 500, the full response body is printed.
"""
from __future__ import annotations

import pathlib
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base
from app.api.deps import get_db
from app.main import app

FIXTURE_PDF = pathlib.Path(__file__).parent / "fixtures" / "pdf" / "hero_group_financial_statements_2025.pdf"


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
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)


def test_pdf_upload_and_apply(client):
    """Upload the hero_group PDF and apply it; assert 200, print body on failure."""
    assert FIXTURE_PDF.exists(), f"Fixture PDF not found: {FIXTURE_PDF}"

    # Step 1: upload
    with FIXTURE_PDF.open("rb") as f:
        upload_resp = client.post(
            "/api/v1/pdf-imports/upload",
            files={"file": ("hero_group_financial_statements_2025.pdf", f, "application/pdf")},
            data={"entity_id": "1"},
        )

    print("\n--- UPLOAD RESPONSE ---")
    print(f"Status: {upload_resp.status_code}")
    print(f"Body:   {upload_resp.text}")

    assert upload_resp.status_code == 201, (
        f"Upload failed with {upload_resp.status_code}: {upload_resp.text}"
    )

    batch_id = upload_resp.json()["batch_id"]
    print(f"batch_id: {batch_id}")

    # Step 2: apply (force_apply bypasses balance-sheet-tie check for test fixture)
    apply_resp = client.post(f"/api/v1/pdf-imports/{batch_id}/apply?force_apply=true")

    print("\n--- APPLY RESPONSE ---")
    print(f"Status: {apply_resp.status_code}")
    print(f"Body:   {apply_resp.text}")

    assert apply_resp.status_code == 200, (
        f"Apply returned {apply_resp.status_code}.\n"
        f"Full response body:\n{apply_resp.text}"
    )


def test_pdf_apply_accounts_queryable(client, engine):
    """Verify that accounts created by applying a PDF import are queryable via endpoints."""
    from app.models.organization import Organization
    from app.models.entity import Entity
    from app.models.scenario import Scenario
    
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    
    # Create Organization
    org = Organization(name="Test Org", slug="test-org", is_active=True)
    session.add(org)
    session.flush()
    
    # Create Entity
    entity = Entity(organization_id=org.id, name="Test Entity", code="TENT", entity_type="operating", currency="USD")
    session.add(entity)
    session.flush()
    
    # Create Scenario
    scen = Scenario(organization_id=org.id, code="ACT", name="Actual", scenario_type="actual")
    session.add(scen)
    session.commit()
    
    entity_id = entity.id
    
    # Step 1: upload
    with FIXTURE_PDF.open("rb") as f:
        upload_resp = client.post(
            "/api/v1/pdf-imports/upload",
            files={"file": ("hero_group_financial_statements_2025.pdf", f, "application/pdf")},
            data={"entity_id": str(entity_id), "basis_override": "accrual", "statement_scope": "standalone", "force": "true"}
        )
    assert upload_resp.status_code == 201, upload_resp.text
    batch_id = upload_resp.json()["batch_id"]
    
    # Step 2: apply
    apply_resp = client.post(f"/api/v1/pdf-imports/{batch_id}/apply?force_apply=true")
    assert apply_resp.status_code == 200, apply_resp.text
    
    # Step 3: query accounts list
    list_resp = client.get(f"/api/v1/accounts/?entity_id={entity_id}")
    assert list_resp.status_code == 200, list_resp.text
    list_data = list_resp.json()
    assert list_data["total"] > 0
    
    # Step 4: query accounts tree
    tree_resp = client.get(f"/api/v1/accounts/tree?entity_id={entity_id}")
    assert tree_resp.status_code == 200, tree_resp.text
    tree_data = tree_resp.json()
    assert len(tree_data) > 0

