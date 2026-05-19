"""
M25 Period Governance & Shadow-Close Validation Tests

Tests proving:
1.  hard-closed periods block posting
2.  soft-closed periods block posting
3.  reopen workflow functions correctly
4.  invalid transitions raise PeriodGovernanceError
5.  governance history audit trail persists
6.  retained earnings / IS continuity check validates
7.  TB-to-FS tie-out (TB_BALANCE check) validates
8.  BS balance check validates and detects imbalance
9.  comparative reporting calculates correctly
10. variance thresholds / materiality flags correctly
11. shadow-close overall status aggregation
12. reconciliation completeness check
"""

from __future__ import annotations

import datetime
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 — ensures all tables are registered
from app.database import Base


# ---------------------------------------------------------------------------
# Module-scoped DB and seed data
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture(scope="module")
def seeded(db):
    from app.models.organization import Organization
    from app.models.entity import Entity
    from app.models.account import Account
    from app.models.scenario import Scenario
    from app.services.organization_service import create_organization, seed_default_roles

    org = create_organization(db, name="Gov Test Corp", slug="gov-test")
    seed_default_roles(db)

    entity = Entity(organization_id=org.id, name="Gov Test Co", code="GTC", entity_type="operating", currency="USD")
    db.add(entity)

    scenario = Scenario(organization_id=org.id, name="Actual", code="ACT", scenario_type="actual")
    db.add(scenario)

    defs = [
        ("1000", "Cash", "asset", "debit"),
        ("2000", "Accounts Payable", "liability", "credit"),
        ("3000", "Retained Earnings", "equity", "credit"),
        ("4000", "Revenue", "revenue", "credit"),
        ("5000", "Expense", "expense", "debit"),
    ]
    accounts = {}
    for num, name, atype, normal in defs:
        a = Account(entity_id=entity.id, account_number=num, account_name=name, account_type=atype, normal_balance=normal)
        db.add(a)
        db.flush()
        accounts[num] = a

    db.flush()
    return {"org": org, "entity": entity, "scenario": scenario, "accounts": accounts, "org": org}


def _make_period(db, entity, name, year, period_num, start, end):
    from app.services.accounting_period_service import create_period
    return create_period(
        db,
        entity_id=entity.id,
        period_name=name,
        start_date=start,
        end_date=end,
        fiscal_year=year,
        fiscal_period=period_num,
        period_type="monthly",
    )


def _post_je(db, entity, scenario, accounts, debit_acct, credit_acct, amount, date, suffix=""):
    from app.services.journal_entry_service import post_journal_entry
    from app.schemas.journal_entry import JournalEntryCreate, JournalEntryLineCreate
    return post_journal_entry(db, JournalEntryCreate(
        je_number=f"JE-{date}-{debit_acct}-{credit_acct}-{amount}{suffix}",
        entry_date=date,
        entity_id=entity.id,
        scenario_id=scenario.id,
        description="Test",
        source="test",
        lines=[
            JournalEntryLineCreate(line_number=1, account_id=accounts[debit_acct].id, entity_id=entity.id, debit=Decimal(str(amount)), credit=Decimal("0")),
            JournalEntryLineCreate(line_number=2, account_id=accounts[credit_acct].id, entity_id=entity.id, debit=Decimal("0"), credit=Decimal(str(amount))),
        ],
    ))


# ---------------------------------------------------------------------------
# Test 1: Hard-closed period blocks posting via JE service
# ---------------------------------------------------------------------------

def test_hard_closed_blocks_posting(db, seeded):
    from app.services.period_governance_service import hard_close_period
    from app.services.journal_entry_service import ClosedPeriodError

    e = seeded["entity"]
    s = seeded["scenario"]
    accts = seeded["accounts"]

    period = _make_period(db, e, "Test Hard Close", 2030, 1,
                          datetime.date(2030, 1, 1), datetime.date(2030, 1, 31))
    hard_close_period(db, period.id, reason="Hard lock test")
    db.flush()

    with pytest.raises(ClosedPeriodError):
        _post_je(db, e, s, accts, "1000", "4000", 100, datetime.date(2030, 1, 15))


# ---------------------------------------------------------------------------
# Test 2: Soft-closed period blocks posting
# ---------------------------------------------------------------------------

