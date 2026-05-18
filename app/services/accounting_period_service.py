"""
Accounting period service.

Period lifecycle
----------------
  open  ──close_period()──► closed
  closed ──reopen_period()──► open  (placeholder — does not validate)

Closing process
---------------
  1. Validate the period exists and is not already closed.
  2. Optionally generate closing journal entries:
       DR each revenue account for its balance in the period  (zeroes revenue)
       CR each expense account for its balance in the period  (zeroes expenses)
       Net difference → retained earnings account            (books net income)
  3. Lock the period (is_closed = True, closed_at = now()).

After close, post_journal_entry raises ClosedPeriodError for any JE whose
entry_date falls within the closed period.

Note: The closing entry is posted BEFORE the period is locked, so the
close JE itself bypasses the period guard correctly.
"""

import datetime
from dataclasses import dataclass
from decimal import Decimal
from typing import Sequence

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.accounting_period import AccountingPeriod
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.schemas.journal_entry import JournalEntryCreate, JournalEntryLineCreate
from app.services.journal_entry_service import post_journal_entry


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class PeriodNotFoundError(LookupError):
    """Raised when an accounting period does not exist."""


class PeriodAlreadyClosedError(ValueError):
    """Raised when attempting to close an already-closed period."""


class PeriodNotClosedError(ValueError):
    """Raised when attempting to reopen a period that is not closed."""


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def create_period(
    db: Session,
    entity_id: int,
    period_name: str,
    start_date: datetime.date,
    end_date: datetime.date,
    fiscal_year: int,
    fiscal_period: int,
    period_type: str = "monthly",
) -> AccountingPeriod:
    """Create an accounting period in open status."""
    period = AccountingPeriod(
        entity_id=entity_id,
        period_name=period_name,
        start_date=start_date,
        end_date=end_date,
        fiscal_year=fiscal_year,
        fiscal_period=fiscal_period,
        period_type=period_type,
        is_closed=False,
    )
    db.add(period)
    db.flush()
    db.refresh(period)
    return period


def list_periods(
    db: Session,
    entity_id: int,
    fiscal_year: int | None = None,
    period_type: str | None = None,
) -> list[AccountingPeriod]:
    """List accounting periods for an entity, optionally filtered."""
    q = db.query(AccountingPeriod).filter(AccountingPeriod.entity_id == entity_id)
    if fiscal_year is not None:
        q = q.filter(AccountingPeriod.fiscal_year == fiscal_year)
    if period_type is not None:
        q = q.filter(AccountingPeriod.period_type == period_type)
    return q.order_by(AccountingPeriod.start_date).all()


def get_period_or_raise(db: Session, period_id: int) -> AccountingPeriod:
    """Return an AccountingPeriod by id, raising PeriodNotFoundError if absent."""
    period = db.get(AccountingPeriod, period_id)
    if period is None:
        raise PeriodNotFoundError(f"Accounting period id={period_id} not found")
    return period


def get_period_for_date(
    db: Session,
    entity_id: int,
    entry_date: datetime.date,
    period_type: str = "monthly",
) -> AccountingPeriod | None:
    """Return the period (if any) whose date range contains entry_date."""
    return (
        db.query(AccountingPeriod)
        .filter(
            AccountingPeriod.entity_id == entity_id,
            AccountingPeriod.start_date <= entry_date,
            AccountingPeriod.end_date >= entry_date,
            AccountingPeriod.period_type == period_type,
        )
        .first()
    )


# ---------------------------------------------------------------------------
# Close process
# ---------------------------------------------------------------------------

@dataclass
class CloseResult:
    period: AccountingPeriod
    closing_je: JournalEntry | None   # None when generate_closing_entries=False or no IS activity
    net_income: Decimal               # $0 when no closing entries generated


def close_period(
    db: Session,
    period_id: int,
    re_account_id: int,
    scenario_id: int,
    closing_je_number: str,
    closed_by: str | None = None,
    generate_closing_entries: bool = True,
    allow_zero_income: bool = True,
) -> CloseResult:
    """
    Validate and close an accounting period.

    Parameters
    ----------
    re_account_id
        The retained earnings account that receives/absorbs the net income close.
    scenario_id
        Scenario under which IS account activity is queried and the closing JE is posted.
    closing_je_number
        JE number for the generated closing entry (required, must be unique).
    closed_by
        Optional user identifier stamped on the period record.
    generate_closing_entries
        If False, only locks the period without generating closing JEs.
    allow_zero_income
        If False, raises ValueError when the period has zero net IS activity.

    Returns
    -------
    CloseResult with the updated period and (optionally) the closing JE.
    """
    period = get_period_or_raise(db, period_id)

    if period.is_closed:
        raise PeriodAlreadyClosedError(
            f"Period '{period.period_name}' (id={period_id}) is already closed"
        )

    closing_je: JournalEntry | None = None
    net_income = Decimal("0")

    if generate_closing_entries:
        closing_je, net_income = _generate_closing_entry(
            db=db,
            period=period,
            re_account_id=re_account_id,
            scenario_id=scenario_id,
            closing_je_number=closing_je_number,
            closed_by=closed_by,
            allow_zero_income=allow_zero_income,
        )

    # Lock the period AFTER posting closing entries (so the closing JE itself
    # is not blocked by the period guard)
    now = datetime.datetime.now()
    period.is_closed = True
    period.closed_at = now
    period.closed_by = closed_by
    db.flush()
    db.refresh(period)

    return CloseResult(period=period, closing_je=closing_je, net_income=net_income)


