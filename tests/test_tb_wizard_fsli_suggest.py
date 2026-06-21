"""
Tests for the simplified TB wizard's in-wizard FSLI suggestion endpoints:

  POST /tb-imports/batches/{id}/suggest-fsli         — run rule engine
  POST /tb-imports/batches/{id}/apply-fsli-suggestions — promote to selected
"""
import datetime
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.database import Base
from app.main import app
from app.api.deps import get_db, get_required_user, get_current_user
from app.models.organization import Organization
from app.models.entity import Entity
from app.models.import_batch import ImportBatch
from app.models.import_line import ImportLine
from app.models.taxonomy import Taxonomy, TaxonomyNode


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
def fixture(Session):
    s = Session()
    org = Organization(name="T", slug="t"); s.add(org); s.flush()
    entity = Entity(code="E1", name="E1", entity_type="operating", organization_id=org.id, currency="USD")
    s.add(entity); s.flush()

    # Seed a US GAAP taxonomy with the canonical node codes the rule engine maps to.
    tx = Taxonomy(code="us_gaap", name="US GAAP", is_system=True, is_active=True)
    s.add(tx); s.flush()
    for code, name in [
        ("CASH", "Cash"),
        ("AR", "Accounts Receivable"),
        ("AP", "Accounts Payable"),
        ("REVENUE_SALES", "Sales Revenue"),
    ]:
        s.add(TaxonomyNode(
            taxonomy_id=tx.id, code=code, name=name,
            statement_type="Balance Sheet" if code != "REVENUE_SALES" else "Income Statement",
            financial_statement_section="Assets" if code in ("CASH", "AR") else (
                "Liabilities" if code == "AP" else "Revenue"
            ),
            normal_balance="debit" if code in ("CASH", "AR") else "credit",
            sort_order=100, level=0, is_system=True,
        ))
    s.flush()

    # A draft batch with TB lines using the exact reported source data.
    batch = ImportBatch(
        organization_id=org.id, entity_id=entity.id, status="draft",
        filename="t.csv", source_format="csv", content_hash="x" * 64,
        column_mapping={}, as_of_date=datetime.date(2024, 12, 31),
        row_count=4,
    )
    s.add(batch); s.flush()
    lines = [
        ImportLine(batch_id=batch.id, line_number=1, raw_account_number="1000",
                   raw_account_name="Cash", debit=100, credit=0, mapping_status="unmapped"),
        ImportLine(batch_id=batch.id, line_number=2, raw_account_number="1100",
                   raw_account_name="Accounts Receivable", debit=500, credit=0, mapping_status="unmapped"),
        ImportLine(batch_id=batch.id, line_number=3, raw_account_number="2000",
                   raw_account_name="Accounts Payable", debit=0, credit=300, mapping_status="unmapped"),
        ImportLine(batch_id=batch.id, line_number=4, raw_account_number="4000",
                   raw_account_name="Sales Revenue", debit=0, credit=800, mapping_status="unmapped"),
    ]
    for line in lines: s.add(line)
    s.commit()
    out = {
        "batch_id": batch.id, "taxonomy_id": tx.id,
        "line_ids": [l.id for l in lines],
    }
    s.close()
    return out


# ---------------------------------------------------------------------------
# suggest-fsli
# ---------------------------------------------------------------------------

def test_suggest_fsli_returns_match_per_line(client, fixture):
    r = client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/suggest-fsli",
        json={"taxonomy_id": fixture["taxonomy_id"]},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["matched"] == 4
    assert body["unmatched"] == 0
    by_line = {s["line_id"]: s for s in body["suggestions"]}
    # Each line should resolve to its expected canonical node by name keyword.
    assert by_line[fixture["line_ids"][0]]["node_code"] == "CASH"
    assert by_line[fixture["line_ids"][1]]["node_code"] == "AR"
    assert by_line[fixture["line_ids"][2]]["node_code"] == "AP"
    assert by_line[fixture["line_ids"][3]]["node_code"] in {"REVENUE_SALES"}


