import datetime
from dataclasses import dataclass
from decimal import Decimal
from typing import Sequence

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine


@dataclass
class TrialBalanceRow:
    account_id: int
    account_number: str
    account_name: str
    account_type: str
    normal_balance: str
    total_debit: Decimal   # raw sum of all debit postings
    total_credit: Decimal  # raw sum of all credit postings
    net_debit: Decimal     # total_debit - total_credit; positive = net debit position
    signed_balance: Decimal  # balance in the account's natural direction (always positive when normal)


def get_account_balance(
    db: Session,
    account_id: int,
    entity_id: int,
    as_of_date: datetime.date,
    scenario_ids: Sequence[int],
) -> Decimal:
    """
    Returns SUM(debit - credit) for all posted lines on or before as_of_date.

    Positive  → net debit position  (normal for assets / expenses)
    Negative  → net credit position (normal for liabilities / equity / revenue)
    """
    raw = (
        db.query(func.sum(JournalEntryLine.debit - JournalEntryLine.credit))
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .filter(
            JournalEntryLine.account_id == account_id,
            JournalEntryLine.entity_id == entity_id,
            JournalEntry.entry_date <= as_of_date,
            JournalEntry.scenario_id.in_(scenario_ids),
            JournalEntry.status == "posted",
        )
        .scalar()
    )
    return Decimal(str(raw)) if raw is not None else Decimal("0")


def get_trial_balance(
    db: Session,
    entity_id: int,
    as_of_date: datetime.date,
    scenario_ids: Sequence[int],
) -> list[TrialBalanceRow]:
    """
    Returns one TrialBalanceRow per account that has posted activity through as_of_date.
    Rows are sorted by account_number.
    """
    rows = (
        db.query(
            Account,
            func.coalesce(func.sum(JournalEntryLine.debit), 0).label("total_debit"),
            func.coalesce(func.sum(JournalEntryLine.credit), 0).label("total_credit"),
        )
        .join(JournalEntryLine, JournalEntryLine.account_id == Account.id)
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .filter(
            JournalEntryLine.entity_id == entity_id,
            JournalEntry.entry_date <= as_of_date,
            JournalEntry.scenario_id.in_(scenario_ids),
            JournalEntry.status == "posted",
        )
        .group_by(Account.id)
        .order_by(Account.account_number)
        .all()
    )

    result: list[TrialBalanceRow] = []
    for account, total_debit, total_credit in rows:
        d = Decimal(str(total_debit))
        c = Decimal(str(total_credit))
        net_debit = d - c
        signed_balance = net_debit if account.normal_balance == "debit" else -net_debit
        result.append(TrialBalanceRow(
            account_id=account.id,
            account_number=account.account_number,
            account_name=account.account_name,
            account_type=account.account_type,
            normal_balance=account.normal_balance,
            total_debit=d,
            total_credit=c,
            net_debit=net_debit,
            signed_balance=signed_balance,
        ))
    return result


def summarize_by_account_type(
    trial_balance: list[TrialBalanceRow],
) -> dict[str, Decimal]:
    """
    Aggregates signed_balance by account_type.
    Pure function — no DB access.
    Example: {"asset": Decimal("50000"), "revenue": Decimal("100000"), ...}
    """
    totals: dict[str, Decimal] = {}
    for row in trial_balance:
        totals[row.account_type] = totals.get(row.account_type, Decimal("0")) + row.signed_balance
    return totals
