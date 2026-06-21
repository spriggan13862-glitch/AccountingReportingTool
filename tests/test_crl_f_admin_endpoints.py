"""
CRL-F tests — admin CRUD endpoints for Settings → Reporting Lines /
Reporting Templates.

Covers:
  - POST /common-reporting-lines/ (org-specific custom CRL creation)
  - PATCH /common-reporting-lines/{id} with clone-on-edit semantics
  - PATCH refuses code mutation, system rows without org_id, mandatory
    deactivation
  - DELETE soft-deletes; refuses system + mandatory rows
  - POST/PATCH/DELETE /common-reporting-lines/templates with same guards
  - GET /templates/{id}/crls returns membership rows
  - PUT /templates/{id}/crls bulk add/remove/update with diff counts
"""
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.database import Base
from app.main import app
from app.api.deps import get_db, get_required_user, get_current_user
from app.services.crl_service import (
    seed_crl_catalog,
    get_crl_by_code,
    create_template,
)
from app.models.organization import Organization
from app.models.common_reporting_line import (
    CommonReportingLine,
    ReportingTemplate,
    ReportingTemplateCrl,
)


@pytest.fixture
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


@pytest.fixture
def Session(engine):
    return sessionmaker(bind=engine)


@pytest.fixture
def client(engine, Session):
    def override():
        db = Session()
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
    app.dependency_overrides[get_db] = override
    app.dependency_overrides[get_required_user] = lambda: type("U", (), {"id": 1})()
    app.dependency_overrides[get_current_user] = lambda: type("U", (), {"id": 1})()
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def seeded(Session):
    s = Session()
    org = Organization(name="ACME", slug="acme")
    s.add(org); s.flush()
    seed_crl_catalog(s)
    s.commit()
    out = {"org_id": org.id}
    s.close()
    return out


# ---------------------------------------------------------------------------
# POST /common-reporting-lines/ — create custom CRL
# ---------------------------------------------------------------------------

def test_create_custom_crl_success(client, seeded):
    r = client.post("/api/v1/common-reporting-lines/", json={
        "code": "CRL_ACME_FOUNDER_LOANS",
        "name": "Founder Loans Payable",
        "section": "Liabilities",
        "statement_type": "Balance Sheet",
        "organization_id": seeded["org_id"],
        "normal_balance": "credit",
        "sort_order": 250,
    })
    assert r.status_code == 201
    body = r.json()
    assert body["code"] == "CRL_ACME_FOUNDER_LOANS"
    assert body["organization_id"] == seeded["org_id"]
    assert body["is_system"] is False


def test_create_custom_crl_rejects_non_prefixed_code(client, seeded):
    r = client.post("/api/v1/common-reporting-lines/", json={
        "code": "FOUNDER_LOANS",  # missing CRL_ prefix
        "name": "Founder Loans",
        "section": "Liabilities",
        "statement_type": "Balance Sheet",
        "organization_id": seeded["org_id"],
    })
    assert r.status_code == 400
    assert "CRL_" in r.json()["detail"]


def test_create_custom_crl_rejects_duplicate_code_in_same_org(client, seeded):
    payload = {
        "code": "CRL_ACME_CUSTOM",
        "name": "Custom",
        "section": "Assets",
        "statement_type": "Balance Sheet",
        "organization_id": seeded["org_id"],
    }
    assert client.post("/api/v1/common-reporting-lines/", json=payload).status_code == 201
    r = client.post("/api/v1/common-reporting-lines/", json=payload)
    assert r.status_code == 409


# ---------------------------------------------------------------------------
# PATCH /common-reporting-lines/{id} — clone-on-edit + mutation guards
# ---------------------------------------------------------------------------

