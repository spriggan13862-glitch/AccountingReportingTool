"""
Correction 15 — unified reporting engines.

Hard-stop the user named:
  Set account.common_reporting_line_id = Cash & Cash Equivalents.
  - By FSLI statement shows Cash & Cash Equivalents
  - Legacy /statements Balance Sheet shows Cash & Cash Equivalents
  - Income Statement excludes it
  - No normal statement classifies 1000 Cash differently

These tests exercise both reporting services with the same fixture and
assert classifications agree.
"""
import datetime
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.services.crl_service import seed_crl_catalog, get_crl_by_code
from app.services.crl_reporting_service import get_crl_statement
from app.services.taxonomy_reporting_service import get_taxonomy_fs_statement
from app.models.organization import Organization
from app.models.entity import Entity
from app.models.account import Account
from app.models.scenario import Scenario
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
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
def wired(Session):
    """
    Single Cash account, single balancing Equity account, JE posted with
    DR Cash 10,000 / CR Equity 10,000. Cash is wired ONLY through the
    canonical store (account.common_reporting_line_id = CRL_CASH);
    reporting_taxonomy_line_id is left NULL on purpose so the test
    proves the canonical-first read works.

    A matching ReportingTaxonomyLine code='CASH' is created so the
    canonical-first resolver in get_taxonomy_fs_statement has somewhere
    to map the CRL back to.
    """
    s = Session()
    org = Organization(name="ACME", slug="acme"); s.add(org); s.flush()
    entity = Entity(code="E1", name="ACME Op", entity_type="operating",
                    organization_id=org.id, currency="USD")
    s.add(entity); s.flush()
    scenario = Scenario(code="actuals", name="Actuals", scenario_type="actual",
                        organization_id=org.id, active=True)
    s.add(scenario); s.flush()

    seed_crl_catalog(s)

    # ReportingTaxonomyLines matching CRL primary node codes.
    cash_tax_line = ReportingTaxonomyLine(
        code="CASH", name="Cash & Cash Equivalents",
        section="asset", statement_type="balance_sheet",
        sort_order=100, active=True, normal_balance="debit",
    )
    # Add another BS line to prove canonical doesn't accidentally
    # promote the wrong CRL.
    ar_tax_line = ReportingTaxonomyLine(
        code="AR", name="Accounts Receivable",
        section="asset", statement_type="balance_sheet",
        sort_order=110, active=True, normal_balance="debit",
    )
    s.add_all([cash_tax_line, ar_tax_line]); s.flush()

    cash = Account(
        entity_id=entity.id, account_number="1000", account_name="Cash",
        account_type="asset", normal_balance="debit", is_postable=True,
    )
    equity = Account(
        entity_id=entity.id, account_number="3000", account_name="Equity",
        account_type="equity", normal_balance="credit", is_postable=True,
    )
    s.add_all([cash, equity]); s.flush()

    # CRL_CASH is the canonical FSLI for Cash.
    crl_cash = get_crl_by_code(s, "CRL_CASH")
    cash.common_reporting_line_id = crl_cash.id
    cash.crl_state = "assigned"
    # Legacy field is intentionally NULL — this is the new path.

    je = JournalEntry(
        entity_id=entity.id, scenario_id=scenario.id,
        entry_date=datetime.date(2026, 1, 31),
        je_number="JE-CR15", description="Test", status="posted",
        source="tb_import",
    )
    s.add(je); s.flush()
    s.add(JournalEntryLine(
        journal_entry_id=je.id, account_id=cash.id, entity_id=entity.id,
        line_number=1, debit=Decimal("10000"), credit=Decimal("0"),
    ))
    s.add(JournalEntryLine(
        journal_entry_id=je.id, account_id=equity.id, entity_id=entity.id,
        line_number=2, debit=Decimal("0"), credit=Decimal("10000"),
    ))
    s.commit()
    out = {
        "org_id": org.id, "entity_id": entity.id, "scenario_id": scenario.id,
        "cash_account_id": cash.id, "equity_account_id": equity.id,
        "as_of_date": datetime.date(2026, 1, 31),
    }
    s.close()
    return out


