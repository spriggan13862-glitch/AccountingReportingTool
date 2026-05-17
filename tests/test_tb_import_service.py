"""
Tests for tb_import_service: CSV parsing, account resolution, JE creation, rollforward.
"""
import datetime
from decimal import Decimal
from textwrap import dedent

import pytest

from app.models import Account, Entity, Scenario, TbImport
from app.schemas.journal_entry import JournalEntryCreate, JournalEntryLineCreate
from app.services.journal_entry_service import post_journal_entry
from app.services.reporting_service import get_account_balance, get_trial_balance
from app.services.tb_import_service import TbImportError, import_trial_balance

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def entity(session):
    e = Entity(code="TB_E", name="TB Test Entity", entity_type="operating")
    session.add(e)
    session.flush()
    return e


@pytest.fixture
def scenario(session):
    s = Scenario(code="TB_ACT", name="TB Actual", scenario_type="actual")
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


AS_OF = datetime.date(2023, 12, 31)
FUTURE = datetime.date(2024, 12, 31)


def do_import(session, entity, scenario, csv_text, je_number="JE-TB-001",
              as_of=AS_OF, filename="test_tb.csv", imported_by="tester"):
    return import_trial_balance(
        db=session,
        entity_id=entity.id,
        scenario_id=scenario.id,
        as_of_date=as_of,
        csv_content=dedent(csv_text).strip(),
        filename=filename,
        je_number=je_number,
        imported_by=imported_by,
    )


# ---------------------------------------------------------------------------
# 1. Balanced TB imports succeed
# ---------------------------------------------------------------------------

def test_balanced_debit_credit_import_succeeds(session, entity, scenario, accounts):
    csv_text = """
        account_number,debit,credit
        1000,50000.00,0.00
        2000,0.00,30000.00
        3000,0.00,20000.00
    """
    tb = do_import(session, entity, scenario, csv_text)

    assert tb.status == "processed"
    assert tb.je_id is not None
    assert tb.total_debits  == Decimal("50000.00")
    assert tb.total_credits == Decimal("50000.00")
    assert tb.row_count == 3
    assert tb.uploaded_by == "tester"
    assert tb.filename == "test_tb.csv"


def test_balanced_signed_import_succeeds(session, entity, scenario, accounts):
    """
    Signed format: positive = normal direction.
    Cash (debit-normal) 50000 → debit 50000
    AP   (credit-normal) 30000 → credit 30000
    Equity (credit-normal) 20000 → credit 20000
    Total: debits=50000, credits=50000  ✓
    """
    csv_text = """
        account_number,balance
        1000,50000.00
        2000,30000.00
        3000,20000.00
    """
    tb = do_import(session, entity, scenario, csv_text, je_number="JE-TB-002")

    assert tb.status == "processed"
    assert tb.total_debits  == Decimal("50000.00")
    assert tb.total_credits == Decimal("50000.00")


def test_signed_contra_balance_converts_correctly(session, entity, scenario, accounts):
    """
    A negative signed balance goes to the opposite side (contra/abnormal).
    Revenue (credit-normal) -500 → debit 500 (reduces revenue).
    Cash (debit-normal) 800 → debit 800.
    Balance so far: debits 800+500=1300, credits 0.
    Add AP (credit-normal) 1300 → credit 1300.
    """
    csv_text = """
        account_number,balance
        1000,800.00
        4000,-500.00
        2000,1300.00
    """
    tb = do_import(session, entity, scenario, csv_text, je_number="JE-TB-003")

    assert tb.status == "processed"
    assert tb.total_debits  == Decimal("1300.00")
    assert tb.total_credits == Decimal("1300.00")


# ---------------------------------------------------------------------------
# 2. Unbalanced TB imports fail
# ---------------------------------------------------------------------------

def test_unbalanced_import_fails(session, entity, scenario, accounts):
    csv_text = """
        account_number,debit,credit
        1000,50000.00,0.00
        2000,0.00,29999.00
    """
    with pytest.raises(TbImportError, match="does not balance"):
        do_import(session, entity, scenario, csv_text)