def test_patch_system_crl_with_org_id_clones_and_mutates(client, seeded, Session):
    s = Session()
    cash = get_crl_by_code(s, "CRL_CASH")
    system_id = cash.id
    s.close()

    r = client.patch(f"/api/v1/common-reporting-lines/{system_id}", json={
        "name": "Cash on Hand (ACME)",
        "organization_id": seeded["org_id"],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["code"] == "CRL_CASH"
    assert body["name"] == "Cash on Hand (ACME)"
    assert body["organization_id"] == seeded["org_id"]
    # The clone is a separate row — system row stays intact.
    assert body["id"] != system_id


def test_patch_system_crl_without_org_id_returns_409(client, seeded, Session):
    s = Session()
    cash_id = get_crl_by_code(s, "CRL_CASH").id
    s.close()
    r = client.patch(f"/api/v1/common-reporting-lines/{cash_id}", json={
        "name": "Cash (renamed)",
    })
    assert r.status_code == 409


def test_patch_rejects_code_mutation(client, seeded, Session):
    s = Session()
    cash_id = get_crl_by_code(s, "CRL_CASH").id
    s.close()
    # Pydantic with extra="forbid" should reject `code` outright (422).
    r = client.patch(f"/api/v1/common-reporting-lines/{cash_id}", json={
        "code": "CRL_RENAMED",
        "organization_id": seeded["org_id"],
    })
    assert r.status_code == 422


def test_patch_org_clone_mutates_in_place(client, seeded, Session):
    # First clone via PATCH so the org row exists.
    s = Session()
    cash_id = get_crl_by_code(s, "CRL_CASH").id
    s.close()
    r1 = client.patch(f"/api/v1/common-reporting-lines/{cash_id}", json={
        "name": "Cash A", "organization_id": seeded["org_id"],
    })
    assert r1.status_code == 200
    clone_id = r1.json()["id"]

    # Second PATCH should mutate the clone, not create another.
    r2 = client.patch(f"/api/v1/common-reporting-lines/{clone_id}", json={
        "name": "Cash B", "organization_id": seeded["org_id"],
    })
    assert r2.status_code == 200
    assert r2.json()["id"] == clone_id
    assert r2.json()["name"] == "Cash B"


def test_patch_refuses_deactivating_mandatory_clone(client, seeded, Session):
    """A mandatory CRL stays mandatory after clone — admin can't deactivate it."""
    s = Session()
    unclassified_id = get_crl_by_code(s, "CRL_UNCLASSIFIED").id
    s.close()
    # Clone first via a rename.
    r1 = client.patch(f"/api/v1/common-reporting-lines/{unclassified_id}", json={
        "name": "Custom label", "organization_id": seeded["org_id"],
    })
    assert r1.status_code == 200
    clone_id = r1.json()["id"]

    r2 = client.patch(f"/api/v1/common-reporting-lines/{clone_id}", json={
        "is_active": False, "organization_id": seeded["org_id"],
    })
    assert r2.status_code == 409
    assert "mandatory" in r2.json()["detail"].lower()


# ---------------------------------------------------------------------------
# DELETE /common-reporting-lines/{id}
# ---------------------------------------------------------------------------

def test_delete_system_crl_refused(client, seeded, Session):
    s = Session()
    cash_id = get_crl_by_code(s, "CRL_CASH").id
    s.close()
    r = client.delete(f"/api/v1/common-reporting-lines/{cash_id}")
    assert r.status_code == 409


def test_delete_org_clone_soft_deletes(client, seeded, Session):
    s = Session()
    cash_id = get_crl_by_code(s, "CRL_CASH").id
    s.close()
    r1 = client.patch(f"/api/v1/common-reporting-lines/{cash_id}", json={
        "name": "Cash", "organization_id": seeded["org_id"],
    })
    clone_id = r1.json()["id"]

    r2 = client.delete(f"/api/v1/common-reporting-lines/{clone_id}")
    assert r2.status_code == 200
    assert r2.json()["is_active"] is False


def test_delete_mandatory_clone_refused(client, seeded, Session):
    s = Session()
    needs_review_id = get_crl_by_code(s, "CRL_NEEDS_REVIEW").id
    s.close()
    r1 = client.patch(f"/api/v1/common-reporting-lines/{needs_review_id}", json={
        "name": "NR", "organization_id": seeded["org_id"],
    })
    clone_id = r1.json()["id"]
    r2 = client.delete(f"/api/v1/common-reporting-lines/{clone_id}")
    assert r2.status_code == 409


# ---------------------------------------------------------------------------
# Templates: POST / PATCH / DELETE
# ---------------------------------------------------------------------------

def test_create_template_success(client, seeded):
    r = client.post("/api/v1/common-reporting-lines/templates", json={
        "code": "acme_internal",
        "name": "ACME Internal Reporting",
        "organization_id": seeded["org_id"],
        "description": "Custom template",
    })
    assert r.status_code == 201
    assert r.json()["organization_id"] == seeded["org_id"]
    assert r.json()["is_system"] is False


def test_patch_system_template_refused(client, seeded, Session):
    s = Session()
    smb_id = s.query(ReportingTemplate).filter_by(code="smb_general").first().id
    s.close()
    r = client.patch(f"/api/v1/common-reporting-lines/templates/{smb_id}", json={
        "name": "Renamed",
    })
    assert r.status_code == 409


def test_patch_org_template_updates(client, seeded, Session):
    r1 = client.post("/api/v1/common-reporting-lines/templates", json={
        "code": "acme_t", "name": "Original",
        "organization_id": seeded["org_id"],
    })
    tid = r1.json()["id"]
    r2 = client.patch(f"/api/v1/common-reporting-lines/templates/{tid}", json={
        "name": "Updated", "description": "now with desc",
    })
    assert r2.status_code == 200
    assert r2.json()["name"] == "Updated"


def test_delete_system_template_refused(client, seeded, Session):
    s = Session()
    smb_id = s.query(ReportingTemplate).filter_by(code="smb_general").first().id
    s.close()
    r = client.delete(f"/api/v1/common-reporting-lines/templates/{smb_id}")
    assert r.status_code == 409


def test_delete_org_template_soft_deletes(client, seeded):
    r1 = client.post("/api/v1/common-reporting-lines/templates", json={
        "code": "acme_t2", "name": "T2",
        "organization_id": seeded["org_id"],
    })
    tid = r1.json()["id"]
    r2 = client.delete(f"/api/v1/common-reporting-lines/templates/{tid}")
    assert r2.status_code == 200
    assert r2.json()["is_active"] is False


# ---------------------------------------------------------------------------
# Templates: GET / PUT membership
# ---------------------------------------------------------------------------

def test_get_template_crls_returns_membership(client, seeded, Session):
    s = Session()
    smb_id = s.query(ReportingTemplate).filter_by(code="smb_general").first().id
    s.close()
    r = client.get(f"/api/v1/common-reporting-lines/templates/{smb_id}/crls")
    assert r.status_code == 200
    body = r.json()
    assert len(body) > 0
    assert all("crl_id" in row and "is_visible" in row for row in body)


def test_put_template_crls_diffs_correctly(client, seeded, Session):
    s = Session()
    # Create a fresh org template so we can write through it.
    tpl = create_template(s, code="acme_diff", name="Diff Test",
                         organization_id=seeded["org_id"])
    tid = tpl.id
    cash_id = get_crl_by_code(s, "CRL_CASH").id
    ar_id = get_crl_by_code(s, "CRL_AR").id
    ap_id = get_crl_by_code(s, "CRL_AP").id
    s.commit()
    s.close()

    # Initial: add cash + ar
    r1 = client.put(f"/api/v1/common-reporting-lines/templates/{tid}/crls", json={
        "selections": [
            {"crl_id": cash_id, "is_visible": True, "sort_order": 10},
            {"crl_id": ar_id, "is_visible": True, "sort_order": 20},
        ],
        "organization_id": seeded["org_id"],
    })
    assert r1.status_code == 200
    assert r1.json() == {"template_id": tid, "added": 2, "removed": 0, "updated": 0}

    # Second pass: drop ar, add ap, change cash visibility — added=1, removed=1, updated=1
    r2 = client.put(f"/api/v1/common-reporting-lines/templates/{tid}/crls", json={
        "selections": [
            {"crl_id": cash_id, "is_visible": False, "sort_order": 10},
            {"crl_id": ap_id, "is_visible": True, "sort_order": 30},
        ],
        "organization_id": seeded["org_id"],
    })
    assert r2.status_code == 200
    body = r2.json()
    assert body["added"] == 1
    assert body["removed"] == 1
    assert body["updated"] == 1


def test_put_system_template_crls_refused(client, seeded, Session):
    s = Session()
    smb_id = s.query(ReportingTemplate).filter_by(code="smb_general").first().id
    cash_id = get_crl_by_code(s, "CRL_CASH").id
    s.close()
    r = client.put(f"/api/v1/common-reporting-lines/templates/{smb_id}/crls", json={
        "selections": [{"crl_id": cash_id, "is_visible": True, "sort_order": 0}],
    })
    assert r.status_code == 409


def test_404_on_unknown_crl_id(client, seeded):
    r = client.patch("/api/v1/common-reporting-lines/99999", json={
        "name": "x", "organization_id": seeded["org_id"],
    })
    assert r.status_code == 404


def test_404_on_unknown_template_id(client, seeded):
    r = client.patch("/api/v1/common-reporting-lines/templates/99999", json={
        "name": "x",
    })
    assert r.status_code == 404