# ---------------------------------------------------------------------------
# 1. Both engines classify Cash identically
# ---------------------------------------------------------------------------

def test_by_fsli_engine_classifies_cash_under_cash_fsli(Session, wired):
    s = Session()
    stmt = get_crl_statement(
        s,
        entity_id=wired["entity_id"],
        as_of_date=wired["as_of_date"],
        scenario_ids=[wired["scenario_id"]],
        organization_id=wired["org_id"],
    )
    s.close()
    by_code = {r.crl_code: r for r in stmt.rows}
    assert "CRL_CASH" in by_code
    assert by_code["CRL_CASH"].own_signed_balance == Decimal("10000")


def test_legacy_bs_engine_classifies_cash_under_cash_taxonomy_line(Session, wired):
    """After Correction 15, the legacy /statements BS reads canonical CRL first."""
    s = Session()
    rows = get_taxonomy_fs_statement(
        s,
        entity_id=wired["entity_id"],
        as_of_date=wired["as_of_date"],
        scenario_ids=[wired["scenario_id"]],
        statement_type="balance_sheet",
        organization_id=wired["org_id"],
    )
    s.close()
    by_code = {r.code: r for r in rows}
    assert "CASH" in by_code, "Cash taxonomy line missing — canonical resolver failed"
    assert by_code["CASH"].own_balance == Decimal("10000"), (
        f"Expected $10,000 under CASH (resolved from CRL_CASH); got "
        f"{by_code['CASH'].own_balance}. Canonical resolver did not promote "
        f"common_reporting_line_id."
    )
    # AR has no balance — proves we didn't accidentally route to the wrong line.
    if "AR" in by_code:
        assert by_code["AR"].own_balance == Decimal("0")


def test_legacy_is_engine_excludes_cash(Session, wired):
    """Cash is a BS account; the IS statement must not include it."""
    s = Session()
    rows = get_taxonomy_fs_statement(
        s,
        entity_id=wired["entity_id"],
        as_of_date=wired["as_of_date"],
        scenario_ids=[wired["scenario_id"]],
        statement_type="income_statement",
        organization_id=wired["org_id"],
    )
    s.close()
    by_code = {r.code: r for r in rows}
    # Either the CASH row isn't present at all, or it has zero balance.
    if "CASH" in by_code:
        assert by_code["CASH"].own_balance == Decimal("0")


# ---------------------------------------------------------------------------
# 2. Canonical precedence — explicit canonical wins over legacy
# ---------------------------------------------------------------------------

def test_canonical_wins_over_legacy_when_both_set(Session, wired):
    """
    Account has BOTH canonical (CRL_CASH) and legacy (AR taxonomy line) set.
    Per Correction 15 precedence, canonical must win — the balance lands
    under CASH, not under AR.
    """
    s = Session()
    cash = s.query(Account).filter_by(id=wired["cash_account_id"]).first()
    ar_line = s.query(ReportingTaxonomyLine).filter_by(code="AR").first()
    cash.reporting_taxonomy_line_id = ar_line.id  # legacy says AR
    # canonical still says CRL_CASH (set in the fixture)
    s.commit()

    rows = get_taxonomy_fs_statement(
        s,
        entity_id=wired["entity_id"],
        as_of_date=wired["as_of_date"],
        scenario_ids=[wired["scenario_id"]],
        statement_type="balance_sheet",
        organization_id=wired["org_id"],
    )
    s.close()
    by_code = {r.code: r for r in rows}
    assert by_code["CASH"].own_balance == Decimal("10000"), (
        "Canonical CRL_CASH should win — Cash must land under CASH"
    )
    assert by_code["AR"].own_balance == Decimal("0"), (
        "Legacy AR mapping must be ignored when canonical is set"
    )


