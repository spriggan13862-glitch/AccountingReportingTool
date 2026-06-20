"""Tests for the delete-line and bulk-delete endpoints (issue 5)."""
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
    app.dependency_overrides[get_required_user] = lambda: type("U", (), {"id": 1, "email": "t@t.t"})()
    app.dependency_overrides[get_current_user] = lambda: type("U", (), {"id": 1, "email": "t@t.t"})()
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def fixture_data(Session):
    s = Session()
    org = Organization(name="T", slug="t"); s.add(org); s.flush()
    entity = Entity(code="E1", name="E1", entity_type="operating", organization_id=org.id, currency="USD")
    s.add(entity); s.flush()
    batch = ImportBatch(
        organization_id=org.id, entity_id=entity.id, status="draft",
        filename="t.csv", source_format="csv", content_hash="x" * 64,
        column_mapping={}, as_of_date=datetime.date(2024, 12, 31),
        row_count=3,
    )
    s.add(batch); s.flush()
    lines = [
        ImportLine(batch_id=batch.id, line_number=i, raw_account_number=f"100{i}",
                   raw_account_name=f"Acc {i}", debit=100, credit=0, mapping_status="unmapped")
        for i in range(3)
    ]
    for line in lines: s.add(line)
    s.commit()
    out = {"batch_id": batch.id, "line_ids": [l.id for l in lines]}
    s.close()
    return out


def test_delete_line_success(client, fixture_data):
    r = client.delete(f"/api/v1/tb-imports/batches/{fixture_data['batch_id']}/lines/{fixture_data['line_ids'][0]}")
    assert r.status_code == 204


def test_delete_line_404_for_unknown_line(client, fixture_data):
    r = client.delete(f"/api/v1/tb-imports/batches/{fixture_data['batch_id']}/lines/9999")
    assert r.status_code == 404


def test_delete_line_blocked_for_posted_batch(client, fixture_data, Session):
    s = Session()
    s.query(ImportBatch).filter_by(id=fixture_data["batch_id"]).update({"status": "posted"})
    s.commit(); s.close()
    r = client.delete(f"/api/v1/tb-imports/batches/{fixture_data['batch_id']}/lines/{fixture_data['line_ids'][0]}")
    assert r.status_code == 409
    assert "posted" in r.json()["detail"].lower()


def test_bulk_delete_lines(client, fixture_data):
    ids = fixture_data["line_ids"][:2]
    r = client.post(
        f"/api/v1/tb-imports/batches/{fixture_data['batch_id']}/bulk-delete-lines",
        json={"line_ids": ids},
    )
    assert r.status_code == 200
    assert r.json() == {"deleted": 2, "requested": 2}


def test_bulk_delete_blocked_for_posted_batch(client, fixture_data, Session):
    s = Session()
    s.query(ImportBatch).filter_by(id=fixture_data["batch_id"]).update({"status": "posted"})
    s.commit(); s.close()
    r = client.post(
        f"/api/v1/tb-imports/batches/{fixture_data['batch_id']}/bulk-delete-lines",
        json={"line_ids": fixture_data["line_ids"]},
    )
    assert r.status_code == 409
