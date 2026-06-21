"""
CRL-G / P5 tests — reporting endpoints that read through the CRL layer.

Covers:
  - get_crl_statement aggregates TB rows per CRL via resolver
  - Direct CRL link assigns balance to that CRL
  - Sprint O mapping reverse-looks-up through junction
  - Accounts with no CRL fall into CRL_UNCLASSIFIED
  - Display balance flips sign for credit-normal sections (Revenue, Liab, Eq)
  - statement_type filter narrows to BS / IS / CF
  - template_id filter excludes non-template CRLs but keeps mandatory rows
  - Parent rollup: child CRL balance flows into parent's total_signed_balance
  - HTTP endpoint shape: /trial-balance, /balance-sheet, /income-statement
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
from app.services.crl_reporting_service import (
    get_crl_statement,
    STATEMENT_TYPE_BALANCE_SHEET,
    STATEMENT_TYPE_INCOME_STATEMENT,
)
from app.models.organization import Organization
from app.models.entity import Entity
from app.models.account import Account
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.models.scenario import Scenario
from app.models.taxonomy import Taxonomy, TaxonomyNode, AccountTaxonomyMapping
from app.models.common_reporting_line import ReportingTemplate, ReportingTemplateCrl


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
    """
    Wires:
      - 1 org, 1 entity, 1 active scenario
      - 5 accounts: Cash, AR, AP, Sales Revenue, Operating Expenses
      - US GAAP taxonomy with matching nodes
      - Seeded CRL catalog (72 CRLs + 8 templates + junctions)
      - One posted TB-import JE establishing initial balances:
          DR Cash 10,000 / DR AR 3,000 / DR OpEx 2,500
          CR AP 4,000 / CR Sales Revenue 11,500
        (debits=15500, credits=15500 — balanced)
      - Cash linked to CRL_CASH directly
      - AR via Sprint O (AccountTaxonomyMapping → AR node → CRL_AR)
      - AP, Sales Revenue, OpEx have no link (will fall to UNCLASSIFIED)
    """
    s = Session()
    org = Organization(name="T", slug="t"); s.add(org); s.flush()
    entity = Entity(code="E1", name="E1", entity_type="operating",
                    organization_id=org.id, currency="USD")
    s.add(entity); s.flush()
    scenario = Scenario(
        code="actuals", name="Actuals",
        scenario_type="actual",
        organization_id=org.id, active=True,
    )
    s.add(scenario); s.flush()

    tx = Taxonomy(code="us_gaap", name="US GAAP", is_system=True, is_active=True)
    s.add(tx); s.flush()
    nodes = {}
    for code, name, sec, stmt in [
        ("CASH", "Cash", "Assets", "Balance Sheet"),
        ("AR", "Accounts Receivable", "Assets", "Balance Sheet"),
        ("AP", "Accounts Payable", "Liabilities", "Balance Sheet"),
        ("REVENUE_SALES", "Sales Revenue", "Revenue", "Income Statement"),
        ("OPEX_GENERAL", "Operating Expenses", "Operating Expenses", "Income Statement"),
    ]:
        n = TaxonomyNode(
            taxonomy_id=tx.id, code=code, name=name,
            statement_type=stmt, financial_statement_section=sec,
            normal_balance="debit" if sec in ("Assets", "Operating Expenses") else "credit",
            sort_order=100, level=0, is_system=True,
        )
        s.add(n); s.flush()
        nodes[code] = n

    seed_crl_catalog(s)

    accts = {}
    for num, name, atype, nb in [
        ("1000", "Cash", "asset", "debit"),
        ("1100", "Accounts Receivable", "asset", "debit"),
        ("2000", "Accounts Payable", "liability", "credit"),
        ("4000", "Sales Revenue", "revenue", "credit"),
        ("5000", "Operating Expenses", "expense", "debit"),
    ]:
        a = Account(entity_id=entity.id, account_number=num, account_name=name,
                    account_type=atype, normal_balance=nb, is_postable=True)
        s.add(a); s.flush()
        accts[num] = a

    # Direct CRL link: Cash -> CRL_CASH
    cash_crl = get_crl_by_code(s, "CRL_CASH")
    accts["1000"].common_reporting_line_id = cash_crl.id

    # Sprint O link: AR via taxonomy node
    s.add(AccountTaxonomyMapping(
        account_id=accts["1100"].id,
        taxonomy_id=tx.id,
        taxonomy_node_id=nodes["AR"].id,
        mapping_type="manual",
        mapping_source="user_selected",
    ))

    # Post JE
    je = JournalEntry(
        entity_id=entity.id, scenario_id=scenario.id,
        entry_date=datetime.date(2026, 1, 31),
        je_number="JE-001",
        description="Opening balances",
        status="posted",
        source="tb_import",
    )
    s.add(je); s.flush()
    lines = [
        (accts["1000"].id, Decimal("10000"), Decimal("0")),
        (accts["1100"].id, Decimal("3000"), Decimal("0")),
        (accts["5000"].id, Decimal("2500"), Decimal("0")),
        (accts["2000"].id, Decimal("0"), Decimal("4000")),
        (accts["4000"].id, Decimal("0"), Decimal("11500")),
    ]
    for idx, (acct_id, dr, cr) in enumerate(lines, start=1):
        s.add(JournalEntryLine(
            journal_entry_id=je.id, account_id=acct_id, entity_id=entity.id,
            line_number=idx, debit=dr, credit=cr,
        ))
    s.commit()
    out = {
        "org_id": org.id,
        "entity_id": entity.id,
        "scenario_id": scenario.id,
        "account_ids": {k: a.id for k, a in accts.items()},
        "as_of_date": datetime.date(2026, 1, 31),
    }
    s.close()
    return out


# ---------------------------------------------------------------------------
# Service-level — get_crl_statement
# ---------------------------------------------------------------------------

def test_statement_aggregates_balances_per_crl(Session, fixture):
    s = Session()
    stmt = get_crl_statement(
        s,
        entity_id=fixture["entity_id"],
        as_of_date=fixture["as_of_date"],
        scenario_ids=[fixture["scenario_id"]],
        organization_id=fixture["org_id"],
    )
    s.close()
    by_code = {r.crl_code: r for r in stmt.rows}
    # Cash → direct link, 10000 net_debit
    assert by_code["CRL_CASH"].own_signed_balance == Decimal("10000")
    # AR → sprint O link, 3000 net_debit
    assert by_code["CRL_AR"].own_signed_balance == Decimal("3000")


def test_statement_routes_unmapped_accounts_to_unclassified(Session, fixture):
    s = Session()
    stmt = get_crl_statement(
        s,
        entity_id=fixture["entity_id"],
        as_of_date=fixture["as_of_date"],
        scenario_ids=[fixture["scenario_id"]],
        organization_id=fixture["org_id"],
    )
    s.close()
    by_code = {r.crl_code: r for r in stmt.rows}
    # AP, Sales Revenue, OpEx all unmapped → 3 accounts under UNCLASSIFIED
    assert stmt.unclassified_accounts == 3
    assert "CRL_UNCLASSIFIED" in by_code
    assert by_code["CRL_UNCLASSIFIED"].account_count == 3


def test_statement_counts_classified_vs_unclassified(Session, fixture):
    s = Session()
    stmt = get_crl_statement(
        s,
        entity_id=fixture["entity_id"],
        as_of_date=fixture["as_of_date"],
        scenario_ids=[fixture["scenario_id"]],
        organization_id=fixture["org_id"],
    )
    s.close()
    assert stmt.total_accounts == 5
    assert stmt.classified_accounts == 2  # Cash + AR
    assert stmt.unclassified_accounts == 3


def test_display_balance_flips_sign_for_credit_normal_sections(Session, fixture):
    """A CRL in Assets shows positive net_debit; one in Revenue shows positive after flip."""
    s = Session()
    # Wire AP -> CRL_AP directly so we have a credit-normal CRL row.
    ap_crl = get_crl_by_code(s, "CRL_AP")
    s.query(Account).filter_by(
        id=fixture["account_ids"]["2000"]
    ).update({"common_reporting_line_id": ap_crl.id})
    s.commit()

    stmt = get_crl_statement(
        s,
        entity_id=fixture["entity_id"],
        as_of_date=fixture["as_of_date"],
        scenario_ids=[fixture["scenario_id"]],
        organization_id=fixture["org_id"],
    )
    s.close()
    by_code = {r.crl_code: r for r in stmt.rows}
    cash = by_code["CRL_CASH"]
    ap = by_code["CRL_AP"]
    # Cash: net_debit = +10000, section Assets → display = +10000
    assert cash.own_signed_balance == Decimal("10000")
    assert cash.display_balance == Decimal("10000")
    # AP: net_debit = -4000 (credit balance), section Liabilities → display flips to +4000
    assert ap.own_signed_balance == Decimal("-4000")
    assert ap.display_balance == Decimal("4000")


def test_statement_type_filter_isolates_balance_sheet(Session, fixture):
    s = Session()
    stmt = get_crl_statement(
        s,
        entity_id=fixture["entity_id"],
        as_of_date=fixture["as_of_date"],
        scenario_ids=[fixture["scenario_id"]],
        statement_type=STATEMENT_TYPE_BALANCE_SHEET,
        organization_id=fixture["org_id"],
    )
    s.close()
    # Every returned row should be a BS row (CRL_CASH, CRL_AR present; revenue/expense filtered out).
    for r in stmt.rows:
        # Mandatory sentinel rows may be marked Sentinel section — allow them.
        if r.is_mandatory:
            continue
        assert r.statement_type == STATEMENT_TYPE_BALANCE_SHEET, (
            f"Unexpected non-BS row {r.crl_code} ({r.statement_type})"
        )
    codes = {r.crl_code for r in stmt.rows}
    assert "CRL_CASH" in codes
    assert "CRL_AR" in codes


def test_template_filter_excludes_non_template_crls(Session, fixture):
    s = Session()
    # Build a tiny org template that exposes only CRL_CASH.
    tpl = ReportingTemplate(
        code="cash_only", name="Cash Only", is_system=False, is_active=True,
        organization_id=fixture["org_id"],
    )
    s.add(tpl); s.flush()
    cash_crl = get_crl_by_code(s, "CRL_CASH")
    s.add(ReportingTemplateCrl(
        template_id=tpl.id, crl_id=cash_crl.id, is_visible=True, sort_order=0,
    ))
    s.commit()
    tpl_id = tpl.id

    stmt = get_crl_statement(
        s,
        entity_id=fixture["entity_id"],
        as_of_date=fixture["as_of_date"],
        scenario_ids=[fixture["scenario_id"]],
        organization_id=fixture["org_id"],
        template_id=tpl_id,
    )
    s.close()
    codes = {r.crl_code for r in stmt.rows}
    # Cash is in the template
    assert "CRL_CASH" in codes
    # AR is NOT — but AR has a real balance so it should land in
    # accounts_outside_template counter, NOT in the visible rows.
    assert "CRL_AR" not in codes
    assert stmt.accounts_outside_template >= 1
    # Mandatory sentinels stay visible regardless of template
    assert "CRL_UNCLASSIFIED" in codes


def test_parent_rollup_flows_child_into_parent(Session, fixture):
    """CRL_PAYROLL_SALARIES (sub-line of CRL_PAYROLL_EXPENSE) → CRL_PAYROLL_EXPENSE total."""
    s = Session()
    salaries = get_crl_by_code(s, "CRL_PAYROLL_SALARIES")
    assert salaries is not None and salaries.parent_crl_id is not None
    parent_id = salaries.parent_crl_id

    # Reassign the OpEx account directly to CRL_PAYROLL_SALARIES
    s.query(Account).filter_by(
        id=fixture["account_ids"]["5000"]
    ).update({"common_reporting_line_id": salaries.id})
    s.commit()

    stmt = get_crl_statement(
        s,
        entity_id=fixture["entity_id"],
        as_of_date=fixture["as_of_date"],
        scenario_ids=[fixture["scenario_id"]],
        organization_id=fixture["org_id"],
    )
    s.close()
    by_id = {r.crl_id: r for r in stmt.rows}
    by_code = {r.crl_code: r for r in stmt.rows}
    # Salaries has its own 2500
    assert by_code["CRL_PAYROLL_SALARIES"].own_signed_balance == Decimal("2500")
    # Parent (Payroll Expense) own = 0 but total picks up the child
    parent_row = by_id[parent_id]
    assert parent_row.own_signed_balance == Decimal("0")
    assert parent_row.total_signed_balance == Decimal("2500")


# ---------------------------------------------------------------------------
# HTTP endpoint shape
# ---------------------------------------------------------------------------

def test_endpoint_trial_balance_returns_expected_keys(client, fixture):
    r = client.get("/api/v1/financial-statements/crl/trial-balance", params={
        "entity_id": fixture["entity_id"],
        "as_of_date": "2026-01-31",
        "scenario_ids": [fixture["scenario_id"]],
        "organization_id": fixture["org_id"],
    })
    assert r.status_code == 200
    body = r.json()
    expected_keys = {
        "rows", "sections", "total_accounts", "classified_accounts",
        "unclassified_accounts", "needs_review_accounts",
        "accounts_outside_template", "template_id", "statement_type",
    }
    assert expected_keys.issubset(body.keys())
    assert isinstance(body["rows"], list)
    assert body["total_accounts"] == 5


def test_endpoint_balance_sheet_returns_only_bs_rows(client, fixture):
    r = client.get("/api/v1/financial-statements/crl/balance-sheet", params={
        "entity_id": fixture["entity_id"],
        "as_of_date": "2026-01-31",
        "scenario_ids": [fixture["scenario_id"]],
        "organization_id": fixture["org_id"],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["statement_type"] == STATEMENT_TYPE_BALANCE_SHEET
    cash_row = next(r for r in body["rows"] if r["crl_code"] == "CRL_CASH")
    # display_balance equals total_signed_balance for asset rows (no sign flip)
    assert Decimal(cash_row["display_balance"]) == Decimal("10000")
    # Money values come back as strings so JS Decimal libs don't lose precision
    assert isinstance(cash_row["own_signed_balance"], str)


def test_endpoint_income_statement_excludes_balance_sheet_rows(client, fixture):
    r = client.get("/api/v1/financial-statements/crl/income-statement", params={
        "entity_id": fixture["entity_id"],
        "as_of_date": "2026-01-31",
        "scenario_ids": [fixture["scenario_id"]],
        "organization_id": fixture["org_id"],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["statement_type"] == STATEMENT_TYPE_INCOME_STATEMENT
    # Cash is BS — must not appear.
    codes = {r["crl_code"] for r in body["rows"]}
    assert "CRL_CASH" not in codes
    assert "CRL_AR" not in codes


def test_endpoint_empty_entity_returns_zero_counts(client, Session):
    """No accounts, no JEs → empty rows, all counters zero."""
    s = Session()
    org = Organization(name="Empty", slug="empty"); s.add(org); s.flush()
    entity = Entity(code="X", name="X", entity_type="operating",
                    organization_id=org.id, currency="USD")
    s.add(entity); s.flush()
    seed_crl_catalog(s)
    s.commit()
    eid = entity.id
    oid = org.id
    s.close()

    r = client.get("/api/v1/financial-statements/crl/trial-balance", params={
        "entity_id": eid,
        "as_of_date": "2026-01-31",
        "organization_id": oid,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["total_accounts"] == 0
    assert body["rows"] == []


def test_endpoint_template_filter_surfaces_outside_count(client, fixture, Session):
    s = Session()
    tpl = ReportingTemplate(
        code="cash_only", name="Cash Only", is_system=False, is_active=True,
        organization_id=fixture["org_id"],
    )
    s.add(tpl); s.flush()
    cash_crl = get_crl_by_code(s, "CRL_CASH")
    s.add(ReportingTemplateCrl(
        template_id=tpl.id, crl_id=cash_crl.id, is_visible=True, sort_order=0,
    ))
    s.commit()
    tpl_id = tpl.id
    s.close()

    r = client.get("/api/v1/financial-statements/crl/trial-balance", params={
        "entity_id": fixture["entity_id"],
        "as_of_date": "2026-01-31",
        "scenario_ids": [fixture["scenario_id"]],
        "organization_id": fixture["org_id"],
        "template_id": tpl_id,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["template_id"] == tpl_id
    assert body["accounts_outside_template"] >= 1
