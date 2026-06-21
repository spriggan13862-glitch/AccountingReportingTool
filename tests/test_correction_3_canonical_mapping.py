"""
Correction 3 — one canonical Account → FSLI (CRL) mapping source.

The hard-stop the user named is: 'Accept suggested FSLI for 1000 Cash in
wizard. Refresh browser. Open Mapping Center. Open By Reporting Line.
Confirm same FSLI appears everywhere.'

This test set verifies the data path that makes that test pass:
  1. wizard writes ImportLine.selected_common_reporting_line_id (existing)
  2. post_batch transfers that onto Account.common_reporting_line_id (FIX)
  3. AccountOut schema surfaces common_reporting_line_id (FIX)
  4. PATCH /accounts/{id} accepts common_reporting_line_id (FIX)
  5. POST /accounts/bulk-fsli bulk-assigns (NEW)
  6. crl_reporting_service reads Account.common_reporting_line_id (verified
     already in CRL-G — re-asserted here)
"""
import datetime
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.database import Base
from app.main import app
from app.api.deps import get_db, get_required_user, get_current_user
from app.services.crl_service import seed_crl_catalog, get_crl_by_code
from app.services.crl_reporting_service import get_crl_statement
from app.services.import_batch_service import post_batch
from app.services.crl_suggestion_service import save_explicit_crl_selections
from app.models.organization import Organization
from app.models.entity import Entity
from app.models.account import Account
from app.models.scenario import Scenario
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
    app.dependency_overrides[get_required_user] = lambda: type("U", (), {"id": 1})()
    app.dependency_overrides[get_current_user] = lambda: type("U", (), {"id": 1})()
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def wired_books(Session):
    """
    Org + entity + scenario + seeded CRLs + Cash account + a ready-to-post
    batch with one import line for Cash. Wizard step 4 is simulated by
    save_explicit_crl_selections (which is what the wizard's per-row
    dropdown calls).
    """
    s = Session()
    org = Organization(name="ACME", slug="acme"); s.add(org); s.flush()
    entity = Entity(code="E1", name="ACME Op", entity_type="operating",
                    organization_id=org.id, currency="USD")
    s.add(entity); s.flush()
    scenario = Scenario(
        code="actuals", name="Actuals",
        scenario_type="actual",
        organization_id=org.id, active=True,
    )
    s.add(scenario); s.flush()
    seed_crl_catalog(s)

    cash = Account(
        entity_id=entity.id, account_number="1000", account_name="Cash",
        account_type="asset", normal_balance="debit", is_postable=True,
    )
    equity = Account(
        entity_id=entity.id, account_number="3000", account_name="Equity",
        account_type="equity", normal_balance="credit", is_postable=True,
    )
    s.add_all([cash, equity]); s.flush()

    batch = ImportBatch(
        organization_id=org.id, entity_id=entity.id, scenario_id=scenario.id,
        status="draft", filename="tb.csv", source_format="csv",
        content_hash="x" * 64, column_mapping={},
        as_of_date=datetime.date(2026, 1, 31),
        row_count=2,
    )
    s.add(batch); s.flush()
    line_cash = ImportLine(
        batch_id=batch.id, line_number=1,
        raw_account_number="1000", raw_account_name="Cash",
        debit=Decimal("10000"), credit=Decimal("0"),
        mapping_status="mapped",
        resolved_account_id=cash.id,
    )
    line_equity = ImportLine(
        batch_id=batch.id, line_number=2,
        raw_account_number="3000", raw_account_name="Equity",
        debit=Decimal("0"), credit=Decimal("10000"),
        mapping_status="mapped",
        resolved_account_id=equity.id,
    )
    s.add_all([line_cash, line_equity]); s.commit()
    out = {
        "org_id": org.id, "entity_id": entity.id,
        "scenario_id": scenario.id, "batch_id": batch.id,
        "line_id": line_cash.id, "cash_account_id": cash.id,
        "equity_account_id": equity.id, "equity_line_id": line_equity.id,
    }
    s.close()
    return out


# ---------------------------------------------------------------------------
# 1. The hard-stop round-trip: wizard select → post → Account picks it up
# ---------------------------------------------------------------------------

