"""
Tests for reporting_service: account balance, trial balance, rollforward behavior.

All tests use a function-scoped session that rolls back after each test,
so each test builds its own ledger state from scratch.
"""
import datetime
from decimal import Decimal

import pytest

from app.models import Account, Entity, Scenario
from app.schemas.journal_entry import JournalEntryCreate, JournalEntryLineCreate
from app.services.journal_entry_service import post_journal_entry
from app.services.reporting_service import (
    TrialBalanceRow,
    get_account_balance,
    get_trial_balance,
    summarize_by_account_type,
)

# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def entity(session):
    e = Entity(code="RPT_E", name="Reporting Entity", entity_type="operating")
    session.add(e)
    session.flush()
    return e


@pytest.fixture
def scenario(session):
    s = Scenario(code="RPT_S", name="Reporting Scenario", scenario_type="actual")
    session.add(s)
    session.flush()
    return s


@pytest.fixture
def accounts(session):
    cash    = Account(account_number="1000", account_name="Cash",
                      account_type="asset",     normal_balance="debit")
    ar      = Account(account_number="1100", account_name="Accounts Receivable",
                      account_type="asset",     normal_balance="debit")
    ap      = Account(account_number="2000", account_name="Accounts Payable",
                      account_type="liability", normal_balance="credit")
    equity  = Account(account_number="3000", account_name="Retained Earnings",
                      account_type="equity",    normal_balance="credit")
    revenue = Account(account_number="4000", account_name="Revenue",
                      account_type="revenue",   normal_balance="credit")
    expense = Account(account_number="6000", account_name="Operating Expense",
                      account_type="expense",   normal_balance="debit")
    session.add_all([cash, ar, ap, equity, revenue, expense])
    session.flush()
    return {
        "cash": cash, "ar": ar, "ap": ap,
        "equity": equity, "revenue": revenue, "expense": expense,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def post(session, entity, scenario, accounts, je_number, entry_date, line_specs):
    """
    line_specs: list of (account_key, debit, credit)
    """
    lines = [
        JournalEntryLineCreate(
            line_number=i + 1,
            account_id=accounts[key].id,
            entity_id=entity.id,
            debit=Decimal(str(d)),
            credit=Decimal(str(c)),
        )
        for i, (key, d, c) in enumerate(line_specs)
    ]
    return post_journal_entry(session, JournalEntryCreate(
        je_number=je_number,
        entry_date=entry_date,
        entity_id=entity.id,
        scenario_id=scenario.id,
        description=je_number,
        lines=lines,
    ))


D2023 = datetime.date(2023, 12, 31)
D2024 = datetime.date(2024, 1, 1)
D2024_END = datetime.date(2024, 12, 31)


# ---------------------------------------------------------------------------
# 1. A 2023 entry appears in 2023 balances
# ---------------------------------------------------------------------------

def test_2023_entry_appears_in_2023_balances(session, entity, scenario, accounts):
    post(session, entity, scenario, accounts, "JE-001", D2023, [
        ("cash",    1000, 0),
        ("revenue",    0, 1000),
    ])

    tb = get_trial_balance(session, entity.id, D2023, [scenario.id])
    by_id = {r.account_id: r for r in tb}

    assert by_id[accounts["cash"].id].total_debit == Decimal("1000")
    assert by_id[accounts["revenue"].id].total_credit == Decimal("1000")


# ---------------------------------------------------------------------------
# 2. The same 2023 entry flows into 2024 balances (rollforward)
# ---------------------------------------------------------------------------

def test_2023_entry_rolls_forward_to_2024(session, entity, scenario, accounts):
    post(session, entity, scenario, accounts, "JE-001", D2023, [
        ("cash",    1000, 0),
        ("revenue",    0, 1000),
    ])

    # Query with as_of_date one year later — the 2023 JE must still be present
    tb_2024 = get_trial_balance(session, entity.id, D2024_END, [scenario.id])
    by_id = {r.account_id: r for r in tb_2024}

    assert by_id[accounts["cash"].id].total_debit == Decimal("1000"), \
        "2023 JE must be visible in 2024 trial balance"
    assert by_id[accounts["revenue"].id].total_credit == Decimal("1000")


# ---------------------------------------------------------------------------
# 3. A 2024 entry does not appear in 2023 balances
# ---------------------------------------------------------------------------

def test_2024_entry_excluded_from_2023_balances(session, entity, scenario, accounts):
    post(session, entity, scenario, accounts, "JE-001", D2023, [
        ("cash",    1000, 0),
        ("revenue",    0, 1000),
    ])
    post(session, entity, scenario, accounts, "JE-002", D2024, [
        ("cash",     500, 0),
        ("revenue",    0, 500),
    ])

    balance_2023 = get_account_balance(session, accounts["cash"].id, entity.id, D2023, [scenario.id])
    balance_2024 = get_account_balance(session, accounts["cash"].id, entity.id, D2024_END, [scenario.id])

    assert balance_2023 == Decimal("1000"), "2024 JE must not affect 2023 balance"
    assert balance_2024 == Decimal("1500"), "2024 balance must include both JEs"


# ---------------------------------------------------------------------------
# 4. Trial balance stays balanced
# ---------------------------------------------------------------------------

def test_trial_balance_stays_balanced(session, entity, scenario, accounts):
    post(session, entity, scenario, accounts, "JE-001", D2023, [
        ("cash",    1000,    0),
        ("revenue",    0, 1000),
    ])
    post(session, entity, scenario, accounts, "JE-002", D2023, [
        ("expense",  300,    0),
        ("cash",       0,  300),
    ])
    post(session, entity, scenario, accounts, "JE-003", D2024, [
        ("cash",     750,    0),
        ("revenue",    0,  750),
    ])

    tb = get_trial_balance(session, entity.id, D2024_END, [scenario.id])

    total_debit  = sum(r.total_debit  for r in tb)
    total_credit = sum(r.total_credit for r in tb)

    assert total_debit == total_credit, (
        f"Trial balance out of balance: debits={total_debit} credits={total_credit}"
    )


# ---------------------------------------------------------------------------
# 5. Debit-normal and credit-normal accounts calculate correctly
# ---------------------------------------------------------------------------

def test_debit_normal_account_signed_balance(session, entity, scenario, accounts):
    """Cash is debit-normal: a debit balance should yield a positive signed_balance."""
    post(session, entity, scenario, accounts, "JE-001", D2023, [
        ("cash",     800,   0),
        ("revenue",    0, 500),
        ("ap",         0, 300),
    ])

    tb = get_trial_balance(session, entity.id, D2023, [scenario.id])
    by_id = {r.account_id: r for r in tb}

    cash_row = by_id[accounts["cash"].id]
    assert cash_row.normal_balance == "debit"
    assert cash_row.net_debit == Decimal("800")
    assert cash_row.signed_balance == Decimal("800"), \
        "Debit-normal asset with a debit balance must show positive signed_balance"


def test_credit_normal_account_signed_balance(session, entity, scenario, accounts):
    """Revenue is credit-normal: a credit balance must yield positive signed_balance."""
    post(session, entity, scenario, accounts, "JE-001", D2023, [
        ("cash",     800,   0),
        ("revenue",    0, 500),
        ("ap",         0, 300),
    ])

    tb = get_trial_balance(session, entity.id, D2023, [scenario.id])
    by_id = {r.account_id: r for r in tb}

    rev_row = by_id[accounts["revenue"].id]
    assert rev_row.normal_balance == "credit"
    assert rev_row.net_debit == Decimal("-500"), \
        "Revenue with $500 credit: net_debit must be negative"
    assert rev_row.signed_balance == Decimal("500"), \
        "Credit-normal revenue with credit balance must show positive signed_balance"

    ap_row = by_id[accounts["ap"].id]
    assert ap_row.normal_balance == "credit"
    assert ap_row.signed_balance == Decimal("300")


def test_contra_balance_signed_correctly(session, entity, scenario, accounts):
    """An account with a balance opposite its normal direction shows negative signed_balance."""
    # Post a debit to a credit-normal account (unusual / contra situation)
    post(session, entity, scenario, accounts, "JE-001", D2023, [
        ("revenue",  200,   0),   # debit to revenue (reduces it)
        ("cash",       0, 200),
    ])

    tb = get_trial_balance(session, entity.id, D2023, [scenario.id])
    by_id = {r.account_id: r for r in tb}

    rev_row = by_id[accounts["revenue"].id]
    assert rev_row.net_debit == Decimal("200"), "Debit to revenue → positive net_debit"
    assert rev_row.signed_balance == Decimal("-200"), \
        "Debit balance on credit-normal account → negative signed_balance"


# ---------------------------------------------------------------------------
# 6. Multiple journal entries aggregate correctly
# ---------------------------------------------------------------------------

def test_multiple_entries_aggregate(session, entity, scenario, accounts):
    """Three JEs across two periods; verify per-account totals cumulate correctly."""
    post(session, entity, scenario, accounts, "JE-001", D2023, [
        ("cash",    1000,    0),
        ("revenue",    0, 1000),
    ])
    post(session, entity, scenario, accounts, "JE-002", D2023, [
        ("expense",  400,    0),
        ("cash",       0,  400),
    ])
    post(session, entity, scenario, accounts, "JE-003", D2024, [
        ("cash",     600,    0),
        ("revenue",    0,  600),
    ])

    # As of end-2024: all three JEs included
    balance_cash    = get_account_balance(session, accounts["cash"].id,    entity.id, D2024_END, [scenario.id])
    balance_revenue = get_account_balance(session, accounts["revenue"].id, entity.id, D2024_END, [scenario.id])
    balance_expense = get_account_balance(session, accounts["expense"].id, entity.id, D2024_END, [scenario.id])

    # Cash: +1000 (JE1) - 400 (JE2) + 600 (JE3) = 1200
    assert balance_cash == Decimal("1200")
    # Revenue: -1000 (JE1) - 600 (JE3) = -1600  (credit normal → net_debit is negative)
    assert balance_revenue == Decimal("-1600")
    # Expense: +400 (JE2) = 400
    assert balance_expense == Decimal("400")


def test_summarize_by_account_type(session, entity, scenario, accounts):
    """Balance sheet summary: assets should equal liabilities + equity."""
    # Opening balance: cash funded by equity
    post(session, entity, scenario, accounts, "JE-001", D2023, [
        ("cash",    5000,    0),
        ("equity",     0, 5000),
    ])
    # Revenue earned in cash
    post(session, entity, scenario, accounts, "JE-002", D2023, [
        ("cash",    1000,    0),
        ("revenue",    0, 1000),
    ])
    # Expense paid in cash
    post(session, entity, scenario, accounts, "JE-003", D2023, [
        ("expense",  300,    0),
        ("cash",       0,  300),
    ])

    tb = get_trial_balance(session, entity.id, D2023, [scenario.id])
    summary = summarize_by_account_type(tb)

    # cash: 5000+1000-300 = 5700 debit-normal asset → signed +5700
    assert summary["asset"] == Decimal("5700")
    # equity: 5000 credit → signed +5000
    assert summary["equity"] == Decimal("5000")
    # revenue: 1000 credit → signed +1000
    assert summary["revenue"] == Decimal("1000")
    # expense: 300 debit → signed +300
    assert summary["expense"] == Decimal("300")


def test_account_with_no_activity_absent_from_trial_balance(session, entity, scenario, accounts):
    """Accounts with zero postings through as_of_date must not appear in the TB."""
    post(session, entity, scenario, accounts, "JE-001", D2023, [
        ("cash",    100,   0),
        ("revenue",   0, 100),
    ])

    # AR and expense have no entries
    tb = get_trial_balance(session, entity.id, D2023, [scenario.id])
    account_ids = {r.account_id for r in tb}

    assert accounts["ar"].id not in account_ids
    assert accounts["expense"].id not in account_ids
