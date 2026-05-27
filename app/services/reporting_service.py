import datetime
from dataclasses import dataclass
from decimal import Decimal
from typing import Sequence

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.models.scenario import Scenario


def _resolve_scenario_ids(db: Session, entity_id: int, scenario_ids: Sequence[int]) -> list[int]:
    """If scenario_ids is empty, return all active scenario IDs (scenarios are org-wide).
    An empty list causes IN () → always false in SQL, returning no rows.
    """
    if scenario_ids:
        return list(scenario_ids)
    all_ids = [r[0] for r in db.query(Scenario.id).filter(Scenario.active == True).all()]  # noqa: E712
    return all_ids or [-1]  # -1 is a sentinel that matches nothing (no scenarios exist)


@dataclass
class TrialBalanceRow:
    account_id: int
    account_number: str
    account_name: str
    account_type: str
    normal_balance: str
    total_debit: Decimal
    total_credit: Decimal
    net_debit: Decimal
    signed_balance: Decimal
    beginning_balance: Decimal = Decimal("0")  # signed balance before from_date
    period_debit: Decimal = Decimal("0")       # debits in [from_date, as_of_date]
    period_credit: Decimal = Decimal("0")      # credits in [from_date, as_of_date]
    ending_balance: Decimal = Decimal("0")     # signed balance at as_of_date


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
    resolved_ids = _resolve_scenario_ids(db, entity_id, scenario_ids)
    raw = (
        db.query(func.sum(JournalEntryLine.debit - JournalEntryLine.credit))
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .filter(
            JournalEntryLine.account_id == account_id,
            JournalEntryLine.entity_id == entity_id,
            JournalEntry.entry_date <= as_of_date,
            JournalEntry.scenario_id.in_(resolved_ids),
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
    from_date: datetime.date | None = None,
) -> list[TrialBalanceRow]:
    """
    Returns one TrialBalanceRow per account with posted activity through as_of_date.

    When from_date is provided (period mode), also computes:
      - beginning_balance: signed balance before from_date
      - period_debit / period_credit: activity in [from_date, as_of_date]
      - ending_balance: signed balance at as_of_date
    """
    resolved_ids = _resolve_scenario_ids(db, entity_id, scenario_ids)

    base_filter = [
        JournalEntryLine.entity_id == entity_id,
        JournalEntry.entry_date <= as_of_date,
        JournalEntry.scenario_id.in_(resolved_ids),
        JournalEntry.status == "posted",
    ]

    rows = (
        db.query(
            Account,
            func.coalesce(func.sum(JournalEntryLine.debit), 0).label("total_debit"),
            func.coalesce(func.sum(JournalEntryLine.credit), 0).label("total_credit"),
        )
        .join(JournalEntryLine, JournalEntryLine.account_id == Account.id)
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .filter(*base_filter)
        .group_by(Account.id)
        .order_by(Account.account_number)
        .all()
    )

    # Pre-compute prior-period and period-only activity when from_date given
    prior_by_account: dict[int, tuple[Decimal, Decimal]] = {}
    period_by_account: dict[int, tuple[Decimal, Decimal]] = {}
    if from_date is not None:
        prior_rows = (
            db.query(
                JournalEntryLine.account_id,
                func.coalesce(func.sum(JournalEntryLine.debit), 0),
                func.coalesce(func.sum(JournalEntryLine.credit), 0),
            )
            .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
            .filter(
                JournalEntryLine.entity_id == entity_id,
                JournalEntry.entry_date < from_date,
                JournalEntry.scenario_id.in_(resolved_ids),
                JournalEntry.status == "posted",
            )
            .group_by(JournalEntryLine.account_id)
            .all()
        )
        for acct_id, pd, pc in prior_rows:
            prior_by_account[acct_id] = (Decimal(str(pd)), Decimal(str(pc)))

        period_rows = (
            db.query(
                JournalEntryLine.account_id,
                func.coalesce(func.sum(JournalEntryLine.debit), 0),
                func.coalesce(func.sum(JournalEntryLine.credit), 0),
            )
            .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
            .filter(
                JournalEntryLine.entity_id == entity_id,
                JournalEntry.entry_date >= from_date,
                JournalEntry.entry_date <= as_of_date,
                JournalEntry.scenario_id.in_(resolved_ids),
                JournalEntry.status == "posted",
            )
            .group_by(JournalEntryLine.account_id)
            .all()
        )
        for acct_id, pd, pc in period_rows:
            period_by_account[acct_id] = (Decimal(str(pd)), Decimal(str(pc)))

    result: list[TrialBalanceRow] = []
    for account, total_debit, total_credit in rows:
        d = Decimal(str(total_debit))
        c = Decimal(str(total_credit))
        net_debit = d - c
        signed_balance = net_debit if account.normal_balance == "debit" else -net_debit

        if from_date is not None:
            pr_d, pr_c = prior_by_account.get(account.id, (Decimal("0"), Decimal("0")))
            pe_d, pe_c = period_by_account.get(account.id, (Decimal("0"), Decimal("0")))
            pr_net = pr_d - pr_c
            beg_balance = pr_net if account.normal_balance == "debit" else -pr_net
            end_balance = signed_balance
        else:
            beg_balance = Decimal("0")
            pe_d = d
            pe_c = c
            end_balance = signed_balance

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
            beginning_balance=beg_balance,
            period_debit=pe_d,
            period_credit=pe_c,
            ending_balance=end_balance,
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