def test_post_batch_transfers_crl_from_import_line_to_account(Session, wired_books):
    """
    Hard-stop test:
      - Wizard (simulated via save_explicit_crl_selections) writes
        ImportLine.selected_common_reporting_line_id = CRL_CASH.id
      - User clicks Post to Ledger → post_batch runs
      - Account.common_reporting_line_id must equal CRL_CASH.id afterwards
    """
    s = Session()
    cash_crl = get_crl_by_code(s, "CRL_CASH")
    batch = s.query(ImportBatch).filter_by(id=wired_books["batch_id"]).first()
    # Wizard step 4 saves an explicit selection.
    save_explicit_crl_selections(s, batch, [
        {"line_id": wired_books["line_id"], "crl_id": cash_crl.id},
    ])
    # Validate path: simulate the batch becoming ready_to_post.
    batch.status = "ready_to_post"
    batch.unmapped_row_count = 0
    s.commit()

    # User clicks Post to Ledger.
    post_batch(s, batch.id, je_number="JE-001")
    s.commit()

    cash = s.query(Account).filter_by(id=wired_books["cash_account_id"]).first()
    assert cash.common_reporting_line_id == cash_crl.id, (
        f"BUG: post_batch failed to transfer ImportLine CRL onto Account. "
        f"account.common_reporting_line_id={cash.common_reporting_line_id}, "
        f"expected={cash_crl.id}"
    )
    assert cash.crl_state == "assigned"
    s.close()


def test_post_batch_does_not_overwrite_manual_account_crl(Session, wired_books):
    """If user manually picked a CRL on the Account first, post_batch must
    leave it alone — never silently overwrite a manual mapping."""
    s = Session()
    cash_crl = get_crl_by_code(s, "CRL_CASH")
    other_crl = get_crl_by_code(s, "CRL_OTHER_ASSETS")
    # Manually set the Account first.
    cash = s.query(Account).filter_by(id=wired_books["cash_account_id"]).first()
    cash.common_reporting_line_id = other_crl.id
    cash.crl_state = "assigned"
    # Wizard wrote a different selection.
    batch = s.query(ImportBatch).filter_by(id=wired_books["batch_id"]).first()
    save_explicit_crl_selections(s, batch, [
        {"line_id": wired_books["line_id"], "crl_id": cash_crl.id},
    ])
    batch.status = "ready_to_post"
    batch.unmapped_row_count = 0
    s.commit()

    post_batch(s, batch.id, je_number="JE-002")
    s.commit()
    cash = s.query(Account).filter_by(id=wired_books["cash_account_id"]).first()
    assert cash.common_reporting_line_id == other_crl.id, (
        "post_batch must NOT overwrite a manual Account CRL"
    )
    s.close()


# ---------------------------------------------------------------------------
# 2. AccountOut schema + PATCH /accounts/{id} expose canonical FSLI
# ---------------------------------------------------------------------------

