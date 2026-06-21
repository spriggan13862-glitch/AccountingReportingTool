"""
CRL-E tests — list endpoints powering the wizard step-4 CRL picker.

Covers:
  - GET /common-reporting-lines/ returns the 72-row system catalog
  - GET /common-reporting-lines/?organization_id=N includes org clones + system
  - GET /common-reporting-lines/?template_id=N filters via ReportingTemplateCrl
  - Template filter applies display_label override
  - Template filter respects is_visible flag
  - GET /common-reporting-lines/templates lists 8 system templates
  - Templates ordered by code; mandatory rows present in catalog
"""
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.database import Base
from app.main import app
from app.api.deps import get_db, get_required_user, get_current_user
from app.services.crl_service import seed_crl_catalog, get_crl_by_code
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
# GET /common-reporting-lines/ — full catalog
# ---------------------------------------------------------------------------

def test_list_all_returns_72_system_crls(client, seeded):
    r = client.get("/api/v1/common-reporting-lines/")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 72
    codes = {row["code"] for row in body}
    assert "CRL_CASH" in codes
    assert "CRL_UNCLASSIFIED" in codes
    assert "CRL_NEEDS_REVIEW" in codes


def test_list_response_shape_matches_frontend_contract(client, seeded):
    r = client.get("/api/v1/common-reporting-lines/")
    assert r.status_code == 200
    row = next(b for b in r.json() if b["code"] == "CRL_CASH")
    expected_keys = {
        "id", "code", "name", "description", "parent_crl_id", "section",
        "statement_type", "normal_balance", "sort_order", "is_system",
        "is_mandatory", "organization_id",
    }
    assert expected_keys.issubset(row.keys())
    assert row["is_system"] is True
    assert row["organization_id"] is None


def test_list_with_org_id_includes_org_clones_preferring_clone(client, seeded, Session):
    s = Session()
    system_cash = get_crl_by_code(s, "CRL_CASH")
    clone = CommonReportingLine(
        code="CRL_CASH",
        name="Cash (ACME custom label)",
        section=system_cash.section,
        statement_type=system_cash.statement_type,
        normal_balance=system_cash.normal_balance,
        sort_order=system_cash.sort_order,
        is_system=False,
        is_mandatory=False,
        is_active=True,
        organization_id=seeded["org_id"],
    )
    s.add(clone); s.commit()
    s.close()

    r = client.get(f"/api/v1/common-reporting-lines/?organization_id={seeded['org_id']}")
    assert r.status_code == 200
    body = r.json()
    cash_rows = [b for b in body if b["code"] == "CRL_CASH"]
    assert len(cash_rows) == 1
    assert cash_rows[0]["organization_id"] == seeded["org_id"]
    assert cash_rows[0]["name"] == "Cash (ACME custom label)"


# ---------------------------------------------------------------------------
# GET /common-reporting-lines/?template_id=N — template-filtered
# ---------------------------------------------------------------------------

def test_list_with_template_filter_returns_only_template_crls(client, seeded, Session):
    s = Session()
    smb = s.query(ReportingTemplate).filter_by(code="smb_general").first()
    assert smb is not None
    template_id = smb.id
    expected_count = s.query(ReportingTemplateCrl).filter_by(
        template_id=template_id, is_visible=True,
    ).count()
    s.close()

    r = client.get(f"/api/v1/common-reporting-lines/?template_id={template_id}")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == expected_count
    assert all(row["is_system"] for row in body)


def test_list_with_template_applies_display_label_override(client, seeded, Session):
    s = Session()
    smb = s.query(ReportingTemplate).filter_by(code="smb_general").first()
    cash = get_crl_by_code(s, "CRL_CASH")
    tc = s.query(ReportingTemplateCrl).filter_by(
        template_id=smb.id, crl_id=cash.id,
    ).first()
    assert tc is not None
    tc.display_label = "Cash on Hand"
    s.commit()
    template_id = smb.id
    s.close()

    r = client.get(f"/api/v1/common-reporting-lines/?template_id={template_id}")
    assert r.status_code == 200
    cash_row = next(b for b in r.json() if b["code"] == "CRL_CASH")
    assert cash_row["name"] == "Cash on Hand"


def test_list_with_template_hides_invisible_crls(client, seeded, Session):
    s = Session()
    smb = s.query(ReportingTemplate).filter_by(code="smb_general").first()
    cash = get_crl_by_code(s, "CRL_CASH")
    tc = s.query(ReportingTemplateCrl).filter_by(
        template_id=smb.id, crl_id=cash.id,
    ).first()
    tc.is_visible = False
    s.commit()
    template_id = smb.id
    s.close()

    r = client.get(f"/api/v1/common-reporting-lines/?template_id={template_id}")
    assert r.status_code == 200
    codes = {row["code"] for row in r.json()}
    assert "CRL_CASH" not in codes


# ---------------------------------------------------------------------------
# GET /common-reporting-lines/templates
# ---------------------------------------------------------------------------

def test_list_templates_returns_8_system_templates(client, seeded):
    r = client.get("/api/v1/common-reporting-lines/templates")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 8
    codes = {row["code"] for row in body}
    assert "smb_general" in codes
    assert "healthcare" in codes
    assert "saas" in codes
    assert "manufacturing" in codes


def test_list_templates_response_shape(client, seeded):
    r = client.get("/api/v1/common-reporting-lines/templates")
    assert r.status_code == 200
    row = r.json()[0]
    expected_keys = {
        "id", "code", "name", "description",
        "is_system", "is_active", "organization_id",
    }
    assert expected_keys.issubset(row.keys())


def test_list_templates_with_org_filter_includes_system(client, seeded):
    r = client.get(f"/api/v1/common-reporting-lines/templates?organization_id={seeded['org_id']}")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 8
    assert all(row["organization_id"] is None for row in body)
