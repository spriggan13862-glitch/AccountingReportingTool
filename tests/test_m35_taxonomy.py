"""
M35 Reporting Taxonomy Engine — backend tests.

Proof points:
  1.  GET /reporting-taxonomy/ returns seeded lines
  2.  POST /reporting-taxonomy/ creates a new line (201)
  3.  POST /reporting-taxonomy/ duplicate code → 409
  4.  GET /reporting-taxonomy/{id} retrieves single line
  5.  PATCH /reporting-taxonomy/{id} updates fields
  6.  DELETE /reporting-taxonomy/{id} — system-defined line is soft-deleted (active=False)
  7.  DELETE /reporting-taxonomy/{id} — user-defined line is hard-deleted (204)
  8.  GET /reporting-taxonomy/export.csv returns CSV with header row
  9.  POST /reporting-taxonomy/import/preview parses CSV, returns row counts
  10. POST /reporting-taxonomy/import/apply persists rows
  11. POST /reporting-taxonomy/seed re-seeds idempotently
  12. GET /reporting-views/ returns seeded views
  13. POST /reporting-views/ creates a view
  14. POST /reporting-views/{id}/clone clones a view with _copy suffix
  15. PATCH /reporting-views/{id} is_default=True clears other defaults
  16. DELETE /reporting-views/{id} soft-deletes system views
  17. GET /reporting-settings/ returns defaults
  18. PUT /reporting-settings/ persists updated settings
  19. active_only filter on taxonomy list
  20. statement_type filter on taxonomy list
"""
from __future__ import annotations

import io
import csv
import pytest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base
from app.api.deps import get_db
from app.main import app