def test_suggest_fsli_stages_on_import_line(client, fixture, Session):
    client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/suggest-fsli",
        json={"taxonomy_id": fixture["taxonomy_id"]},
    )
    s = Session()
    line = s.query(ImportLine).filter_by(id=fixture["line_ids"][0]).first()
    assert line.suggested_fsli_taxonomy_node_id is not None
    assert line.suggested_fsli_confidence is not None
    assert "keyword" in (line.suggested_fsli_reason or "").lower()
    s.close()


def test_suggest_fsli_unknown_taxonomy_404(client, fixture):
    r = client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/suggest-fsli",
        json={"taxonomy_id": 99999},
    )
    assert r.status_code == 404


def test_suggest_fsli_no_account_required(client, fixture):
    """Spec hard-stop: suggestion must work without any Account records existing.
    The fixture creates ImportLines but NO Accounts for this entity."""
    r = client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/suggest-fsli",
        json={"taxonomy_id": fixture["taxonomy_id"]},
    )
    assert r.status_code == 200
    assert r.json()["matched"] >= 1


# ---------------------------------------------------------------------------
# apply-fsli-suggestions
# ---------------------------------------------------------------------------

def test_apply_blank_only_default(client, fixture, Session):
    # First, populate suggestions on every line.
    client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/suggest-fsli",
        json={"taxonomy_id": fixture["taxonomy_id"]},
    )
    # Pre-select FSLI on line 0 manually so it should be skipped under blank_only.
    s = Session()
    line0 = s.query(ImportLine).filter_by(id=fixture["line_ids"][0]).first()
    line0.selected_fsli_taxonomy_node_id = 999  # arbitrary existing-mapping marker
    s.commit(); s.close()

    r = client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/apply-fsli-suggestions",
        json={"line_ids": "all", "mode": "blank_only"},
    )
    body = r.json()
    assert r.status_code == 200
    # 3 lines apply, 1 skipped (existing)
    assert body["applied"] == 3
    assert body["skipped_existing"] == 1
    assert body["next_action"] == "Continue to Review Exceptions"


def test_apply_replace_mode_overwrites_existing(client, fixture, Session):
    client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/suggest-fsli",
        json={"taxonomy_id": fixture["taxonomy_id"]},
    )
    s = Session()
    line0 = s.query(ImportLine).filter_by(id=fixture["line_ids"][0]).first()
    original = line0.suggested_fsli_taxonomy_node_id
    line0.selected_fsli_taxonomy_node_id = 999
    s.commit(); s.close()

    r = client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/apply-fsli-suggestions",
        json={"line_ids": "all", "mode": "replace"},
    )
    assert r.json()["applied"] == 4  # all four overwritten

    s = Session()
    line0 = s.query(ImportLine).filter_by(id=fixture["line_ids"][0]).first()
    assert line0.selected_fsli_taxonomy_node_id == original
    s.close()


def test_apply_all_skipped_returns_clear_reason(client, fixture, Session):
    """Hard stop: 'Applied 0, skipped 184 (existing mapping preserved)' must
    now include an actionable reason that mentions 'Replace existing'."""
    client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/suggest-fsli",
        json={"taxonomy_id": fixture["taxonomy_id"]},
    )
    # Mark every line as already-selected
    s = Session()
    for lid in fixture["line_ids"]:
        s.query(ImportLine).filter_by(id=lid).update({"selected_fsli_taxonomy_node_id": 777})
    s.commit(); s.close()

    r = client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/apply-fsli-suggestions",
        json={"line_ids": "all", "mode": "blank_only"},
    )
    body = r.json()
    assert body["applied"] == 0
    assert body["skipped_existing"] == 4
    assert body["skipped_reason"] is not None
    assert "Replace existing" in body["skipped_reason"]
    assert body["next_action"] is None