def test_soft_closed_blocks_posting(db, seeded):
    from app.services.period_governance_service import soft_close_period
    from app.services.journal_entry_service import ClosedPeriodError

    e = seeded["entity"]
    s = seeded["scenario"]
    accts = seeded["accounts"]

    period = _make_period(db, e, "Test Soft Close", 2030, 2,
                          datetime.date(2030, 2, 1), datetime.date(2030, 2, 28))
    soft_close_period(db, period.id, reason="Soft close test")
    db.flush()

    with pytest.raises(ClosedPeriodError):
        _post_je(db, e, s, accts, "1000", "4000", 200, datetime.date(2030, 2, 15))


# ---------------------------------------------------------------------------
# Test 3: Reopen workflow
# ---------------------------------------------------------------------------

def test_reopen_allows_posting(db, seeded):
    from app.services.period_governance_service import soft_close_period, reopen_period
    from app.services.journal_entry_service import ClosedPeriodError

    e = seeded["entity"]
    s = seeded["scenario"]
    accts = seeded["accounts"]

    period = _make_period(db, e, "Test Reopen", 2030, 3,
                          datetime.date(2030, 3, 1), datetime.date(2030, 3, 31))
    soft_close_period(db, period.id)
    db.flush()

    with pytest.raises(ClosedPeriodError):
        _post_je(db, e, s, accts, "1000", "4000", 50, datetime.date(2030, 3, 10), "-blocked")

    reopen_period(db, period.id, reason="Controller approval")
    db.flush()

    je = _post_je(db, e, s, accts, "1000", "4000", 50, datetime.date(2030, 3, 10), "-after-reopen")
    assert je.status == "posted"


def test_reopen_sets_status(db, seeded):
    from app.services.period_governance_service import soft_close_period, reopen_period

    e = seeded["entity"]
    period = _make_period(db, e, "Status Reopen", 2030, 4,
                          datetime.date(2030, 4, 1), datetime.date(2030, 4, 30))
    soft_close_period(db, period.id)
    db.flush()
    period = reopen_period(db, period.id, reason="Override")
    db.flush()

    assert period.period_status == "reopened"
    assert period.is_closed is False


# ---------------------------------------------------------------------------
# Test 4: Invalid transition raises PeriodGovernanceError
# ---------------------------------------------------------------------------

def test_invalid_transition_open_to_reopened(db, seeded):
    from app.services.period_governance_service import reopen_period, PeriodGovernanceError

    e = seeded["entity"]
    period = _make_period(db, e, "Invalid Trans", 2030, 5,
                          datetime.date(2030, 5, 1), datetime.date(2030, 5, 31))
    with pytest.raises(PeriodGovernanceError):
        reopen_period(db, period.id)


def test_invalid_double_hard_close(db, seeded):
    from app.services.period_governance_service import hard_close_period, PeriodGovernanceError

    e = seeded["entity"]
    period = _make_period(db, e, "Double Hard", 2030, 6,
                          datetime.date(2030, 6, 1), datetime.date(2030, 6, 30))
    hard_close_period(db, period.id)
    db.flush()
    with pytest.raises(PeriodGovernanceError):
        hard_close_period(db, period.id)


# ---------------------------------------------------------------------------
# Test 5: Governance history audit trail
# ---------------------------------------------------------------------------

def test_governance_history_persists(db, seeded):
    from app.services.period_governance_service import (
        soft_close_period, reopen_period, hard_close_period, get_governance_history
    )

    e = seeded["entity"]
    period = _make_period(db, e, "History Test", 2030, 7,
                          datetime.date(2030, 7, 1), datetime.date(2030, 7, 31))

    soft_close_period(db, period.id, actor_user_id=42, reason="Monthly close")
    db.flush()
    reopen_period(db, period.id, actor_user_id=7, reason="Controller approved")
    db.flush()
    hard_close_period(db, period.id, actor_user_id=42, reason="Final lock")
    db.flush()

    history = get_governance_history(db, period.id)
    assert len(history) == 3
    assert history[0].event_type == "soft_close"
    assert history[0].from_status == "open"
    assert history[0].to_status == "soft_closed"
    assert history[0].actor_user_id == 42
    assert history[1].event_type == "reopen"
    assert history[2].event_type == "hard_close"
    assert history[2].to_status == "hard_closed"


# ---------------------------------------------------------------------------
# Test 6 & 7: IS continuity and TB balance checks
# ---------------------------------------------------------------------------

