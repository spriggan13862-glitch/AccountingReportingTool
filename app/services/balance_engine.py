"""
Single source of truth for balance sign convention and bridge computation helpers.

Rules:
  debit-normal  (asset, expense):          signed = debit - credit
  credit-normal (liability, equity, revenue): signed = -(debit - credit)

All bridge balance calculations import from here.
"""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

# JE sources that represent "As Reported" / book balances imported from the client GL.
# These are excluded from the AJE columns and form the baseline balance.
IMPORT_SOURCES: frozenset[str] = frozenset(
    {"tb_import", "pdf_import", "opening_balance", "import", "system"}
)

ACCOUNT_TYPE_SECTION: dict[str, str] = {
    "asset": "Assets",
    "liability": "Liabilities",
    "equity": "Equity",
    "revenue": "Revenue",
    "expense": "Expenses",
}

SECTION_ORDER: dict[str, int] = {
    "Assets": 0,
    "Liabilities": 1,
    "Equity": 2,
    "Revenue": 3,
    "Expenses": 4,
}


def net_debit(debit: Decimal | None, credit: Decimal | None) -> Decimal:
    """Raw net-debit: positive = debit-heavy, negative = credit-heavy."""
    return (debit or Decimal("0")) - (credit or Decimal("0"))


def signed_balance(
    debit: Decimal | None,
    credit: Decimal | None,
    normal_balance: str,
) -> Decimal:
    """
    Signed balance respecting the account's normal-balance convention.

    For debit-normal accounts (asset/expense):  positive = balance exists.
    For credit-normal accounts (liability/equity/revenue): positive = balance exists.
    """
    nd = net_debit(debit, credit)
    return nd if normal_balance == "debit" else -nd


def bulk_balances_from_jes(
    db: Session,
    entity_id: int,
    as_of_date: object,  # datetime.date
    scenario_ids: list[int],
    source_filter: frozenset[str] | None = None,
    exclude_sources: frozenset[str] | None = None,
    include_draft: bool = False,
) -> dict[int, Decimal]:
    """
    Returns a dict of {account_id: net_debit_balance} for all accounts
    matching the given filters.

    source_filter:    if set, only JEs whose source is in this set.
    exclude_sources:  if set, exclude JEs whose source is in this set.
    include_draft:    also include draft JEs (for pro-forma basis).
    """
    from app.models.journal_entry import JournalEntry
    from app.models.journal_entry_line import JournalEntryLine

    statuses = ["posted"]
    if include_draft:
        statuses.append("draft")

    filters = [
        JournalEntryLine.entity_id == entity_id,
        JournalEntry.entry_date <= as_of_date,
        JournalEntry.scenario_id.in_(scenario_ids),
        JournalEntry.status.in_(statuses),
    ]
    if source_filter is not None:
        filters.append(JournalEntry.source.in_(list(source_filter)))
    if exclude_sources is not None:
        filters.append(JournalEntry.source.notin_(list(exclude_sources)))

    rows = (
        db.query(
            JournalEntryLine.account_id,
            func.sum(JournalEntryLine.debit - JournalEntryLine.credit).label("net"),
        )
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .filter(*filters)
        .group_by(JournalEntryLine.account_id)
        .all()
    )
    return {r.account_id: Decimal(str(r.net)) for r in rows}


def bulk_aje_impacts(
    db: Session,
    entity_id: int,
    as_of_date: object,
    scenario_ids: list[int],
    je_ids: list[int],
) -> dict[int, dict[int, Decimal]]:
    """
    Returns {account_id: {je_id: net_debit_impact}} for the given JE IDs.
    Only accounts actually touched by those JEs appear in the result.
    """
    from app.models.journal_entry_line import JournalEntryLine

    if not je_ids:
        return {}

    rows = (
        db.query(
            JournalEntryLine.account_id,
            JournalEntryLine.journal_entry_id,
            func.sum(JournalEntryLine.debit - JournalEntryLine.credit).label("net"),
        )
        .filter(
            JournalEntryLine.entity_id == entity_id,
            JournalEntryLine.journal_entry_id.in_(je_ids),
        )
        .group_by(JournalEntryLine.account_id, JournalEntryLine.journal_entry_id)
        .all()
    )

    result: dict[int, dict[int, Decimal]] = {}
    for r in rows:
        if r.account_id not in result:
            result[r.account_id] = {}
        result[r.account_id][r.journal_entry_id] = Decimal(str(r.net))
    return result