def test_unbalanced_import_records_failure_in_tb_import(session, entity, scenario, accounts):
    """Failed imports still persist a TbImport audit row with status='failed'."""
    csv_text = """
        account_number,debit,credit
        1000,50000.00,0.00
        2000,0.00,1.00
    """
    with pytest.raises(TbImportError):
        do_import(session, entity, scenario, csv_text)

    record = session.query(TbImport).filter_by(entity_id=entity.id).first()
    assert record is not None
    assert record.status == "failed"
    assert "does not balance" in record.error_message


def test_all_zero_import_fails(session, entity, scenario, accounts):
    csv_text = """
        account_number,debit,credit
        1000,0.00,0.00
        2000,0.00,0.00
    """
    with pytest.raises(TbImportError, match="no non-zero amounts"):
        do_import(session, entity, scenario, csv_text)


# ---------------------------------------------------------------------------
# 3. Imported balances appear in trial balance reporting
# ---------------------------------------------------------------------------

def test_imported_balances_visible_in_trial_balance(session, entity, scenario, accounts):
    csv_text = """
        account_number,debit,credit
        1000,75000.00,0.00
        2000,0.00,45000.00
        3000,0.00,30000.00
    """
    do_import(session, entity, scenario, csv_text)

    tb = get_trial_balance(session, entity.id, AS_OF, [scenario.id])
    by_acct = {r.account_number: r for r in tb}

    assert by_acct["1000"].total_debit  == Decimal("75000.00")
    assert by_acct["2000"].total_credit == Decimal("45000.00")
    assert by_acct["3000"].total_credit == Decimal("30000.00")


def test_imported_balance_matches_account_balance_query(session, entity, scenario, accounts):
    csv_text = """
        account_number,debit,credit
        1000,12345.67,0.00
        3000,0.00,12345.67
    """
    do_import(session, entity, scenario, csv_text)

    bal = get_account_balance(session, accounts["cash"].id, entity.id, AS_OF, [scenario.id])
    assert bal == Decimal("12345.67")


# ---------------------------------------------------------------------------
# 4. Imported balances roll forward correctly
# ---------------------------------------------------------------------------

def test_imported_balance_rolls_forward_to_next_year(session, entity, scenario, accounts):
    """A 2023 TB import must be visible in a 2024 trial balance query."""
    csv_text = """
        account_number,debit,credit
        1000,50000.00,0.00
        3000,0.00,50000.00
    """
    do_import(session, entity, scenario, csv_text)

    # Query a year later — the import JE (dated 2023-12-31) must still appear
    tb_2024 = get_trial_balance(session, entity.id, FUTURE, [scenario.id])
    by_acct = {r.account_number: r for r in tb_2024}

    assert by_acct["1000"].total_debit == Decimal("50000.00"), \
        "2023 TB import must be visible in 2024 trial balance"


def test_post_import_transaction_adds_to_rolled_forward_balance(session, entity, scenario, accounts):
    """Import 2023 balance, post a 2024 JE, verify 2024 cumulative balance."""
    csv_text = """
        account_number,debit,credit
        1000,50000.00,0.00
        3000,0.00,50000.00
    """
    do_import(session, entity, scenario, csv_text)

    # Post a 2024 cash-increase JE
    post_journal_entry(session, JournalEntryCreate(
        je_number="JE-2024-001",
        entry_date=datetime.date(2024, 6, 30),
        entity_id=entity.id,
        scenario_id=scenario.id,
        description="2024 cash inflow",
        lines=[
            JournalEntryLineCreate(
                line_number=1, account_id=accounts["cash"].id,
                entity_id=entity.id, debit=Decimal("10000"), credit=Decimal("0"),
            ),
            JournalEntryLineCreate(
                line_number=2, account_id=accounts["revenue"].id,
                entity_id=entity.id, debit=Decimal("0"), credit=Decimal("10000"),
            ),
        ],
    ))

    bal_2023 = get_account_balance(
        session, accounts["cash"].id, entity.id, AS_OF, [scenario.id])
    bal_2024 = get_account_balance(
        session, accounts["cash"].id, entity.id, FUTURE, [scenario.id])

    assert bal_2023 == Decimal("50000"), "2024 JE must not affect 2023 balance"
    assert bal_2024 == Decimal("60000"), "2024 balance must include TB import + 2024 JE"


