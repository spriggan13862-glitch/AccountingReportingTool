"""
M34 COA taxonomy / hierarchy tests.

Proof points:
  1.  Authoritative QB types override tax line (Fixed Asset → property_equipment)
  2.  Authoritative QB types override bad/obsolete tax lines
  3.  AR/AP force-assigned to correct taxonomy codes
  4.  COGS forced to cogs regardless of tax line
  5.  Credit Card forced to short_term_debt regardless of tax line
  6.  Bad/obsolete tax line is skipped; detail_type used instead
  7.  Tax line takes priority over detail_type for non-authoritative types
  8.  Account name keyword fallback when no tax line or detail type
  9.  Account number parent detection — dash-separated prefix
  10. Account number parent detection — dot-separated prefix
  11. Account number parent detection — numeric truncation
  12. Account number parent not set for root (no shorter prefix exists)
  13. Indent-based parent detection still works (indentation overrides acct# grouping)
  14. hierarchy_depth is computed correctly
  15. source_evidence is populated in parse_coa_file rows
  16. apply_coa_import uses get_taxonomy_id_for_account (evidence hierarchy)
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
from app.services.coa_import_service import parse_coa_file, _find_parent_by_account_number
from app.services.reporting_taxonomy_service import get_suggested_taxonomy_code


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
        "code": "M34E",
        "name": "M34 Test Entity",
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
# 1–5. Authoritative QB type overrides
# ---------------------------------------------------------------------------

def test_fixed_asset_always_property_equipment():
    code, evidence = get_suggested_taxonomy_code(
        account_type="Fixed Assets",
        tax_line="Deductions: Other deductions",  # would be operating_expenses if used
        detail_type="Buildings",
        account_name="Office Building",
    )
    assert code == "property_equipment"
    assert evidence is not None and "Fixed Assets" in evidence


def test_fixed_asset_overrides_bad_tax_line():
    code, evidence = get_suggested_taxonomy_code(
        account_type="Fixed Assets",
        tax_line="N/A",
        detail_type=None,
        account_name="Machinery",
    )
    assert code == "property_equipment"
    assert evidence is not None and "Fixed Assets" in evidence


def test_ar_forced_to_accounts_receivable():
    code, evidence = get_suggested_taxonomy_code(
        account_type="Accounts Receivable (A/R)",
        tax_line=None,
        detail_type=None,
        account_name="Accounts Receivable",
    )
    assert code == "accounts_receivable"
    assert evidence is not None and "Accounts Receivable" in evidence


def test_cogs_forced_to_cogs():
    code, evidence = get_suggested_taxonomy_code(
        account_type="Cost of Goods Sold",
        tax_line="Cost of goods sold: Other costs",
        detail_type="Supplies & Materials",
        account_name="Cost of Goods",
    )
    assert code == "cogs"
    assert evidence is not None and "Cost of Goods Sold" in evidence


def test_credit_card_forced_to_short_term_debt():
    code, evidence = get_suggested_taxonomy_code(
        account_type="Credit Card",
        tax_line=None,
        detail_type=None,
        account_name="Visa Corporate",
    )
    assert code == "short_term_debt"
    assert evidence is not None and "Credit Card" in evidence


# ---------------------------------------------------------------------------
# 6. Bad/obsolete tax line skipped
# ---------------------------------------------------------------------------

def test_bad_tax_line_falls_back_to_detail_type():
    code, evidence = get_suggested_taxonomy_code(
        account_type="Income",
        tax_line="N/A",
        detail_type="Service/Fee Income",
        account_name="Revenue",
    )
    # tax line is bad; should fall through to qb_type, detail_type, or name_keyword
    assert code is not None
    assert evidence is not None
    assert "N/A" not in evidence  # the bad tax line must not be the evidence


def test_obsolete_tax_line_ignored():
    code, evidence = get_suggested_taxonomy_code(
        account_type="Income",
        tax_line="Obsolete",
        detail_type="Service/Fee Income",
        account_name="Revenue",
    )
    assert evidence is None or "Obsolete" not in evidence


# ---------------------------------------------------------------------------
# 7. Tax line priority over detail_type
# ---------------------------------------------------------------------------

def test_tax_line_priority_over_detail_type():
    # "Income: Gross receipts or sales" maps to revenue; detail_type might map elsewhere
    code_tl, evidence_tl = get_suggested_taxonomy_code(
        account_type="Income",
        tax_line="Income: Gross receipts or sales",
        detail_type="Other Income",
        account_name="Sales",
    )
    assert evidence_tl is not None and "Tax Line" in evidence_tl
    assert code_tl is not None


# ---------------------------------------------------------------------------
# 8. Account name keyword fallback
# ---------------------------------------------------------------------------

def test_name_keyword_depreciation():
    code, evidence = get_suggested_taxonomy_code(
        account_type="Expenses",
        tax_line=None,
        detail_type=None,
        account_name="Accumulated Depreciation",
    )
    # Either from QB type "expenses" → operating_expenses, or name keyword
    assert code is not None
    assert evidence is not None


def test_name_keyword_cash():
    code, evidence = get_suggested_taxonomy_code(
        account_type=None,
        tax_line=None,
        detail_type=None,
        account_name="Cash and Cash Equivalents",
    )
    assert code is not None
    assert evidence is not None and "Name keyword" in evidence


# ---------------------------------------------------------------------------
# 9–12. _find_parent_by_account_number
# ---------------------------------------------------------------------------

def _num_row(num: str) -> dict:
    return {"account_number": num, "account_name": f"Acct {num}", "row_index": int(num.replace("-", "").replace(".", "")[:4])}


def test_parent_detection_dash_separated():
    num_to_row = {"4000": _num_row("4000"), "4000-01": _num_row("4000-01")}
    result = _find_parent_by_account_number("4000-01", num_to_row)
    assert result is not None
    assert result["account_number"] == "4000"


def test_parent_detection_dot_separated():
    num_to_row = {"1100": _num_row("1100"), "1100.01": _num_row("1100.01")}
    result = _find_parent_by_account_number("1100.01", num_to_row)
    assert result is not None
    assert result["account_number"] == "1100"


def test_parent_detection_numeric_truncation():
    num_to_row = {"4000": _num_row("4000"), "4050": _num_row("4050")}
    result = _find_parent_by_account_number("4050", num_to_row)
    assert result is not None
    assert result["account_number"] == "4000"


def test_no_parent_for_root():
    num_to_row = {"1000": _num_row("1000")}
    result = _find_parent_by_account_number("1000", num_to_row)
    assert result is None


# ---------------------------------------------------------------------------
# 13. Indent-based parent detection
# ---------------------------------------------------------------------------

def test_indent_based_parent_detection():
    csv_content = _make_qb_csv([
        ["Cash",          "Bank",    "Checking", "", "", "1000", ""],
        ["  Petty Cash",  "Bank",    "Cash On Hand", "", "", "1010", ""],
        ["  Checking",    "Bank",    "Checking", "", "", "1020", ""],
    ])
    result = parse_coa_file(csv_content, "indent_test.csv")
    rows = {r["account_number"]: r for r in result["rows"]}
    assert rows["1010"]["parent_account_name"] == "Cash"
    assert rows["1020"]["parent_account_name"] == "Cash"
    assert rows["1000"]["parent_row_idx"] is None


# ---------------------------------------------------------------------------
# 14. hierarchy_depth
# ---------------------------------------------------------------------------

def test_hierarchy_depth_calculation():
    csv_content = _make_qb_csv([
        ["Cash",               "Bank", "Checking",   "", "", "1000", ""],
        ["  Savings",          "Bank", "Savings",    "", "", "1001", ""],
        ["    Escrow Account", "Bank", "Money Market", "", "", "1002", ""],
    ])
    result = parse_coa_file(csv_content, "depth_test.csv")
    rows = {r["account_number"]: r for r in result["rows"]}
    assert rows["1000"]["hierarchy_depth"] == 0
    assert rows["1001"]["hierarchy_depth"] == 1
    assert rows["1002"]["hierarchy_depth"] == 2


# ---------------------------------------------------------------------------
# 15. source_evidence in parse_coa_file rows
# ---------------------------------------------------------------------------

def test_source_evidence_populated():
    csv_content = _make_qb_csv([
        ["Cash", "Bank", "Checking", "", "", "1000", "B/S-Assets: Cash"],
        ["Accounts Receivable", "Accounts Receivable (A/R)", "Accounts Receivable", "", "", "1100", ""],
        ["Revenue", "Income", "Service/Fee Income", "", "", "4000", "Income: Gross receipts or sales"],
        ["Fixed Assets", "Fixed Assets", "Buildings", "", "", "1500", "Deductions: Depreciation"],
    ])
    result = parse_coa_file(csv_content, "evidence_test.csv")
    rows = {r["account_number"]: r for r in result["rows"]}
    # Cash: tax line should drive evidence
    assert rows["1000"]["source_evidence"] is not None
    # AR: authoritative type
    assert rows["1100"]["source_evidence"] is not None and "Accounts Receivable" in rows["1100"]["source_evidence"]
    # Revenue: tax line evidence
    assert rows["4000"]["source_evidence"] is not None and "Tax Line" in rows["4000"]["source_evidence"]
    # Fixed Assets: authoritative type overrides tax line
    assert rows["1500"]["source_evidence"] is not None and "Fixed Asset" in rows["1500"]["source_evidence"]


# ---------------------------------------------------------------------------
# 16. apply_coa_import uses evidence hierarchy (API integration)
# ---------------------------------------------------------------------------

def test_apply_uses_evidence_hierarchy(client, entity_id):
    csv_content = _make_qb_csv([
        ["Cash", "Bank", "Checking", "", "", "M34-1000", "B/S-Assets: Cash"],
        ["Fixed Asset Account", "Fixed Assets", "Buildings", "", "", "M34-1500", "Deductions: Depreciation"],
    ])
    r = client.post(
        "/api/v1/coa-imports/upload",
        data={"entity_id": str(entity_id)},
        files={"file": ("m34_test.csv", io.BytesIO(csv_content), "text/csv")},
    )
    assert r.status_code == 201
    preview = r.json()
    rows = {row["account_number"]: row for row in preview["rows"]}

    # Fixed Asset must be assigned to property_equipment regardless of tax line
    fa_row = rows.get("M34-1500")
    assert fa_row is not None
    assert fa_row["source_evidence"] is not None and "Fixed Asset" in fa_row["source_evidence"]

    # Apply
    r2 = client.post(f"/api/v1/coa-imports/{preview['batch_id']}/apply")
    assert r2.status_code == 200
    assert r2.json()["accounts_created"] == 2