# ---------------------------------------------------------------------------
# 3. Hard-stop — agree across both engines for the same account
# ---------------------------------------------------------------------------

def test_by_fsli_and_legacy_bs_agree_on_cash_classification(Session, wired):
    """
    The hard-stop: feed both engines the same DB state and compare.
    Both must classify the $10,000 Cash balance into a 'Cash' bucket.
    """
    s = Session()
    crl_stmt = get_crl_statement(
        s,
        entity_id=wired["entity_id"],
        as_of_date=wired["as_of_date"],
        scenario_ids=[wired["scenario_id"]],
        organization_id=wired["org_id"],
    )
    legacy_rows = get_taxonomy_fs_statement(
        s,
        entity_id=wired["entity_id"],
        as_of_date=wired["as_of_date"],
        scenario_ids=[wired["scenario_id"]],
        statement_type="balance_sheet",
        organization_id=wired["org_id"],
    )
    s.close()

    crl_cash_balance = next(
        r.own_signed_balance for r in crl_stmt.rows if r.crl_code == "CRL_CASH"
    )
    legacy_cash_balance = next(
        r.own_balance for r in legacy_rows if r.code == "CASH"
    )
    assert crl_cash_balance == legacy_cash_balance, (
        f"DISAGREEMENT: By FSLI says CRL_CASH={crl_cash_balance}, "
        f"legacy BS says CASH={legacy_cash_balance}"
    )


# ---------------------------------------------------------------------------
# 4. Legacy fallback still works when canonical is null
# ---------------------------------------------------------------------------

def test_legacy_fallback_when_canonical_is_null(Session, wired):
    """
    Clear the canonical mapping but set the legacy reporting_taxonomy_line_id.
    Resolution must still find CASH via the fallback path.
    """
    s = Session()
    cash = s.query(Account).filter_by(id=wired["cash_account_id"]).first()
    cash_tax_line = s.query(ReportingTaxonomyLine).filter_by(code="CASH").first()
    cash.common_reporting_line_id = None
    cash.crl_state = "unclassified"
    cash.reporting_taxonomy_line_id = cash_tax_line.id  # legacy only
    s.commit()

    rows = get_taxonomy_fs_statement(
        s,
        entity_id=wired["entity_id"],
        as_of_date=wired["as_of_date"],
        scenario_ids=[wired["scenario_id"]],
        statement_type="balance_sheet",
        organization_id=wired["org_id"],
    )
    s.close()
    by_code = {r.code: r for r in rows}
    assert by_code["CASH"].own_balance == Decimal("10000"), (
        "Legacy fallback path failed — Cash should still resolve to CASH "
        "via reporting_taxonomy_line_id when canonical is null."
    )


# ---------------------------------------------------------------------------
# 5. View overrides still win over both canonical and legacy
# ---------------------------------------------------------------------------

def test_view_overrides_still_supersede_both_paths(Session, wired):
    """
    Advanced Taxonomy Override sets a per-view override that maps Cash
    to the AR taxonomy line (silly but valid for the test). The override
    must win over both the canonical CRL_CASH and the legacy field.
    """
    s = Session()
    ar_line = s.query(ReportingTaxonomyLine).filter_by(code="AR").first()
    overrides = {wired["cash_account_id"]: ar_line.id}

    rows = get_taxonomy_fs_statement(
        s,
        entity_id=wired["entity_id"],
        as_of_date=wired["as_of_date"],
        scenario_ids=[wired["scenario_id"]],
        statement_type="balance_sheet",
        view_overrides=overrides,
        organization_id=wired["org_id"],
    )
    s.close()
    by_code = {r.code: r for r in rows}
    assert by_code["AR"].own_balance == Decimal("10000"), (
        "View override must supersede canonical CRL — Cash should land under AR"
    )
    assert by_code["CASH"].own_balance == Decimal("0")
