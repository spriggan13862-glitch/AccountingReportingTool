"""
M29 integration smoke tests — verify that the frontend/backend integration
works correctly end-to-end:

1.  CORS headers present for all dev frontend origins
2.  Entities endpoint: create, list (paginated), fiscal year fields
3.  Onboarding status endpoint responds with correct shape
4.  TB import: detect (multipart), upload batch (multipart)
5.  Frontend-expected field shapes match backend responses
6.  upload API returns the fields the frontend ImportBatch type expects
"""

import datetime
import io

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base
from app.api.deps import get_db
from app.main import app

TODAY = datetime.date.today().isoformat()


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
        cur.execute("PRAGMA foreign_keys = ON")
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


@pytest.fixture(scope="module")
def org_id(engine):
    """Create an organization directly in DB; import_batches FK requires it."""
    from app.models.organization import Organization
    factory = sessionmaker(bind=engine)
    db = factory()
    try:
        org = Organization(name="Smoke Org", slug="smoke-org")
        db.add(org)
        db.commit()
        db.refresh(org)
        return org.id
    finally:
        db.close()


@pytest.fixture(scope="module")
def entity_id(client):
    r = client.post("/api/v1/entities/", json={
        "code": "SMOKE1",
        "name": "Smoke Test Entity",
        "entity_type": "operating",
        "currency": "USD",
        "fiscal_year_end_month": 12,
        "fiscal_year_convention": "calendar",
    })
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ---------------------------------------------------------------------------
# 1. CORS — preflight and actual requests from dev origins
# ---------------------------------------------------------------------------

FRONTEND_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
]

