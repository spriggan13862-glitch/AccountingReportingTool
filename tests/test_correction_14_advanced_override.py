"""
Correction 14 — Advanced Taxonomy Override sits beneath canonical FSLI.

Scenarios mandated by the spec:

  A. Account has NO FSLI → advanced override → resolved CRL is promoted
     onto accounts.common_reporting_line_id (silent, no confirmation).
  B. Account has FSLI matching resolved CRL → advanced override saved;
     canonical FSLI stays unchanged.
  C. Account has FSLI that DIFFERS from resolved CRL → endpoint returns
     409 with structured detail; retry with allow_fsli_change=true
     applies the change.

Hard-stop: Advanced Taxonomy Override must not cause Mapping Center and
By FSLI statements to disagree. Every passing advanced write either
matches the canonical FSLI or has been confirmed by the user.
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
from app.services.fsli_mapping_service import (
    FsliPromotionConflictError,
    upsert_fsli_mapping,
)
from app.models.organization import Organization
from app.models.entity import Entity
from app.models.account import Account
from app.models.scenario import Scenario
from app.models.import_batch import ImportBatch
from app.models.import_line import ImportLine
from app.models.taxonomy import Taxonomy, TaxonomyNode
from app.models.reporting_taxonomy import ReportingTaxonomyLine, ReportingTaxonomyView


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
def wired(Session):
    """
    Org, entity, view, scenario, CRL catalog seeded, three ReportingTaxonomyLines
    whose codes match CRL junction node codes (CASH, AR, AP) so the
    promotion resolver can find them.
    """
    s = Session()
    org = Organization(name="ACME", slug="acme"); s.add(org); s.flush()
    entity = Entity(code="E1", name="ACME Op", entity_type="operating",
                    organization_id=org.id, currency="USD")
    s.add(entity); s.flush()
    view = ReportingTaxonomyView(
        code="default", name="Default View",
    )
    s.add(view); s.flush()
    seed_crl_catalog(s)

    cash_line = ReportingTaxonomyLine(
        code="CASH", name="Cash & Cash Equivalents",
        section="asset", statement_type="balance_sheet",
        sort_order=100, active=True, normal_balance="debit",
    )
    ar_line = ReportingTaxonomyLine(
        code="AR", name="Accounts Receivable",
        section="asset", statement_type="balance_sheet",
        sort_order=110, active=True, normal_balance="debit",
    )
    s.add_all([cash_line, ar_line]); s.flush()

    cash = Account(
        entity_id=entity.id, account_number="1000", account_name="Cash",
        account_type="asset", normal_balance="debit", is_postable=True,
    )
    s.add(cash); s.commit()
    out = {
        "org_id": org.id, "entity_id": entity.id, "view_id": view.id,
        "cash_account_id": cash.id,
        "cash_line_id": cash_line.id, "ar_line_id": ar_line.id,
    }
    s.close()
    return out


# ---------------------------------------------------------------------------
# Scenario A — no canonical → promote
# ---------------------------------------------------------------------------

def test_scenario_A_no_fsli_advanced_override_promotes_canonical(Session, wired):
    s = Session()
    # Sanity: Cash starts with no canonical FSLI.
    cash = s.query(Account).filter_by(id=wired["cash_account_id"]).first()
    assert cash.common_reporting_line_id is None

    upsert_fsli_mapping(
        wired["entity_id"], wired["view_id"], wired["cash_account_id"],
        wired["cash_line_id"], s,
    )
    cash = s.query(Account).filter_by(id=wired["cash_account_id"]).first()
    crl_cash = get_crl_by_code(s, "CRL_CASH")
    assert cash.common_reporting_line_id == crl_cash.id, (
        "Scenario A failed: advanced override of an unmapped account "
        "should promote the canonical FSLI."
    )
    assert cash.crl_state == "assigned"
    s.close()


def test_scenario_A_via_endpoint(client, wired):
    r = client.put(
        f"/api/v1/fsli-mappings/{wired['entity_id']}/{wired['view_id']}/{wired['cash_account_id']}",
        json={"taxonomy_line_id": wired["cash_line_id"]},
    )
    assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# Scenario B — canonical already matches → no change, no error
# ---------------------------------------------------------------------------

def test_scenario_B_matching_fsli_keeps_canonical_unchanged(Session, wired):
    s = Session()
    crl_cash = get_crl_by_code(s, "CRL_CASH")
    cash = s.query(Account).filter_by(id=wired["cash_account_id"]).first()
    cash.common_reporting_line_id = crl_cash.id
    cash.crl_state = "assigned"
    s.commit()

    # Advanced override pointing to the same CASH taxonomy line → resolves
    # to CRL_CASH → matches existing canonical. Must succeed silently.
    override = upsert_fsli_mapping(
        wired["entity_id"], wired["view_id"], wired["cash_account_id"],
        wired["cash_line_id"], s,
    )
    cash = s.query(Account).filter_by(id=wired["cash_account_id"]).first()
    assert cash.common_reporting_line_id == crl_cash.id  # unchanged
    assert override.taxonomy_line_id == wired["cash_line_id"]
    s.close()


# ---------------------------------------------------------------------------
# Scenario C — canonical differs → 409 unless allow_fsli_change
# ---------------------------------------------------------------------------

def test_scenario_C_conflict_raises_without_allow_flag(Session, wired):
    s = Session()
    crl_ar = get_crl_by_code(s, "CRL_AR")
    cash = s.query(Account).filter_by(id=wired["cash_account_id"]).first()
    # Set the canonical to CRL_AR — now an advanced override pointing at
    # the CASH taxonomy line would change canonical from AR → CASH.
    cash.common_reporting_line_id = crl_ar.id
    cash.crl_state = "assigned"
    s.commit()

    with pytest.raises(FsliPromotionConflictError) as ei:
        upsert_fsli_mapping(
            wired["entity_id"], wired["view_id"], wired["cash_account_id"],
            wired["cash_line_id"], s,
        )
    err = ei.value
    assert err.account_id == wired["cash_account_id"]
    assert err.current_crl_id == crl_ar.id
    assert err.current_crl_name == "Accounts Receivable"
    assert err.new_crl_name == "Cash & Cash Equivalents"
    s.close()


def test_scenario_C_endpoint_returns_409_with_structured_detail(client, Session, wired):
    s = Session()
    crl_ar = get_crl_by_code(s, "CRL_AR")
    cash = s.query(Account).filter_by(id=wired["cash_account_id"]).first()
    cash.common_reporting_line_id = crl_ar.id
    cash.crl_state = "assigned"
    s.commit()
    s.close()

    r = client.put(
        f"/api/v1/fsli-mappings/{wired['entity_id']}/{wired['view_id']}/{wired['cash_account_id']}",
        json={"taxonomy_line_id": wired["cash_line_id"]},
    )
    assert r.status_code == 409, r.text
    detail = r.json()["detail"]
    assert detail["code"] == "FSLI_CHANGE_REQUIRES_CONFIRMATION"
    assert detail["account_id"] == wired["cash_account_id"]
    assert detail["current_crl_name"] == "Accounts Receivable"
    assert detail["new_crl_name"] == "Cash & Cash Equivalents"
    assert "allow_fsli_change=true" in detail["remedy"]


def test_scenario_C_allow_flag_applies_the_change(client, Session, wired):
    s = Session()
    crl_ar = get_crl_by_code(s, "CRL_AR")
    crl_cash = get_crl_by_code(s, "CRL_CASH")
    cash_id = wired["cash_account_id"]
    cash_crl_id = crl_cash.id
    s.query(Account).filter_by(id=cash_id).update({
        "common_reporting_line_id": crl_ar.id,
        "crl_state": "assigned",
    })
    s.commit()
    s.close()

    r = client.put(
        f"/api/v1/fsli-mappings/{wired['entity_id']}/{wired['view_id']}/{cash_id}",
        json={
            "taxonomy_line_id": wired["cash_line_id"],
            "allow_fsli_change": True,
        },
    )
    assert r.status_code == 200, r.text

    s = Session()
    cash = s.query(Account).filter_by(id=cash_id).first()
    assert cash.common_reporting_line_id == cash_crl_id, (
        "After allow_fsli_change=true the canonical FSLI must change"
    )
    s.close()


# ---------------------------------------------------------------------------
# Hard-stop — Mapping Center and Statements never disagree
# ---------------------------------------------------------------------------

def test_advanced_override_then_mapping_center_agree(client, Session, wired):
    """
    Scenario A flow: account starts with no canonical FSLI; user picks
    an advanced override pointing to the CASH taxonomy line. After that:
      - GET /accounts/{id} (the source Mapping Center reads) returns
        common_reporting_line_id = CRL_CASH.id
      - The advanced override row is also stored.
    Both surfaces agree on Cash & Cash Equivalents.
    """
    r = client.put(
        f"/api/v1/fsli-mappings/{wired['entity_id']}/{wired['view_id']}/{wired['cash_account_id']}",
        json={"taxonomy_line_id": wired["cash_line_id"]},
    )
    assert r.status_code == 200

    r2 = client.get(f"/api/v1/accounts/{wired['cash_account_id']}")
    assert r2.status_code == 200
    body = r2.json()
    s = Session()
    crl_cash_id = get_crl_by_code(s, "CRL_CASH").id
    s.close()
    assert body["common_reporting_line_id"] == crl_cash_id
    assert body["crl_state"] == "assigned"


# ---------------------------------------------------------------------------
# Wizard "Show full taxonomy" path also promotes canonical
# ---------------------------------------------------------------------------

@pytest.fixture
def wizard_fixture(Session, wired):
    """A draft batch with one ImportLine for Cash + a TaxonomyNode with code='CASH'."""
    s = Session()
    tx = Taxonomy(code="us_gaap_x", name="US GAAP x", is_system=True, is_active=True)
    s.add(tx); s.flush()
    cash_node = TaxonomyNode(
        taxonomy_id=tx.id, code="CASH", name="Cash",
        statement_type="Balance Sheet", financial_statement_section="Assets",
        normal_balance="debit", sort_order=100, level=0, is_system=True,
    )
    s.add(cash_node); s.flush()

    scenario = Scenario(code="actuals", name="Actuals", scenario_type="actual",
                        organization_id=wired["org_id"], active=True)
    s.add(scenario); s.flush()

    batch = ImportBatch(
        organization_id=wired["org_id"], entity_id=wired["entity_id"],
        scenario_id=scenario.id,
        status="draft", filename="tb.csv", source_format="csv",
        content_hash="x" * 64, column_mapping={},
        as_of_date=datetime.date(2026, 1, 31), row_count=1,
    )
    s.add(batch); s.flush()
    line = ImportLine(
        batch_id=batch.id, line_number=1,
        raw_account_number="1000", raw_account_name="Cash",
        debit=Decimal("10000"), credit=Decimal("0"),
        mapping_status="mapped",
        resolved_account_id=wired["cash_account_id"],
    )
    s.add(line); s.commit()
    out = {
        "batch_id": batch.id,
        "line_id": line.id,
        "cash_node_id": cash_node.id,
    }
    s.close()
    return out


def test_wizard_save_fsli_selections_promotes_canonical(client, Session, wired, wizard_fixture):
    """
    User clicks Show full taxonomy in step 4 and picks the CASH
    TaxonomyNode. The endpoint must set:
      - import_lines.selected_fsli_taxonomy_node_id = node_id (existing)
      - import_lines.selected_common_reporting_line_id = CRL_CASH.id (Correction 14)
    """
    r = client.post(
        f"/api/v1/tb-imports/batches/{wizard_fixture['batch_id']}/save-fsli-selections",
        json={"selections": [
            {"line_id": wizard_fixture["line_id"],
             "taxonomy_node_id": wizard_fixture["cash_node_id"]},
        ]},
    )
    assert r.status_code == 200, r.text

    s = Session()
    line = s.query(ImportLine).filter_by(id=wizard_fixture["line_id"]).first()
    crl_cash_id = get_crl_by_code(s, "CRL_CASH").id
    assert line.selected_fsli_taxonomy_node_id == wizard_fixture["cash_node_id"]
    assert line.selected_common_reporting_line_id == crl_cash_id, (
        "Wizard advanced taxonomy path must auto-promote canonical CRL"
    )
    s.close()


def test_wizard_save_fsli_selections_does_not_clobber_existing_canonical(
    client, Session, wired, wizard_fixture,
):
    """Scenario C-equivalent for wizard: if line already has a canonical
    selected_common_reporting_line_id that differs from the resolved CRL,
    leave the canonical alone (no silent change in the wizard flow)."""
    s = Session()
    crl_ar_id = get_crl_by_code(s, "CRL_AR").id
    s.query(ImportLine).filter_by(id=wizard_fixture["line_id"]).update({
        "selected_common_reporting_line_id": crl_ar_id,
    })
    s.commit()
    s.close()

    r = client.post(
        f"/api/v1/tb-imports/batches/{wizard_fixture['batch_id']}/save-fsli-selections",
        json={"selections": [
            {"line_id": wizard_fixture["line_id"],
             "taxonomy_node_id": wizard_fixture["cash_node_id"]},
        ]},
    )
    assert r.status_code == 200

    s = Session()
    line = s.query(ImportLine).filter_by(id=wizard_fixture["line_id"]).first()
    # Taxonomy node updated as user requested:
    assert line.selected_fsli_taxonomy_node_id == wizard_fixture["cash_node_id"]
    # Canonical CRL untouched — user must change FSLI explicitly in Mapping Center.
    assert line.selected_common_reporting_line_id == crl_ar_id
    s.close()
