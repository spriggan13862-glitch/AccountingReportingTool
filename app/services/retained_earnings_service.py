"""
Retained earnings service.

Key accounting identity
-----------------------
  Retained Earnings (BS) = RE account cumulative balance
                         + Current fiscal-year net income (IS accounts, not yet closed)

After a period close the closing entry zeroes out IS accounts and credits the net
to the RE account, so the second term becomes zero for a fully-closed fiscal year.

Net income definition
---------------------
  Net income = Revenue earned - Expenses incurred
             = Σ(credit − debit) for revenue accounts
             + Σ(credit − debit) for expense accounts  (negative when expense > revenue)
             = Σ(credit − debit) for ALL IS accounts in the date range

This equals −Σ(net_debit) for IS accounts, consistent with the trial balance convention
where net_debit = debit − credit (positive = debit position).
"""

import datetime
from dataclasses import dataclass
from decimal import Decimal
from typing import Sequence

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.services.comparative_service import ScenarioStack


# ---------------------------------------------------------------------------
# Net income
# ---------------------------------------------------------------------------

def get_net_income(
    db: Session,
    entity_id: int,
    scenario_ids: Sequence[int],
    start_date: datetime.date,
    end_date: datetime.date,
) -> Decimal:
    """
    Net income for a date range (start_date..end_date inclusive), posted JEs only.

    Positive  → profitable period
    Negative  → loss period
    Zero      → breakeven (or no IS activity)
    """
    raw = (
        db.query(func.sum(JournalEntryLine.credit - JournalEntryLine.debit))
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .join(Account, JournalEntryLine.account_id == Account.id)
        .filter(
            JournalEntryLine.entity_id == entity_id,
            JournalEntry.entry_date >= start_date,
            JournalEntry.entry_date <= end_date,
            JournalEntry.scenario_id.in_(scenario_ids),
            JournalEntry.status == "posted",
            Account.account_type.in_(["revenue", "expense"]),
        )
        .scalar()
    )
    return Decimal(str(raw)) if raw is not None else Decimal("0")


# ---------------------------------------------------------------------------
# RE account balance
# ---------------------------------------------------------------------------

def get_re_account_balance(
    db: Session,
    entity_id: int,
    scenario_ids: Sequence[int],
    as_of_date: datetime.date,
    re_account_id: int,
) -> Decimal:
    """
    Cumulative credit balance on the retained earnings account through as_of_date.

    Positive  → credit position (accumulated earnings)
    Negative  → debit position (accumulated deficit)
    """
    raw = (
        db.query(func.sum(JournalEntryLine.credit - JournalEntryLine.debit))
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .filter(
            JournalEntryLine.account_id == re_account_id,
            JournalEntryLine.entity_id == entity_id,
            JournalEntry.entry_date <= as_of_date,
            JournalEntry.scenario_id.in_(scenario_ids),
            JournalEntry.status == "posted",
        )
        .scalar()
    )
    return Decimal(str(raw)) if raw is not None else Decimal("0")


# ---------------------------------------------------------------------------
# Full RE balance for BS presentation
# ---------------------------------------------------------------------------

def get_retained_earnings_balance(
    db: Session,
    entity_id: int,
    scenario_ids: Sequence[int],
    as_of_date: datetime.date,
    re_account_id: int,
    fiscal_year_start: datetime.date | None = None,
) -> Decimal:
    """
    Full retained earnings balance for balance-sheet presentation.

    = RE account cumulative credit balance through as_of_date
    + current fiscal-year net income (IS accounts, fiscal_year_start..as_of_date)

    After period close the closing entry zeroes IS accounts and credits RE,
    so the second term naturally becomes zero without any special-casing.

    fiscal_year_start defaults to January 1 of as_of_date's year.
    """
    if fiscal_year_start is None:
        fiscal_year_start = datetime.date(as_of_date.year, 1, 1)

    re_balance = get_re_account_balance(db, entity_id, scenario_ids, as_of_date, re_account_id)
    ytd_ni = get_net_income(db, entity_id, scenario_ids, fiscal_year_start, as_of_date)
    return re_balance + ytd_ni


# ---------------------------------------------------------------------------
# Comparative retained earnings
# ---------------------------------------------------------------------------

@dataclass
class RetainedEarningsRow:
    entity_id: int
    re_account_id: int
    columns: dict[str, Decimal]   # label → RE balance


def get_comparative_retained_earnings(
    db: Session,
    entity_id: int,
    re_account_id: int,
    stacks: list[ScenarioStack],
) -> RetainedEarningsRow:
    """
    Compute retained earnings balance for each scenario stack (column).

    Returns a RetainedEarningsRow with one entry per stack label.
    """
    columns: dict[str, Decimal] = {}
    for stack in stacks:
        columns[stack.label] = get_retained_earnings_balance(
            db,
            entity_id=entity_id,
            scenario_ids=stack.scenario_ids,
            as_of_date=stack.as_of_date,
            re_account_id=re_account_id,
        )
    return RetainedEarningsRow(
        entity_id=entity_id,
        re_account_id=re_account_id,
        columns=columns,
    )


# ---------------------------------------------------------------------------
# Consolidated retained earnings
# ---------------------------------------------------------------------------

def get_consolidated_retained_earnings(
    db: Session,
    entity_re_pairs: list[tuple[int, int]],   # [(entity_id, re_account_id), ...]
    scenario_ids: Sequence[int],
    as_of_date: datetime.date,
    fiscal_year_start: datetime.date | None = None,
) -> Decimal:
    """
    Sum retained earnings across multiple entities.

    entity_re_pairs maps each entity to its retained earnings account.
    Returns the consolidated retained earnings balance.
    """
    total = Decimal("0")
    for entity_id, re_account_id in entity_re_pairs:
        total += get_retained_earnings_balance(
            db,
            entity_id=entity_id,
            scenario_ids=scenario_ids,
            as_of_date=as_of_date,
            re_account_id=re_account_id,
            fiscal_year_start=fiscal_year_start,
        )
    return total