@pytest.mark.parametrize("origin", FRONTEND_ORIGINS)
def test_cors_preflight_allowed(client, origin):
    """OPTIONS preflight from every dev origin must get back CORS headers."""
    r = client.options(
        "/api/v1/entities/",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert r.status_code in (200, 204), f"Preflight failed for {origin}: {r.status_code}"
    acao = r.headers.get("access-control-allow-origin", "")
    assert acao == origin or acao == "*", (
        f"Access-Control-Allow-Origin missing or wrong for {origin}: got {acao!r}"
    )


@pytest.mark.parametrize("origin", FRONTEND_ORIGINS)
def test_cors_actual_request_has_header(client, origin):
    """GET from each dev origin must echo the Allow-Origin header."""
    r = client.get("/api/v1/entities/", headers={"Origin": origin})
    assert r.status_code == 200
    acao = r.headers.get("access-control-allow-origin", "")
    assert acao == origin or acao == "*", f"Missing ACAO for {origin}: got {acao!r}"


# ---------------------------------------------------------------------------
# 2. Entities CRUD — fiscal year fields round-trip
# ---------------------------------------------------------------------------

def test_create_entity_with_fiscal_year(client):
    r = client.post("/api/v1/entities/", json={
        "code": "FY_TEST",
        "name": "Fiscal Year Entity",
        "entity_type": "operating",
        "currency": "GBP",
        "fiscal_year_end_month": 3,
        "fiscal_year_convention": "52-53-week",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["fiscal_year_end_month"] == 3
    assert body["fiscal_year_convention"] == "52-53-week"


def test_list_entities_returns_paginated_shape(client, entity_id):
    r = client.get("/api/v1/entities/")
    assert r.status_code == 200
    body = r.json()
    # Backend returns Page shape — frontend api client unwraps .items
    assert "items" in body, "Expected paginated response with 'items' key"
    assert "total" in body
    assert isinstance(body["items"], list)
    assert body["total"] >= 1


def test_entity_items_have_expected_fields(client, entity_id):
    r = client.get(f"/api/v1/entities/{entity_id}")
    assert r.status_code == 200
    body = r.json()
    # Fields the frontend Entity type expects
    for field in ("id", "code", "name", "entity_type", "currency", "active",
                  "fiscal_year_end_month", "fiscal_year_convention"):
        assert field in body, f"Missing field: {field}"


def test_patch_entity_fiscal_year(client, entity_id):
    r = client.patch(f"/api/v1/entities/{entity_id}", json={
        "fiscal_year_end_month": 6,
        "fiscal_year_convention": "calendar",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["fiscal_year_end_month"] == 6
    assert body["fiscal_year_convention"] == "calendar"


# ---------------------------------------------------------------------------
# 3. Onboarding status
# ---------------------------------------------------------------------------

def test_onboarding_status_shape(client):
    r = client.get("/api/v1/setup/onboarding-status")
    assert r.status_code == 200
    body = r.json()
    expected = (
        "entity_count", "active_entity_count", "import_batch_count",
        "pending_imports", "posted_imports", "unmapped_line_count",
        "has_journal_entries", "setup_steps_complete", "setup_progress",
    )
    for field in expected:
        assert field in body, f"Missing field in onboarding-status: {field}"
    assert isinstance(body["setup_steps_complete"], list)
    assert 0 <= body["setup_progress"] <= 100
    # Entity was created so entity_created should be in steps
    assert body["entity_count"] >= 1
    assert "entity_created" in body["setup_steps_complete"]


# ---------------------------------------------------------------------------
# 4. TB import — file detect (multipart)
# ---------------------------------------------------------------------------

SAMPLE_CSV = b"Account Number,Account Name,Debit,Credit\n1000,Cash,50000,\n2000,Payables,,30000\n"


def test_detect_file_returns_shape(client):
    r = client.post(
        "/api/v1/tb-imports/detect",
        files={"file": ("tb.csv", io.BytesIO(SAMPLE_CSV), "text/csv")},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    for field in ("source_format", "headers", "detected_mapping", "confidence", "preview_rows"):
        assert field in body, f"Missing field: {field}"
    # format detection may classify standard CSV as "csv" or a known system format
    assert body["source_format"] in ("csv", "netsuite", "quickbooks", "sage", "xlsx")
    assert isinstance(body["headers"], list)
    assert body["confidence"] >= 0


def test_detect_file_maps_account_number(client):
    r = client.post(
        "/api/v1/tb-imports/detect",
        files={"file": ("tb.csv", io.BytesIO(SAMPLE_CSV), "text/csv")},
    )
    assert r.status_code == 200
    mapping = r.json()["detected_mapping"]
    assert "account_number" in mapping, f"account_number not mapped: {mapping}"


# ---------------------------------------------------------------------------
# 5. TB import — upload batch (multipart)
# ---------------------------------------------------------------------------

def test_upload_batch_returns_import_batch_shape(client, entity_id, org_id):
    r = client.post(
        "/api/v1/tb-imports/batches/upload",
        data={
            "entity_id": str(entity_id),
            "organization_id": str(org_id),
            "as_of_date": TODAY,
        },
        files={"file": ("trial_balance.csv", io.BytesIO(SAMPLE_CSV), "text/csv")},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    # Fields the frontend ImportBatch type expects
    for field in ("id", "filename", "status", "row_count", "as_of_date",
                  "total_debits", "total_credits", "uploaded_at"):
        assert field in body, f"Missing ImportBatch field: {field}"
    assert body["filename"] == "trial_balance.csv"
    assert body["status"] in (
        "uploaded", "parsing", "mapping_required", "validating",
        "validation_failed", "ready_to_post",
    )


def test_list_batches_returns_array(client, org_id):
    r = client.get("/api/v1/tb-imports/batches/", params={"organization_id": org_id})
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list), "Expected array response from list_batches"
    assert len(body) >= 1


# ---------------------------------------------------------------------------
# 6. Setup status endpoint (used for first-run setup wizard)
# ---------------------------------------------------------------------------

def test_setup_status_returns_user_count(client):
    r = client.get("/api/v1/setup/status")
    assert r.status_code == 200
    body = r.json()
    assert "setup_complete" in body
    assert "user_count" in body
    assert isinstance(body["user_count"], int)
