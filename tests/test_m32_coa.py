"""
M32 COA-first architecture tests.

Proof points:
  1.  Reporting taxonomy endpoint seeds and returns lines
  2.  Account PATCH updates detail_type, account_status, taxonomy line
  3.  Account tree endpoint returns hierarchical structure
  4.  COA upload parses QB-style CSV and returns preview
  5.  COA apply creates accounts with taxonomy auto-mapping
  6.  COA apply updates existing accounts
  7.  Onboarding status reflects COA workflow steps
  8.  QB type mapping inference is correct
  9.  Combined account number/name splitting works
  10. COA preview re-fetch via GET /{id}/preview
"""
from __future__ import annotations

import io
import csv
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base
from app.api.deps import get_db
from app.main import app

TODAY_STR = "2024-12-31"


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
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(scope="module")
def entity_id(client):
    r = client.post("/api/v1/entities/", json={
        "code": "M32E",
        "name": "M32 Test Entity",
        "entity_type": "operating",
        "currency": "USD",
        "fiscal_year_end_month": 12,
        "fiscal_year_convention": "calendar",
    })
    assert r.status_code == 201
    return r.json()["id"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_qb_csv(rows: list[list[str]]) -> bytes:
    headers = ["Account Name", "Type", "Detail Type", "Description", "Balance Total", "Account #", "Tax Line"]
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    return buf.getvalue().encode()


# ---------------------------------------------------------------------------
# 1. Taxonomy endpoint
# ---------------------------------------------------------------------------

def test_taxonomy_seeds_and_returns_lines(client):
    r = client.get("/api/v1/reporting-taxonomy/")
    assert r.status_code == 200
    lines = r.json()
    codes = [l["code"] for l in lines]
    assert "cash_equivalents" in codes
    assert "accounts_receivable" in codes
    assert "revenue" in codes
    assert "cogs" in codes
    assert "operating_expenses" in codes
    assert len(lines) >= 20


# ---------------------------------------------------------------------------
# 2. Account PATCH
# ---------------------------------------------------------------------------

def test_account_patch_updates_detail_type_and_status(client, entity_id):
    # Create account
    r = client.post("/api/v1/accounts/", json={
        "entity_id": entity_id,
        "account_number": "9100",
        "account_name": "Test Patch Account",
        "account_type": "asset",
        "normal_balance": "debit",
    })
    assert r.status_code == 201
    acct_id = r.json()["id"]

    # Patch detail_type
    r = client.patch(f"/api/v1/accounts/{acct_id}", json={
        "detail_type": "Checking",
        "account_status": "inactive",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["detail_type"] == "Checking"
    assert body["account_status"] == "inactive"


def test_account_patch_taxonomy_line(client, entity_id):
    # Get taxonomy id for cash_equivalents
    r = client.get("/api/v1/reporting-taxonomy/")
    lines = r.json()
    cash_line = next(l for l in lines if l["code"] == "cash_equivalents")

    r = client.post("/api/v1/accounts/", json={
        "entity_id": entity_id,
        "account_number": "9110",
        "account_name": "Cash Savings",
        "account_type": "asset",
        "normal_balance": "debit",
    })
    acct_id = r.json()["id"]

    r = client.patch(f"/api/v1/accounts/{acct_id}", json={
        "reporting_taxonomy_line_id": cash_line["id"],
    })
    assert r.status_code == 200
    assert r.json()["reporting_taxonomy_line_id"] == cash_line["id"]


def test_account_patch_not_found(client):
    r = client.patch("/api/v1/accounts/99999", json={"detail_type": "X"})
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# 3. Account tree
# ---------------------------------------------------------------------------

def test_accounts_tree_returns_hierarchy(client, entity_id):
    # Create parent
    r = client.post("/api/v1/accounts/", json={
        "entity_id": entity_id,
        "account_number": "4000",
        "account_name": "Revenue",
        "account_type": "revenue",
        "normal_balance": "credit",
    })
    parent_id = r.json()["id"]

    # Create child
    r = client.post("/api/v1/accounts/", json={
        "entity_id": entity_id,
        "account_number": "4001",
        "account_name": "Programming Revenue",
        "account_type": "revenue",
        "normal_balance": "credit",
        "parent_account_id": parent_id,
    })
    child_id = r.json()["id"]

    r = client.get(f"/api/v1/accounts/tree?entity_id={entity_id}")
    assert r.status_code == 200
    tree = r.json()
    # Find parent node
    parent_node = next((n for n in tree if n["id"] == parent_id), None)
    assert parent_node is not None
    assert any(c["id"] == child_id for c in parent_node["children"])


# ---------------------------------------------------------------------------
# 4. COA upload parses QB-style CSV
# ---------------------------------------------------------------------------

def test_coa_upload_parses_qb_csv(client, entity_id):
    csv_bytes = _make_qb_csv([
        ["Cash", "Bank", "Checking", "Operating checking account", "50000.00", "1000", ""],
        ["Accounts Receivable", "Accounts Receivable (A/R)", "Accounts Receivable", "", "25000.00", "1100", ""],
        ["Revenue", "Income", "Service/Fee Income", "", "100000.00", "4000", ""],
        ["Office Expenses", "Expenses", "Office Expenses", "", "5000.00", "6000", ""],
    ])
    r = client.post(
        "/api/v1/coa-imports/upload",
        data={"entity_id": str(entity_id)},
        files={"file": ("chart_of_accounts.csv", csv_bytes, "text/csv")},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["source_system"] == "quickbooks"
    assert body["row_count"] == 4
    assert len(body["rows"]) == 4
    # Check account number extraction
    acct_numbers = [row["account_number"] for row in body["rows"]]
    assert "1000" in acct_numbers
    assert "4000" in acct_numbers
    # Check type inference
    rows_by_num = {r["account_number"]: r for r in body["rows"]}
    assert rows_by_num["1000"]["account_type"] == "asset"
    assert rows_by_num["4000"]["account_type"] == "revenue"
    assert rows_by_num["6000"]["account_type"] == "expense"


# ---------------------------------------------------------------------------
# 5. COA apply creates accounts with taxonomy auto-mapping
# ---------------------------------------------------------------------------

def test_coa_apply_creates_accounts(client, entity_id):
    # Fresh entity for isolation
    r = client.post("/api/v1/entities/", json={
        "code": "M32B",
        "name": "M32 Apply Entity",
        "entity_type": "operating",
        "currency": "USD",
        "fiscal_year_end_month": 12,
        "fiscal_year_convention": "calendar",
    })
    apply_entity = r.json()["id"]

    csv_bytes = _make_qb_csv([
        ["Cash", "Bank", "Checking", "", "50000.00", "1000", ""],
        ["Revenue", "Income", "Service/Fee Income", "", "100000.00", "4000", ""],
    ])
    r = client.post(
        "/api/v1/coa-imports/upload",
        data={"entity_id": str(apply_entity)},
        files={"file": ("coa.csv", csv_bytes, "text/csv")},
    )
    assert r.status_code == 201
    batch_id = r.json()["batch_id"]

    # Apply
    r = client.post(f"/api/v1/coa-imports/{batch_id}/apply")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "applied"
    assert body["accounts_created"] == 2
    assert body["accounts_updated"] == 0

    # Verify accounts exist
    r = client.get(f"/api/v1/accounts/?entity_id={apply_entity}")
    accounts = r.json()["items"]
    assert len(accounts) == 2
    # Cash should map to cash_equivalents taxonomy
    cash = next(a for a in accounts if a["account_number"] == "1000")
    assert cash["detail_type"] == "Checking"
    assert cash["reporting_taxonomy_line_id"] is not None


# ---------------------------------------------------------------------------
# 6. COA apply updates existing accounts
# ---------------------------------------------------------------------------

def test_coa_apply_updates_existing(client):
    # Create fresh entity with pre-existing account
    r = client.post("/api/v1/entities/", json={
        "code": "M32C",
        "name": "M32 Update Entity",
        "entity_type": "operating",
        "currency": "USD",
        "fiscal_year_end_month": 12,
        "fiscal_year_convention": "calendar",
    })
    upd_entity = r.json()["id"]

    # Pre-create account
    client.post("/api/v1/accounts/", json={
        "entity_id": upd_entity,
        "account_number": "1000",
        "account_name": "Old Cash Name",
        "account_type": "asset",
        "normal_balance": "debit",
    })

    # Upload COA with same account number but new name
    csv_bytes = _make_qb_csv([
        ["Updated Cash Account", "Bank", "Checking", "Updated", "50000.00", "1000", ""],
    ])
    r = client.post(
        "/api/v1/coa-imports/upload",
        data={"entity_id": str(upd_entity)},
        files={"file": ("coa.csv", csv_bytes, "text/csv")},
    )
    batch_id = r.json()["batch_id"]
    r = client.post(f"/api/v1/coa-imports/{batch_id}/apply")
    assert r.status_code == 200
    body = r.json()
    assert body["accounts_created"] == 0
    assert body["accounts_updated"] == 1

    # Verify name was updated
    r = client.get(f"/api/v1/accounts/?entity_id={upd_entity}")
    accounts = r.json()["items"]
    assert accounts[0]["account_name"] == "Updated Cash Account"


# ---------------------------------------------------------------------------
# 7. Onboarding status reflects COA workflow
# ---------------------------------------------------------------------------

def test_onboarding_status_coa_steps(client):
    r = client.get("/api/v1/setup/onboarding-status")
    assert r.status_code == 200
    body = r.json()
    # entity_created should be complete (we created entities above)
    assert "entity_created" in body["setup_steps_complete"]
    # COA fields present
    assert "coa_batch_count" in body
    assert "coa_applied_count" in body
    # coa_uploaded and coa_applied should be complete (from tests above)
    assert "coa_uploaded" in body["setup_steps_complete"]
    assert "coa_applied" in body["setup_steps_complete"]


# ---------------------------------------------------------------------------
# 8. QB type mapping inference
# ---------------------------------------------------------------------------

def test_qb_type_mapping_inference(client, entity_id):
    from app.services.coa_import_service import _infer_type
    assert _infer_type("Bank") == "asset"
    assert _infer_type("Accounts Receivable (A/R)") == "asset"
    assert _infer_type("Accounts Payable (A/P)") == "liability"
    assert _infer_type("Equity") == "equity"
    assert _infer_type("Income") == "revenue"
    assert _infer_type("Cost of Goods Sold") == "expense"
    assert _infer_type("Expenses") == "expense"


# ---------------------------------------------------------------------------
# 9. Combined account number/name splitting
# ---------------------------------------------------------------------------

def test_combined_account_splitting():
    from app.services.coa_import_service import _strip_account_number
    num, name = _strip_account_number("1000 - Cash")
    assert num == "1000"
    assert name == "Cash"

    num, name = _strip_account_number("4000 – Revenue")
    assert num == "4000"
    assert name == "Revenue"

    num, name = _strip_account_number("Cash (1000)")
    assert num == "1000"
    assert name == "Cash"

    num, name = _strip_account_number("Just A Name")
    assert num == ""
    assert name == "Just A Name"


# ---------------------------------------------------------------------------
# 10. Preview re-fetch
# ---------------------------------------------------------------------------

def test_coa_preview_refetch(client, entity_id):
    csv_bytes = _make_qb_csv([
        ["Savings", "Bank", "Savings", "", "10000.00", "1010", ""],
    ])
    r = client.post(
        "/api/v1/coa-imports/upload",
        data={"entity_id": str(entity_id)},
        files={"file": ("preview_test.csv", csv_bytes, "text/csv")},
    )
    assert r.status_code == 201
    batch_id = r.json()["batch_id"]

    r = client.get(f"/api/v1/coa-imports/{batch_id}/preview")
    assert r.status_code == 200
    body = r.json()
    assert body["batch_id"] == batch_id
    assert body["row_count"] == 1
    assert body["rows"][0]["account_number"] == "1010"
