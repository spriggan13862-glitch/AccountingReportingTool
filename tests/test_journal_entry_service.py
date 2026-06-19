import datetime
from decimal import Decimal

import pytest

from app.models import Account, Entity, JournalEntry, JournalEntryLine, Scenario
from app.schemas.journal_entry import JournalEntryCreate, JournalEntryLineCreate
from app.services.journal_entry_service import (
    JournalEntryNotFoundError,
    JournalEntryValidationError,
    get_journal_entry_or_raise,
    post_journal_entry,
)

# ---------------------------------------------------------------------------
# Shared test fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def entity(session):
    e = Entity(code="TEST_E", name="Test Entity", entity_type="operating")
    session.add(e)
    session.flush()
    return e


@pytest.fixture
def scenario(session):
    s = Scenario(code="TEST_S", name="Test Scenario", scenario_type="actual")
    session.add(s)
    session.flush()
    return s


@pytest.fixture
def accounts(session):
    cash = Account(
        account_number="1000", account_name="Cash",
        account_type="asset", normal_balance="debit",
    )
    revenue = Account(
        account_number="4000", account_name="Revenue",
        account_type="revenue", normal_balance="credit",
    )
    expense = Account(
        account_number="6000", account_name="Expense",
        account_type="expense", normal_balance="debit",
    )
    session.add_all([cash, revenue, expense])
    session.flush()
    return {"cash": cash, "revenue": revenue, "expense": expense}


def _je_data(entity, scenario, accounts, je_number="JE-TEST-001", lines=None):
    """Build a balanced JournalEntryCreate with default cash/revenue lines."""
    if lines is None:
        lines = [
            JournalEntryLineCreate(
                line_number=1,
                account_id=accounts["cash"].id,
                entity_id=entity.id,
                debit=Decimal("1000.00"),
                credit=Decimal("0"),
            ),
            JournalEntryLineCreate(
                line_number=2,
                account_id=accounts["revenue"].id,
                entity_id=entity.id,
                debit=Decimal("0"),
                credit=Decimal("1000.00"),
            ),
        ]
    return JournalEntryCreate(
        je_number=je_number,
        entry_date=datetime.date(2024, 12, 31),
        entity_id=entity.id,
        scenario_id=scenario.id,
        description="Test journal entry",
        lines=lines,
    )


# ---------------------------------------------------------------------------
# 1. Balanced entries are accepted
# ---------------------------------------------------------------------------

def test_balanced_entry_is_accepted(session, entity, scenario, accounts):
    data = _je_data(entity, scenario, accounts, je_number="JE-BAL-001")
    je = post_journal_entry(session, data)

    assert je.id is not None
    assert je.status == "posted"
    assert je.je_number == "JE-BAL-001"


def test_balanced_entry_with_multiple_lines(session, entity, scenario, accounts):
    """Three-line entry: one debit split across two credit accounts."""
    lines = [
        JournalEntryLineCreate(
            line_number=1, account_id=accounts["cash"].id, entity_id=entity.id,
            debit=Decimal("1500.00"), credit=Decimal("0"),
        ),
        JournalEntryLineCreate(
            line_number=2, account_id=accounts["revenue"].id, entity_id=entity.id,
            debit=Decimal("0"), credit=Decimal("1000.00"),
        ),
        JournalEntryLineCreate(
            line_number=3, account_id=accounts["expense"].id, entity_id=entity.id,
            debit=Decimal("0"), credit=Decimal("500.00"),
        ),
    ]
    data = _je_data(entity, scenario, accounts, je_number="JE-BAL-002", lines=lines)
    je = post_journal_entry(session, data)
    assert je.id is not None


# ---------------------------------------------------------------------------
# 2. Unbalanced entries are rejected
# ---------------------------------------------------------------------------

def test_unbalanced_entry_is_rejected(session, entity, scenario, accounts):
    lines = [
        JournalEntryLineCreate(
            line_number=1, account_id=accounts["cash"].id, entity_id=entity.id,
            debit=Decimal("1000.00"), credit=Decimal("0"),
        ),
        JournalEntryLineCreate(
            line_number=2, account_id=accounts["revenue"].id, entity_id=entity.id,
            debit=Decimal("0"), credit=Decimal("999.00"),  # off by 1
        ),
    ]
    data = _je_data(entity, scenario, accounts, je_number="JE-UNBAL-001", lines=lines)
    with pytest.raises(JournalEntryValidationError, match="does not balance"):
        post_journal_entry(session, data)


def test_unbalanced_entry_leaves_no_db_rows(session, entity, scenario, accounts):
    """Failed validation must not persist any rows."""
    lines = [
        JournalEntryLineCreate(
            line_number=1, account_id=accounts["cash"].id, entity_id=entity.id,
            debit=Decimal("500.00"), credit=Decimal("0"),
        ),
        JournalEntryLineCreate(
            line_number=2, account_id=accounts["revenue"].id, entity_id=entity.id,
            debit=Decimal("0"), credit=Decimal("200.00"),
        ),
    ]
    data = _je_data(entity, scenario, accounts, je_number="JE-UNBAL-002", lines=lines)
    with pytest.raises(JournalEntryValidationError):
        post_journal_entry(session, data)

    result = session.query(JournalEntry).filter_by(je_number="JE-UNBAL-002").first()
    assert result is None