def test_account_get_returns_common_reporting_line_id(client, Session, wired_books):
    s = Session()
    cash_crl = get_crl_by_code(s, "CRL_CASH")
    cash = s.query(Account).filter_by(id=wired_books["cash_account_id"]).first()
    cash.common_reporting_line_id = cash_crl.id
    cash.crl_state = "assigned"
    s.commit()
    cash_id = cash.id
    crl_id = cash_crl.id
    s.close()

    r = client.get(f"/api/v1/accounts/{cash_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["common_reporting_line_id"] == crl_id
    assert body["crl_state"] == "assigned"


def test_account_patch_can_set_common_reporting_line_id(client, Session, wired_books):
    s = Session()
    cash_crl_id = get_crl_by_code(s, "CRL_CASH").id
    s.close()

    r = client.patch(f"/api/v1/accounts/{wired_books['cash_account_id']}", json={
        "common_reporting_line_id": cash_crl_id,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["common_reporting_line_id"] == cash_crl_id
    assert body["crl_state"] == "assigned"


def test_account_patch_can_clear_common_reporting_line_id(client, Session, wired_books):
    s = Session()
    cash_crl_id = get_crl_by_code(s, "CRL_CASH").id
    cash = s.query(Account).filter_by(id=wired_books["cash_account_id"]).first()
    cash.common_reporting_line_id = cash_crl_id
    cash.crl_state = "assigned"
    s.commit()
    s.close()

    r = client.patch(f"/api/v1/accounts/{wired_books['cash_account_id']}", json={
        "common_reporting_line_id": None,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["common_reporting_line_id"] is None
    assert body["crl_state"] == "unclassified"


# ---------------------------------------------------------------------------
# 3. POST /accounts/bulk-fsli — Mapping Center bulk action
# ---------------------------------------------------------------------------

def test_bulk_fsli_assigns_many_accounts(client, Session, wired_books):
    """Add two more accounts so we can bulk-assign."""
    s = Session()
    a2 = Account(entity_id=wired_books["entity_id"], account_number="1000-01",
                 account_name="Operating Cash", account_type="asset",
                 normal_balance="debit", is_postable=True)
    a3 = Account(entity_id=wired_books["entity_id"], account_number="1000-02",
                 account_name="Payroll Bank", account_type="asset",
                 normal_balance="debit", is_postable=True)
    s.add_all([a2, a3]); s.flush()
    cash_crl_id = get_crl_by_code(s, "CRL_CASH").id
    ids = [wired_books["cash_account_id"], a2.id, a3.id]
    s.commit()
    s.close()

    r = client.post("/api/v1/accounts/bulk-fsli", json={
        "account_ids": ids,
        "common_reporting_line_id": cash_crl_id,
    })
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 3
    assert all(a["common_reporting_line_id"] == cash_crl_id for a in body)
    assert all(a["crl_state"] == "assigned" for a in body)


def test_bulk_fsli_can_clear(client, Session, wired_books):
    s = Session()
    cash_crl_id = get_crl_by_code(s, "CRL_CASH").id
    cash = s.query(Account).filter_by(id=wired_books["cash_account_id"]).first()
    cash.common_reporting_line_id = cash_crl_id
    cash.crl_state = "assigned"
    s.commit()
    s.close()

    r = client.post("/api/v1/accounts/bulk-fsli", json={
        "account_ids": [wired_books["cash_account_id"]],
        "common_reporting_line_id": None,
    })
    assert r.status_code == 200
    assert r.json()[0]["common_reporting_line_id"] is None
    assert r.json()[0]["crl_state"] == "unclassified"


# ---------------------------------------------------------------------------
# 4. End-to-end agreement: after the round-trip, the by-FSLI statement and
#    the account record agree.
# ---------------------------------------------------------------------------

def test_by_fsli_statement_reads_same_account_crl(Session, wired_books):
    """
    Wizard maps Cash → CRL_CASH, batch posts, the CRL statement endpoint
    should show that balance under CRL_CASH (not under CRL_UNCLASSIFIED).
    """
    s = Session()
    cash_crl = get_crl_by_code(s, "CRL_CASH")
    batch = s.query(ImportBatch).filter_by(id=wired_books["batch_id"]).first()
    save_explicit_crl_selections(s, batch, [
        {"line_id": wired_books["line_id"], "crl_id": cash_crl.id},
    ])
    batch.status = "ready_to_post"
    batch.unmapped_row_count = 0
    s.commit()
    post_batch(s, batch.id, je_number="JE-E2E")
    s.commit()

    stmt = get_crl_statement(
        s,
        entity_id=wired_books["entity_id"],
        as_of_date=datetime.date(2026, 1, 31),
        scenario_ids=[wired_books["scenario_id"]],
        organization_id=wired_books["org_id"],
    )
    s.close()
    by_code = {r.crl_code: r for r in stmt.rows}
    assert "CRL_CASH" in by_code, "Cash balance not surfaced under CRL_CASH"
    assert by_code["CRL_CASH"].own_signed_balance == Decimal("10000")
    # Cash was the only mapped account; the balancing Equity stays
    # unclassified because we didn't pick a CRL for it in this scenario.
    assert stmt.classified_accounts == 1
    assert stmt.unclassified_accounts == 1
    # The unclassified bucket must carry the Equity balance, NOT Cash.
    assert by_code["CRL_UNCLASSIFIED"].own_signed_balance == Decimal("-10000")