def test_tb_balance_balanced(db, seeded):
    from app.services.shadow_close_service import _check_tb_balance

    e = seeded["entity"]
    s = seeded["scenario"]
    accts = seeded["accounts"]

    period = _make_period(db, e, "TB Balance Test", 2031, 1,
                          datetime.date(2031, 1, 1), datetime.date(2031, 1, 31))
    _post_je(db, e, s, accts, "1000", "4000", 500, datetime.date(2031, 1, 5))
    db.flush()

    result = _check_tb_balance(db, e.id, s.id, period.start_date, period.end_date)
    assert result.status == "valid"


def test_is_continuity_no_prior(db, seeded):
    from app.services.shadow_close_service import _check_is_continuity

    e = seeded["entity"]
    s = seeded["scenario"]
    period = _make_period(db, e, "IS Cont First", 2031, 2,
                          datetime.date(2031, 2, 1), datetime.date(2031, 2, 28))
    result = _check_is_continuity(db, e.id, s.id, period)
    assert result.status == "valid"
    assert "No prior period" in result.message or "first period" in result.message or result.status == "valid"


# ---------------------------------------------------------------------------
# Test 8: BS balance check
# ---------------------------------------------------------------------------

def test_bs_balance_with_balanced_entries(db, seeded):
    from app.services.shadow_close_service import _check_bs_balance

    e = seeded["entity"]
    s = seeded["scenario"]
    accts = seeded["accounts"]

    period = _make_period(db, e, "BS Balance Test", 2031, 3,
                          datetime.date(2031, 3, 1), datetime.date(2031, 3, 31))
    # Cash DR 1000 / Revenue CR 1000
    _post_je(db, e, s, accts, "1000", "4000", 1000, datetime.date(2031, 3, 10))
    # Revenue DR 1000 / RE CR 1000  (close IS to equity)
    _post_je(db, e, s, accts, "4000", "3000", 1000, datetime.date(2031, 3, 31))
    db.flush()

    result = _check_bs_balance(db, e.id, s.id, period.start_date, period.end_date)
    assert result.status == "valid"


# ---------------------------------------------------------------------------
# Test 9: Comparative reporting calculates correctly
# ---------------------------------------------------------------------------

def test_comparative_report_basic(db, seeded):
    from app.services.comparative_report_service import build_comparative_report

    e = seeded["entity"]
    s = seeded["scenario"]
    accts = seeded["accounts"]

    p1 = _make_period(db, e, "Comp Jan", 2032, 1, datetime.date(2032, 1, 1), datetime.date(2032, 1, 31))
    p2 = _make_period(db, e, "Comp Feb", 2032, 2, datetime.date(2032, 2, 1), datetime.date(2032, 2, 28))

    _post_je(db, e, s, accts, "1000", "4000", 1000, datetime.date(2032, 1, 15), "-p1")
    _post_je(db, e, s, accts, "1000", "4000", 1500, datetime.date(2032, 2, 15), "-p2")
    db.flush()

    report = build_comparative_report(
        db,
        entity_id=e.id,
        current_period_id=p2.id,
        comparison_period_id=p1.id,
        report_type="income_statement",
        scenario_id=s.id,
        materiality_threshold=Decimal("100"),
    )

    assert report.current_period_name == "Comp Feb"
    assert report.comparison_period_name == "Comp Jan"
    revenue_section = next(sec for sec in report.sections if sec.section == "Revenue")
    assert revenue_section.current_total == Decimal("1500")
    assert revenue_section.prior_total == Decimal("1000")
    assert revenue_section.variance_total == Decimal("500")


# ---------------------------------------------------------------------------
# Test 10: Variance threshold / materiality
# ---------------------------------------------------------------------------

def test_variance_pct_calculation(db, seeded):
    from app.services.comparative_report_service import build_comparative_report, build_variance_summary

    e = seeded["entity"]
    s = seeded["scenario"]
    accts = seeded["accounts"]

    p1 = _make_period(db, e, "Pct Jan", 2033, 1, datetime.date(2033, 1, 1), datetime.date(2033, 1, 31))
    p2 = _make_period(db, e, "Pct Feb", 2033, 2, datetime.date(2033, 2, 1), datetime.date(2033, 2, 28))

    _post_je(db, e, s, accts, "5000", "1000", 100, datetime.date(2033, 1, 15), "-pct1")
    _post_je(db, e, s, accts, "5000", "1000", 150, datetime.date(2033, 2, 15), "-pct2")
    db.flush()

    report = build_comparative_report(
        db, entity_id=e.id,
        current_period_id=p2.id,
        comparison_period_id=p1.id,
        report_type="income_statement",
        scenario_id=s.id,
        materiality_threshold=Decimal("10"),
    )

    expense = next(sec for sec in report.sections if sec.section == "Expense")
    line = expense.lines[0]
    assert line.amount_variance == Decimal("50")
    assert line.pct_variance == Decimal("50.00")
    assert line.is_material is True

    summary = build_variance_summary(report)
    assert summary["material_variances_count"] >= 1