def reopen_period(db: Session, period_id: int) -> AccountingPeriod:
    """
    Reopen a closed accounting period (placeholder — hard-close enforcement is future work).

    Warning: reopening does NOT reverse closing entries; those must be reversed separately.
    """
    period = get_period_or_raise(db, period_id)
    if not period.is_closed:
        raise PeriodNotClosedError(
            f"Period '{period.period_name}' (id={period_id}) is not closed"
        )
    period.is_closed = False
    period.closed_at = None
    period.closed_by = None
    db.flush()
    db.refresh(period)
    return period


# ---------------------------------------------------------------------------
# Internal closing-entry generator
# ---------------------------------------------------------------------------

def _get_is_account_balances(
    db: Session,
    entity_id: int,
    scenario_id: int,
    start_date: datetime.date,
    end_date: datetime.date,
) -> list[tuple[Account, Decimal]]:
    """
    Returns (account, net_debit) for every IS account with nonzero activity
    in the period's date range.

    net_debit = SUM(debit − credit)
      positive  → debit position (normal for expense accounts)
      negative  → credit position (normal for revenue accounts)
    """
    rows = (
        db.query(
            Account,
            func.sum(JournalEntryLine.debit - JournalEntryLine.credit).label("net_debit"),
        )
        .join(JournalEntryLine, JournalEntryLine.account_id == Account.id)
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .filter(
            JournalEntryLine.entity_id == entity_id,
            JournalEntry.entry_date >= start_date,
            JournalEntry.entry_date <= end_date,
            JournalEntry.scenario_id == scenario_id,
            JournalEntry.status == "posted",
            Account.account_type.in_(["revenue", "expense"]),
        )
        .group_by(Account.id)
        .all()
    )
    return [(acct, Decimal(str(nd))) for acct, nd in rows if nd is not None and Decimal(str(nd)) != 0]


def _generate_closing_entry(
    db: Session,
    period: AccountingPeriod,
    re_account_id: int,
    scenario_id: int,
    closing_je_number: str,
    closed_by: str | None,
    allow_zero_income: bool,
) -> tuple[JournalEntry | None, Decimal]:
    """
    Build and post the closing journal entry that:
      - Zeroes every IS account's balance for the period
      - Credits/debits the net to the retained earnings account

    Returns (closing_je, net_income). Returns (None, Decimal('0')) when
    there is no IS activity and allow_zero_income is True.
    """
    is_balances = _get_is_account_balances(
        db,
        entity_id=period.entity_id,
        scenario_id=scenario_id,
        start_date=period.start_date,
        end_date=period.end_date,
    )

    # sum(net_debit) for IS accounts; net_income = -sum(net_debit)
    total_is_net_debit = sum(nd for _, nd in is_balances)
    net_income = -total_is_net_debit   # positive = profit, negative = loss

    if not is_balances:
        if not allow_zero_income:
            raise ValueError(
                f"Period '{period.period_name}' has no IS account activity; "
                "set allow_zero_income=True to close anyway"
            )
        return None, Decimal("0")

    # Build closing JE lines
    lines: list[JournalEntryLineCreate] = []
    line_num = 1

    for account, net_debit in is_balances:
        if net_debit < 0:
            # credit balance (revenue) → close with a debit
            debit = -net_debit
            credit = Decimal("0")
        else:
            # debit balance (expense) → close with a credit
            debit = Decimal("0")
            credit = net_debit

        lines.append(JournalEntryLineCreate(
            line_number=line_num,
            account_id=account.id,
            entity_id=period.entity_id,
            debit=debit,
            credit=credit,
        ))
        line_num += 1

    # RE account line — credit for profit, debit for loss
    if net_income >= 0:
        re_debit, re_credit = Decimal("0"), net_income
    else:
        re_debit, re_credit = -net_income, Decimal("0")

    lines.append(JournalEntryLineCreate(
        line_number=line_num,
        account_id=re_account_id,
        entity_id=period.entity_id,
        debit=re_debit,
        credit=re_credit,
    ))

    closing_je = post_journal_entry(db, JournalEntryCreate(
        je_number=closing_je_number,
        entry_date=period.end_date,
        entity_id=period.entity_id,
        scenario_id=scenario_id,
        description=f"Period close: {period.period_name}",
        source="period_close",
        source_ref=str(period.id),
        created_by=closed_by,
        lines=lines,
    ))

    return closing_je, net_income