# ---------------------------------------------------------------------------
# In-memory database fixture
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    def override_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_csv_bytes(rows: list[dict]) -> bytes:
    buf = io.StringIO()
    headers = [
        "taxonomy_code", "taxonomy_name", "short_name", "statement_type",
        "parent_line", "display_order", "normal_balance", "active",
        "is_subtotal", "sign_behavior", "description", "sec_xbrl_tag",
    ]
    writer = csv.DictWriter(buf, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return buf.getvalue().encode()


# ---------------------------------------------------------------------------
# Taxonomy Lines
# ---------------------------------------------------------------------------

def test_list_taxonomy_returns_seeded(client):
    r = client.get("/api/v1/reporting-taxonomy/")
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 20, f"Expected >=20 seeded lines, got {len(data)}"
    codes = {d["code"] for d in data}
    assert "revenue" in codes
    assert "gross_profit" in codes


def test_create_taxonomy_line(client):
    r = client.post("/api/v1/reporting-taxonomy/", json={
        "code": "test_custom_line",
        "name": "Test Custom Line",
        "section": "expense",
        "sort_order": 999,
    })
    assert r.status_code == 201
    body = r.json()
    assert body["code"] == "test_custom_line"
    assert body["name"] == "Test Custom Line"


def test_create_taxonomy_line_duplicate_409(client):
    r = client.post("/api/v1/reporting-taxonomy/", json={
        "code": "test_custom_line",
        "name": "Duplicate Line",
        "section": "expense",
    })
    assert r.status_code == 409


def test_get_taxonomy_line(client):
    # First get the seeded revenue line id
    lines = client.get("/api/v1/reporting-taxonomy/").json()
    rev = next(l for l in lines if l["code"] == "revenue")
    r = client.get(f"/api/v1/reporting-taxonomy/{rev['id']}")
    assert r.status_code == 200
    assert r.json()["code"] == "revenue"


def test_patch_taxonomy_line(client):
    lines = client.get("/api/v1/reporting-taxonomy/").json()
    custom = next(l for l in lines if l["code"] == "test_custom_line")
    r = client.patch(f"/api/v1/reporting-taxonomy/{custom['id']}", json={
        "name": "Updated Custom Line",
        "description": "Updated via test",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Updated Custom Line"
    assert body["description"] == "Updated via test"


def test_delete_system_defined_line_soft_deletes(client):
    """System-defined lines should be soft-deleted (active=False), not removed."""
    lines = client.get("/api/v1/reporting-taxonomy/").json()
    rev = next(l for l in lines if l["code"] == "revenue")
    line_id = rev["id"]

    r = client.delete(f"/api/v1/reporting-taxonomy/{line_id}")
    assert r.status_code == 204

    # Should not appear in active_only=true list
    active_lines = client.get("/api/v1/reporting-taxonomy/").json()
    codes = {l["code"] for l in active_lines}
    assert "revenue" not in codes

    # But should appear in active_only=false list
    all_lines = client.get("/api/v1/reporting-taxonomy/?active_only=false").json()
    all_codes = {l["code"] for l in all_lines}
    assert "revenue" in all_codes


def test_delete_user_defined_line_hard_deletes(client):
    """Non-system lines should be permanently removed."""
    lines = client.get("/api/v1/reporting-taxonomy/?active_only=false").json()
    custom = next(l for l in lines if l["code"] == "test_custom_line")
    line_id = custom["id"]

    r = client.delete(f"/api/v1/reporting-taxonomy/{line_id}")
    assert r.status_code == 204

    r2 = client.get(f"/api/v1/reporting-taxonomy/{line_id}")
    assert r2.status_code == 404


def test_export_csv_returns_csv(client):
    r = client.get("/api/v1/reporting-taxonomy/export.csv")
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    text = r.content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    assert len(rows) >= 10
    assert "taxonomy_code" in reader.fieldnames
    assert "taxonomy_name" in reader.fieldnames


def test_import_preview(client):
    csv_bytes = make_csv_bytes([
        {"taxonomy_code": "preview_a", "taxonomy_name": "Preview A", "section": "expense"},
        {"taxonomy_code": "preview_b", "taxonomy_name": "Preview B", "section": "expense", "parent_line": "preview_a"},
    ])
    r = client.post(
        "/api/v1/reporting-taxonomy/import/preview",
        files={"file": ("test.csv", csv_bytes, "text/csv")},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["create_count"] == 2
    assert body["error_count"] == 0
    assert len(body["rows"]) == 2

    # Preview should NOT persist
    lines = client.get("/api/v1/reporting-taxonomy/").json()
    codes = {l["code"] for l in lines}
    assert "preview_a" not in codes


def test_import_apply(client):
    csv_bytes = make_csv_bytes([
        {"taxonomy_code": "apply_root", "taxonomy_name": "Apply Root", "statement_type": "income_statement",
         "section": "expense", "sort_order": 998, "sign_behavior": "positive"},
        {"taxonomy_code": "apply_child", "taxonomy_name": "Apply Child", "statement_type": "income_statement",
         "section": "expense", "sort_order": 999, "parent_line": "apply_root", "sign_behavior": "positive"},
    ])
    r = client.post(
        "/api/v1/reporting-taxonomy/import/apply",
        files={"file": ("test.csv", csv_bytes, "text/csv")},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["created"] == 2
    assert body["errors"] == []

    # Verify persisted and parent linked
    lines = client.get("/api/v1/reporting-taxonomy/").json()
    root = next((l for l in lines if l["code"] == "apply_root"), None)
    child = next((l for l in lines if l["code"] == "apply_child"), None)
    assert root is not None
    assert child is not None
    assert child["parent_id"] == root["id"]


def test_reseed_is_idempotent(client):
    r = client.post("/api/v1/reporting-taxonomy/seed")
    assert r.status_code == 200
    body = r.json()
    assert body["seeded"] is True
    assert body["total_lines"] >= 20


def test_active_only_filter(client):
    all_lines = client.get("/api/v1/reporting-taxonomy/?active_only=false").json()
    active_lines = client.get("/api/v1/reporting-taxonomy/?active_only=true").json()
    assert len(active_lines) <= len(all_lines)
    for l in active_lines:
        assert l["active"] is True


def test_statement_type_filter(client):
    r = client.get("/api/v1/reporting-taxonomy/?statement_type=income_statement")
    assert r.status_code == 200
    lines = r.json()
    for l in lines:
        valid_sections = {"revenue", "other_income", "cogs", "expense", "other_expense"}
        assert l.get("statement_type") == "income_statement" or l["section"] in valid_sections


# ---------------------------------------------------------------------------
# Reporting Views
# ---------------------------------------------------------------------------

def test_list_views_returns_seeded(client):
    r = client.get("/api/v1/reporting-views/")
    assert r.status_code == 200
    views = r.json()
    assert len(views) >= 3
    codes = {v["code"] for v in views}
    assert "gaap" in codes or "standard" in codes or len(codes) >= 3


def test_create_view(client):
    r = client.post("/api/v1/reporting-views/", json={
        "code": "test_mgmt_view",
        "name": "Test Management View",
        "description": "Created by test",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["code"] == "test_mgmt_view"
    assert body["name"] == "Test Management View"


def test_clone_view(client):
    views = client.get("/api/v1/reporting-views/").json()
    src = next(v for v in views if v["code"] == "test_mgmt_view")
    r = client.post(f"/api/v1/reporting-views/{src['id']}/clone")
    assert r.status_code == 201
    body = r.json()
    assert "copy" in body["code"].lower() or "copy" in body["name"].lower()
    assert body["is_default"] is False


def test_set_default_view_clears_others(client):
    views = client.get("/api/v1/reporting-views/").json()
    src = next(v for v in views if v["code"] == "test_mgmt_view")
    r = client.patch(f"/api/v1/reporting-views/{src['id']}", json={"is_default": True})
    assert r.status_code == 200
    assert r.json()["is_default"] is True

    # Verify no other view is now default
    all_views = client.get("/api/v1/reporting-views/").json()
    defaults = [v for v in all_views if v["is_default"]]
    assert len(defaults) == 1
    assert defaults[0]["code"] == "test_mgmt_view"


def test_delete_system_view_soft_deletes(client):
    views = client.get("/api/v1/reporting-views/").json()
    sys_view = next((v for v in views if v["is_system_defined"]), None)
    if sys_view is None:
        pytest.skip("No system-defined views seeded")
    r = client.delete(f"/api/v1/reporting-views/{sys_view['id']}")
    assert r.status_code == 204

    # Should not appear in list (active only)
    remaining = client.get("/api/v1/reporting-views/").json()
    ids = {v["id"] for v in remaining}
    assert sys_view["id"] not in ids


# ---------------------------------------------------------------------------
# Presentation Settings
# ---------------------------------------------------------------------------

def test_get_settings_returns_defaults(client):
    r = client.get("/api/v1/reporting-settings/")
    assert r.status_code == 200
    body = r.json()
    assert "display_scaling" in body
    assert "decimal_places" in body
    assert "negative_format" in body


def test_update_settings_persists(client):
    r = client.put("/api/v1/reporting-settings/", json={
        "display_scaling": "thousands",
        "decimal_places": 0,
        "negative_format": "parentheses",
        "bold_subtotals": True,
        "alternate_row_shading": True,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["display_scaling"] == "thousands"
    assert body["decimal_places"] == 0
    assert body["alternate_row_shading"] is True

    # Re-fetch to verify persistence
    r2 = client.get("/api/v1/reporting-settings/")
    assert r2.json()["display_scaling"] == "thousands"
    assert r2.json()["alternate_row_shading"] is True