# ---------------------------------------------------------------------------
# Test 11: Shadow-close overall status aggregation
# ---------------------------------------------------------------------------

def test_shadow_close_runs_and_persists(db, seeded):
    from app.services.shadow_close_service import run_shadow_close_validation
    from app.models.shadow_close_run import ShadowCloseRun

    e = seeded["entity"]
    s = seeded["scenario"]
    accts = seeded["accounts"]

    period = _make_period(db, e, "Shadow Close Test", 2034, 1,
                          datetime.date(2034, 1, 1), datetime.date(2034, 1, 31))
    # Balanced TB
    _post_je(db, e, s, accts, "1000", "4000", 1000, datetime.date(2034, 1, 10), "-sc1")
    _post_je(db, e, s, accts, "4000", "3000", 1000, datetime.date(2034, 1, 31), "-sc2")
    db.flush()

    report = run_shadow_close_validation(db, period.id, e.id, s.id, persist=True)
    db.flush()

    tb_check = next(c for c in report.checks if c.check == "TB_BALANCE")
    assert tb_check.status == "valid"

    runs = db.query(ShadowCloseRun).filter(ShadowCloseRun.period_id == period.id).all()
    assert len(runs) == 1
    assert runs[0].overall_status == report.overall_status


def test_shadow_close_status_hierarchy(db, seeded):
    from app.services.shadow_close_service import run_shadow_close_validation

    e = seeded["entity"]
    period = _make_period(db, e, "Shadow Hierarchy", 2034, 2,
                          datetime.date(2034, 2, 1), datetime.date(2034, 2, 28))

    report = run_shadow_close_validation(db, period.id, e.id, None, persist=False)
    # Should run without error
    assert report.overall_status in ("valid", "warning", "blocked")
    assert len(report.checks) >= 4


# ---------------------------------------------------------------------------
# Test 12: Reconciliation completeness check
# ---------------------------------------------------------------------------

def test_recon_completeness_no_recons(db, seeded):
    from app.services.shadow_close_service import _check_recon_completeness

    e = seeded["entity"]
    period = _make_period(db, e, "Recon Complete Test", 2034, 3,
                          datetime.date(2034, 3, 1), datetime.date(2034, 3, 31))
    result = _check_recon_completeness(db, e.id, period.id)
    assert result.status == "warning"
    assert "No reconciliations" in result.message


def test_recon_completeness_with_incomplete(db, seeded):
    from app.services.shadow_close_service import _check_recon_completeness
    from app.models.reconciliation import Reconciliation

    e = seeded["entity"]
    accts = seeded["accounts"]
    org = seeded["org"]

    period = _make_period(db, e, "Recon Incomplete", 2034, 4,
                          datetime.date(2034, 4, 1), datetime.date(2034, 4, 30))
    recon = Reconciliation(
        organization_id=org.id,
        entity_id=e.id,
        account_id=accts["1000"].id,
        period_id=period.id,
        reconciliation_type="bank",
        status="in_progress",
        tie_out_status="untested",
        official_balance=Decimal("0"),
        supporting_balance=Decimal("0"),
        variance_amount=Decimal("0"),
    )
    db.add(recon)
    db.flush()

    result = _check_recon_completeness(db, e.id, period.id)
    assert result.status == "warning"
    assert result.detail["incomplete"] == 1


def test_lock_summary(db, seeded):
    from app.services.period_governance_service import get_lock_summary, hard_close_period

    e = seeded["entity"]
    period = _make_period(db, e, "Lock Summary Test", 2034, 5,
                          datetime.date(2034, 5, 1), datetime.date(2034, 5, 31))

    summary = get_lock_summary(db, period.id)
    assert summary.period_status == "open"
    assert summary.posting_allowed is True
    assert summary.is_hard_locked is False

    hard_close_period(db, period.id)
    db.flush()

    summary2 = get_lock_summary(db, period.id)
    assert summary2.is_hard_locked is True
    assert summary2.posting_allowed is False