# ---------------------------------------------------------------------------
# 5. Duplicate account rows aggregate correctly
# ---------------------------------------------------------------------------

def test_duplicate_account_rows_aggregate(session, entity, scenario, accounts):
    """Two rows for account 1000 must be summed into one JE line."""
    csv_text = """
        account_number,debit,credit
        1000,30000.00,0.00
        1000,20000.00,0.00
        3000,0.00,50000.00
    """
    tb = do_import(session, entity, scenario, csv_text)

    assert tb.status == "processed"
    assert tb.row_count == 3        # raw CSV rows (before aggregation)
    assert tb.total_debits == Decimal("50000.00")

    # Resulting balance for cash must be 50000, not 30000
    bal = get_account_balance(session, accounts["cash"].id, entity.id, AS_OF, [scenario.id])
    assert bal == Decimal("50000.00")


def test_duplicate_rows_signed_format(session, entity, scenario, accounts):
    """Duplicate rows in signed format also aggregate."""
    csv_text = """
        account_number,balance
        1000,25000.00
        1000,25000.00
        3000,50000.00
    """
    tb = do_import(session, entity, scenario, csv_text, je_number="JE-TB-DUP2")
    assert tb.status == "processed"
    assert tb.total_debits == Decimal("50000.00")


# ---------------------------------------------------------------------------
# 6. Invalid accounts fail cleanly
# ---------------------------------------------------------------------------

def test_unknown_account_fails_with_clear_error(session, entity, scenario, accounts):
    csv_text = """
        account_number,debit,credit
        9999,50000.00,0.00
        1000,0.00,50000.00
    """
    with pytest.raises(TbImportError, match="'9999' not found"):
        do_import(session, entity, scenario, csv_text)


def test_unknown_account_records_failure_in_tb_import(session, entity, scenario, accounts):
    csv_text = """
        account_number,debit,credit
        8888,10000.00,0.00
        1000,0.00,10000.00
    """
    with pytest.raises(TbImportError):
        do_import(session, entity, scenario, csv_text)

    record = session.query(TbImport).filter_by(entity_id=entity.id).first()
    assert record.status == "failed"
    assert "8888" in record.error_message


def test_bad_format_fails(session, entity, scenario, accounts):
    """CSV with no recognizable amount columns raises TbImportError."""
    csv_text = """
        account_number,amount_x,amount_y
        1000,50000,50000
    """
    with pytest.raises(TbImportError, match="unrecognized format"):
        do_import(session, entity, scenario, csv_text)


def test_empty_csv_fails(session, entity, scenario, accounts):
    with pytest.raises(TbImportError):
        do_import(session, entity, scenario, "")


def test_negative_debit_credit_amount_fails(session, entity, scenario, accounts):
    """Negative values in the debit/credit format are rejected at parse time."""
    csv_text = """
        account_number,debit,credit
        1000,-50000.00,0.00
        3000,0.00,-50000.00
    """
    with pytest.raises(TbImportError, match="non-negative"):
        do_import(session, entity, scenario, csv_text)


# ---------------------------------------------------------------------------
# Audit metadata
# ---------------------------------------------------------------------------

def test_import_audit_fields_populated(session, entity, scenario, accounts):
    csv_text = """
        account_number,debit,credit
        1000,1000.00,0.00
        3000,0.00,1000.00
    """
    tb = do_import(session, entity, scenario, csv_text,
                   filename="fy2023_tb.csv", imported_by="alice")

    assert tb.filename == "fy2023_tb.csv"
    assert tb.uploaded_by == "alice"
    assert tb.as_of_date == AS_OF
    assert tb.uploaded_at is not None
    assert tb.entity_id == entity.id
