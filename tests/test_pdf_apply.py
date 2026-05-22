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
        )

    print("\n--- UPLOAD RESPONSE ---")
    print(f"Status: {upload_resp.status_code}")
    print(f"Body:   {upload_resp.text}")

    assert upload_resp.status_code == 201, (
        f"Upload failed with {upload_resp.status_code}: {upload_resp.text}"
    )

    batch_id = upload_resp.json()["batch_id"]
    print(f"batch_id: {batch_id}")

    # Step 2: apply
    apply_resp = client.post(f"/api/v1/pdf-imports/{batch_id}/apply")

    print("\n--- APPLY RESPONSE ---")
    print(f"Status: {apply_resp.status_code}")
    print(f"Body:   {apply_resp.text}")

    assert apply_resp.status_code == 200, (
        f"Apply returned {apply_resp.status_code}.\n"
        f"Full response body:\n{apply_resp.text}"
    )
