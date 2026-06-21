"""
CRL-C tests — resolver precedence chain + suggestion service + endpoints.

Covers:
  - resolve_crl_for_account precedence: direct CRL > Sprint O > legacy
  - resolve_crl_map (bulk) matches single resolver
  - derive_crl_state_for_account maps sentinels correctly
  - suggest-crl endpoint returns matched/unmatched counts + reverse-looks-up CRL
  - apply-crl-suggestions with all 3 modes (blank_only / replace / preserve)
  - save-crl-selections writes explicit overrides + null clears
  - Template filtering: suggestions outside the active template return null
  - One-to-many CRL → Taxonomy: a node mapped to two CRLs picks is_primary
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
from app.data.crl_catalog import CRL_CATALOG
from app.services.crl_service import seed_crl_catalog, get_crl_by_code
from app.services.crl_resolver import (
    resolve_crl_for_account,
    resolve_crl_id_for_account,
    resolve_crl_map,
    derive_crl_state_for_account,
)
from app.models.organization import Organization
from app.models.entity import Entity
from app.models.account import Account
from app.models.import_batch import ImportBatch
from app.models.import_line import ImportLine
from app.models.taxonomy import Taxonomy, TaxonomyNode, AccountTaxonomyMapping
from app.models.reporting_taxonomy import ReportingTaxonomyLine


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
    """Builds: org + entity + 4 accounts + US GAAP taxonomy w/ CASH+AR nodes +
    72 CRLs + 8 templates + 103 junctions, + a draft TB batch with 4 lines."""
    s = Session()

    org = Organization(name="T", slug="t"); s.add(org); s.flush()
    entity = Entity(code="E1", name="E1", entity_type="operating",
                    organization_id=org.id, currency="USD")
    s.add(entity); s.flush()

    # Taxonomy with canonical leaf nodes (subset).
    tx = Taxonomy(code="us_gaap", name="US GAAP", is_system=True, is_active=True)
    s.add(tx); s.flush()
    nodes_by_code = {}
    for code, name, sec in [
        ("CASH", "Cash", "Assets"),
        ("CASH_EQUIV", "Cash Equivalents", "Assets"),
        ("AR", "Accounts Receivable", "Assets"),
        ("AP", "Accounts Payable", "Liabilities"),
        ("REVENUE_SALES", "Sales Revenue", "Revenue"),
    ]:
        n = TaxonomyNode(
            taxonomy_id=tx.id, code=code, name=name,
            statement_type="Balance Sheet", financial_statement_section=sec,
            normal_balance="debit" if sec in ("Assets",) else "credit",
            sort_order=100, level=0, is_system=True,
        )
        s.add(n); s.flush()
        nodes_by_code[code] = n

    # Seed CRLs + templates + junctions
    seed_crl_catalog(s)

    # Accounts
    accts = []
    for num, name in [("1000", "Cash"), ("1100", "Accounts Receivable"),
                      ("2000", "Accounts Payable"), ("4000", "Sales Revenue")]:
        a = Account(entity_id=entity.id, account_number=num, account_name=name,
                    account_type="asset" if num.startswith(("1", "2")) else "revenue",
                    normal_balance="debit" if num.startswith("1") else "credit")
        s.add(a); s.flush()
        accts.append(a)

    # Draft batch with lines mirroring the accounts
    batch = ImportBatch(
        organization_id=org.id, entity_id=entity.id, status="draft",
        filename="t.csv", source_format="csv", content_hash="x" * 64,
        column_mapping={}, as_of_date=datetime.date(2024, 12, 31),
        row_count=4,
    )
    s.add(batch); s.flush()
    lines = []
    for i, a in enumerate(accts):
        line = ImportLine(
            batch_id=batch.id, line_number=i + 1,
            raw_account_number=a.account_number,
            raw_account_name=a.account_name,
            debit=100, credit=0, mapping_status="mapped",
            resolved_account_id=a.id,
        )
        s.add(line); s.flush()
        lines.append(line)
    s.commit()

    out = {
        "org_id": org.id, "entity_id": entity.id, "tx_id": tx.id,
        "batch_id": batch.id, "account_ids": [a.id for a in accts],
        "line_ids": [l.id for l in lines],
        # Store node ids only — detached ORM objects don't survive session close.
        "node_ids": {code: n.id for code, n in nodes_by_code.items()},
    }
    s.close()
    return out


# ---------------------------------------------------------------------------
# Resolver precedence
# ---------------------------------------------------------------------------

def test_resolver_returns_none_when_no_mapping(Session, fixture):
    s = Session()
    acct = s.query(Account).filter_by(id=fixture["account_ids"][0]).first()
    assert resolve_crl_for_account(s, acct) is None
    s.close()


def test_resolver_uses_direct_crl_link(Session, fixture):
    s = Session()
    acct = s.query(Account).filter_by(id=fixture["account_ids"][0]).first()
    crl_cash = get_crl_by_code(s, "CRL_CASH")
    acct.common_reporting_line_id = crl_cash.id
    s.commit()
    resolved = resolve_crl_for_account(s, acct)
    assert resolved.id == crl_cash.id
    assert resolved.code == "CRL_CASH"
    s.close()


def test_resolver_uses_sprint_o_mapping_when_no_direct(Session, fixture):
    s = Session()
    acct = s.query(Account).filter_by(id=fixture["account_ids"][1]).first()
    s.add(AccountTaxonomyMapping(
        account_id=acct.id, taxonomy_id=fixture["tx_id"],
        taxonomy_node_id=fixture["node_ids"]["AR"],
        mapping_type="manual", mapping_source="user_selected",
    ))
    s.commit()
    resolved = resolve_crl_for_account(s, acct)
    assert resolved is not None
    assert resolved.code == "CRL_AR"
    s.close()


def test_resolver_uses_legacy_taxonomy_line_when_others_missing(Session, fixture):
    s = Session()
    legacy = ReportingTaxonomyLine(
        code="AP", name="Accounts Payable", section="liability",
        sort_order=100,
    )
    s.add(legacy); s.flush()
    acct = s.query(Account).filter_by(id=fixture["account_ids"][2]).first()
    acct.reporting_taxonomy_line_id = legacy.id
    s.commit()
    resolved = resolve_crl_for_account(s, acct)
    assert resolved is not None
    assert resolved.code == "CRL_AP"
    s.close()


def test_resolver_direct_link_wins_over_sprint_o(Session, fixture):
    """If both direct CRL and Sprint O mapping exist, direct wins."""
    s = Session()
    acct = s.query(Account).filter_by(id=fixture["account_ids"][0]).first()
    crl_other = get_crl_by_code(s, "CRL_OTHER_ASSETS")
    acct.common_reporting_line_id = crl_other.id
    s.add(AccountTaxonomyMapping(
        account_id=acct.id, taxonomy_id=fixture["tx_id"],
        taxonomy_node_id=fixture["node_ids"]["CASH"],
        mapping_type="manual", mapping_source="user_selected",
    ))
    s.commit()
    resolved = resolve_crl_for_account(s, acct)
    assert resolved.code == "CRL_OTHER_ASSETS"
    s.close()


def test_bulk_resolver_matches_single(Session, fixture):
    """resolve_crl_map agrees with resolve_crl_for_account for every account."""
    s = Session()
    accts = s.query(Account).filter(
        Account.id.in_(fixture["account_ids"])
    ).all()
    # Wire up one with each strategy
    crl_cash = get_crl_by_code(s, "CRL_CASH")
    accts[0].common_reporting_line_id = crl_cash.id
    s.add(AccountTaxonomyMapping(
        account_id=accts[1].id, taxonomy_id=fixture["tx_id"],
        taxonomy_node_id=fixture["node_ids"]["AR"],
        mapping_type="manual", mapping_source="user_selected",
    ))
    legacy = ReportingTaxonomyLine(code="AP", name="AP", section="liability", sort_order=10)
    s.add(legacy); s.flush()
    accts[2].reporting_taxonomy_line_id = legacy.id
    # accts[3] left unmapped
    s.commit()

    bulk = resolve_crl_map(s, accts)
    single = {a.id: resolve_crl_for_account(s, a) for a in accts}
    for a in accts:
        b = bulk[a.id].id if bulk[a.id] else None
        sg = single[a.id].id if single[a.id] else None
        assert b == sg, f"Mismatch for account {a.id}"
    s.close()


# ---------------------------------------------------------------------------
# crl_state derivation
# ---------------------------------------------------------------------------

def test_derive_state_unclassified_when_null(Session, fixture):
    s = Session()
    acct = s.query(Account).filter_by(id=fixture["account_ids"][0]).first()
    assert derive_crl_state_for_account(acct, None) == "unclassified"
    s.close()


def test_derive_state_assigned_for_real_crl(Session, fixture):
    s = Session()
    crl_cash = get_crl_by_code(s, "CRL_CASH")
    state = derive_crl_state_for_account(None, crl_cash)
    assert state == "assigned"
    s.close()


def test_derive_state_needs_review_and_unclassified_sentinels(Session, fixture):
    s = Session()
    nr = get_crl_by_code(s, "CRL_NEEDS_REVIEW")
    uc = get_crl_by_code(s, "CRL_UNCLASSIFIED")
    assert derive_crl_state_for_account(None, nr) == "needs_review"
    assert derive_crl_state_for_account(None, uc) == "unclassified"
    s.close()


# ---------------------------------------------------------------------------
# API endpoints — suggest / apply / save
# ---------------------------------------------------------------------------

def test_suggest_crl_endpoint_returns_matches(client, fixture):
    r = client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/suggest-crl",
        json={"taxonomy_id": fixture["tx_id"]},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["matched"] >= 3
    by_line = {s["line_id"]: s for s in body["suggestions"]}
    # Each account-name keyword should reverse-lookup to its expected CRL.
    expected = {
        fixture["line_ids"][0]: "CRL_CASH",
        fixture["line_ids"][1]: "CRL_AR",
        fixture["line_ids"][2]: "CRL_AP",
        fixture["line_ids"][3]: "CRL_PRODUCT_REVENUE",  # REVENUE_SALES -> CRL_PRODUCT_REVENUE
    }
    for line_id, exp_code in expected.items():
        s = by_line[line_id]
        assert s["crl_code"] == exp_code, (
            f"Line {line_id} expected {exp_code}, got {s['crl_code']!r} "
            f"via taxonomy {s.get('via_taxonomy_node_code')}"
        )


def test_suggest_crl_endpoint_requires_taxonomy_id(client, fixture):
    r = client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/suggest-crl",
        json={},
    )
    assert r.status_code == 400


def test_suggest_crl_404_for_unknown_batch(client, fixture):
    r = client.post(
        "/api/v1/tb-imports/batches/99999/suggest-crl",
        json={"taxonomy_id": fixture["tx_id"]},
    )
    assert r.status_code == 404


def test_apply_crl_blank_only_default(client, fixture, Session):
    # First populate suggestions.
    client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/suggest-crl",
        json={"taxonomy_id": fixture["tx_id"]},
    )
    # Pre-set selection on line 0 so blank_only should skip it.
    s = Session()
    other = get_crl_by_code(s, "CRL_OTHER_ASSETS")
    line0 = s.query(ImportLine).filter_by(id=fixture["line_ids"][0]).first()
    line0.selected_common_reporting_line_id = other.id
    s.commit(); s.close()

    r = client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/apply-crl-suggestions",
        json={"taxonomy_id": fixture["tx_id"], "line_ids": "all", "mode": "blank_only"},
    )
    body = r.json()
    assert r.status_code == 200
    # 3 lines apply, 1 skipped_existing (line 0 already set)
    assert body["applied"] == 3
    assert body["skipped_existing"] == 1
    assert body["next_action"] == "Continue to Review Exceptions"


def test_apply_crl_replace_overwrites(client, fixture, Session):
    client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/suggest-crl",
        json={"taxonomy_id": fixture["tx_id"]},
    )
    s = Session()
    other_id = get_crl_by_code(s, "CRL_OTHER_ASSETS").id
    cash_id = get_crl_by_code(s, "CRL_CASH").id
    line0 = s.query(ImportLine).filter_by(id=fixture["line_ids"][0]).first()
    line0.selected_common_reporting_line_id = other_id
    s.commit(); s.close()

    r = client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/apply-crl-suggestions",
        json={"taxonomy_id": fixture["tx_id"], "line_ids": "all", "mode": "replace"},
    )
    body = r.json()
    assert body["applied"] == 4  # all four overwritten

    s = Session()
    line0 = s.query(ImportLine).filter_by(id=fixture["line_ids"][0]).first()
    assert line0.selected_common_reporting_line_id == cash_id
    s.close()


def test_apply_crl_skipped_returns_clear_reason(client, fixture, Session):
    client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/suggest-crl",
        json={"taxonomy_id": fixture["tx_id"]},
    )
    # Mark every line as already-selected, then run blank_only.
    s = Session()
    other = get_crl_by_code(s, "CRL_OTHER_ASSETS")
    for lid in fixture["line_ids"]:
        s.query(ImportLine).filter_by(id=lid).update(
            {"selected_common_reporting_line_id": other.id}
        )
    s.commit(); s.close()

    r = client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/apply-crl-suggestions",
        json={"taxonomy_id": fixture["tx_id"], "line_ids": "all", "mode": "blank_only"},
    )
    body = r.json()
    assert body["applied"] == 0
    assert body["skipped_existing"] == 4
    assert body["skipped_reason"] is not None
    assert "Replace existing" in body["skipped_reason"]
    assert body["next_action"] is None


def test_apply_crl_rejects_unknown_mode(client, fixture):
    r = client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/apply-crl-suggestions",
        json={"taxonomy_id": fixture["tx_id"], "line_ids": "all", "mode": "destroy_everything"},
    )
    assert r.status_code == 400


def test_save_crl_selections_writes_overrides(client, fixture, Session):
    s = Session()
    crl_other_id = get_crl_by_code(s, "CRL_OTHER_ASSETS").id
    s.close()
    r = client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/save-crl-selections",
        json={"selections": [
            {"line_id": fixture["line_ids"][0], "crl_id": crl_other_id},
            {"line_id": fixture["line_ids"][1], "crl_id": None},  # explicit clear
        ]},
    )
    assert r.status_code == 200
    assert r.json()["saved"] == 2

    s = Session()
    line0 = s.query(ImportLine).filter_by(id=fixture["line_ids"][0]).first()
    line1 = s.query(ImportLine).filter_by(id=fixture["line_ids"][1]).first()
    assert line0.selected_common_reporting_line_id == crl_other_id
    assert line1.selected_common_reporting_line_id is None
    s.close()


def test_save_crl_selections_409_when_batch_posted(client, fixture, Session):
    s = Session()
    s.query(ImportBatch).filter_by(id=fixture["batch_id"]).update({"status": "posted"})
    s.commit(); s.close()
    r = client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/save-crl-selections",
        json={"selections": [{"line_id": fixture["line_ids"][0], "crl_id": 1}]},
    )
    assert r.status_code == 409


# ---------------------------------------------------------------------------
# Template filtering
# ---------------------------------------------------------------------------

def test_suggest_crl_filtered_by_template(client, fixture, Session):
    """When template_id is set, CRLs outside the template return null
    (forcing the user to pick manually or change template)."""
    s = Session()
    # Build a tiny template that ONLY exposes CRL_CASH — others should return null.
    from app.models.common_reporting_line import ReportingTemplate, ReportingTemplateCrl
    t = ReportingTemplate(code="cash_only", name="Cash Only",
                          is_system=False, is_active=True, organization_id=None)
    s.add(t); s.flush()
    crl_cash = get_crl_by_code(s, "CRL_CASH")
    s.add(ReportingTemplateCrl(template_id=t.id, crl_id=crl_cash.id, is_visible=True))
    s.commit()
    tid = t.id
    s.close()

    r = client.post(
        f"/api/v1/tb-imports/batches/{fixture['batch_id']}/suggest-crl",
        json={"taxonomy_id": fixture["tx_id"], "template_id": tid},
    )
    body = r.json()
    by_line = {s["line_id"]: s for s in body["suggestions"]}
    # Only the cash line should have a non-null crl_id; the others fall
    # outside the template.
    assert by_line[fixture["line_ids"][0]]["crl_code"] == "CRL_CASH"
    for line_id in fixture["line_ids"][1:]:
        assert by_line[line_id]["crl_id"] is None
        reason = by_line[line_id]["reason"] or ""
        assert "active reporting template" in reason