# ---------------------------------------------------------------------------
# 3. Journal entry lines save correctly
# ---------------------------------------------------------------------------

def test_lines_are_persisted_with_correct_values(session, entity, scenario, accounts):
    lines = [
        JournalEntryLineCreate(
            line_number=1, account_id=accounts["cash"].id, entity_id=entity.id,
            debit=Decimal("250.50"), credit=Decimal("0"),
            description="Cash receipt",
        ),
        JournalEntryLineCreate(
            line_number=2, account_id=accounts["revenue"].id, entity_id=entity.id,
            debit=Decimal("0"), credit=Decimal("250.50"),
            description="Revenue recognition",
        ),
    ]
    data = _je_data(entity, scenario, accounts, je_number="JE-LINES-001", lines=lines)
    je = post_journal_entry(session, data)

    saved_lines = (
        session.query(JournalEntryLine)
        .filter_by(journal_entry_id=je.id)
        .order_by(JournalEntryLine.line_number)
        .all()
    )
    assert len(saved_lines) == 2

    debit_line = saved_lines[0]
    assert debit_line.debit == Decimal("250.50")
    assert debit_line.credit == Decimal("0")
    assert debit_line.account_id == accounts["cash"].id
    assert debit_line.description == "Cash receipt"

    credit_line = saved_lines[1]
    assert credit_line.debit == Decimal("0")
    assert credit_line.credit == Decimal("250.50")
    assert credit_line.account_id == accounts["revenue"].id


def test_lines_link_to_correct_journal_entry(session, entity, scenario, accounts):
    data = _je_data(entity, scenario, accounts, je_number="JE-LINES-002")
    je = post_journal_entry(session, data)

    lines = session.query(JournalEntryLine).filter_by(journal_entry_id=je.id).all()
    assert all(l.journal_entry_id == je.id for l in lines)


# ---------------------------------------------------------------------------
# 4. Zero-line entries fail
# ---------------------------------------------------------------------------

def test_zero_line_entry_fails(session, entity, scenario, accounts):
    data = _je_data(entity, scenario, accounts, je_number="JE-ZERO-001", lines=[])
    with pytest.raises(JournalEntryValidationError, match="at least 2 lines"):
        post_journal_entry(session, data)


# ---------------------------------------------------------------------------
# 5. Single-line entries fail
# ---------------------------------------------------------------------------

def test_single_line_entry_fails(session, entity, scenario, accounts):
    lines = [
        JournalEntryLineCreate(
            line_number=1, account_id=accounts["cash"].id, entity_id=entity.id,
            debit=Decimal("100.00"), credit=Decimal("0"),
        ),
    ]
    data = _je_data(entity, scenario, accounts, je_number="JE-ONE-001", lines=lines)
    with pytest.raises(JournalEntryValidationError, match="at least 2 lines"):
        post_journal_entry(session, data)


# ---------------------------------------------------------------------------
# 6. Debit + credit on the same line fails
# ---------------------------------------------------------------------------

def test_line_with_both_debit_and_credit_fails(session, entity, scenario, accounts):
    lines = [
        JournalEntryLineCreate(
            line_number=1, account_id=accounts["cash"].id, entity_id=entity.id,
            debit=Decimal("500.00"), credit=Decimal("500.00"),  # both populated
        ),
        JournalEntryLineCreate(
            line_number=2, account_id=accounts["revenue"].id, entity_id=entity.id,
            debit=Decimal("0"), credit=Decimal("0"),
        ),
    ]
    data = _je_data(entity, scenario, accounts, je_number="JE-BOTH-001", lines=lines)
    with pytest.raises(JournalEntryValidationError, match="cannot carry both"):
        post_journal_entry(session, data)


# ---------------------------------------------------------------------------
# get_journal_entry_or_raise
# ---------------------------------------------------------------------------

def test_get_existing_journal_entry(session, entity, scenario, accounts):
    data = _je_data(entity, scenario, accounts, je_number="JE-GET-001")
    je = post_journal_entry(session, data)

    fetched = get_journal_entry_or_raise(session, je.id)
    assert fetched.id == je.id
    assert fetched.je_number == "JE-GET-001"


def test_get_missing_journal_entry_raises(session):
    with pytest.raises(JournalEntryNotFoundError, match="not found"):
        get_journal_entry_or_raise(session, 999999)


def test_duplicate_je_number_is_rejected(session, entity, scenario, accounts):
    """Creating two journal entries with the same JE number should raise a validation error."""
    data1 = _je_data(entity, scenario, accounts, je_number="JE-DUP-001")
    je1 = post_journal_entry(session, data1)
    assert je1 is not None

    data2 = _je_data(entity, scenario, accounts, je_number="JE-DUP-001")
    with pytest.raises(JournalEntryValidationError):
        post_journal_entry(session, data2)
