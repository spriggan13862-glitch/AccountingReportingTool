"""
Single source of truth for accounting balance computation and presentation.

Two views:
- Accounting Working View (AWV): signs as they exist in the double-entry ledger
- Financial Statement Presentation (FSP): signs flipped for human-readable statements

Rules:
  debit-normal  (asset, expense):          signed = debit - credit
  credit-normal (liability, equity, revenue): signed = -(debit - credit)

All bridge balance calculations import from here.
"""
from __future__ import annotations

from decimal import Decimal
from enum import Enum

from sqlalchemy import func
from sqlalchemy.orm import Session


# ---------------------------------------------------------------------------
# Balance View enum
# ---------------------------------------------------------------------------

class BalanceView(str, Enum):
    ACCOUNTING = "accounting"       # debit-normal signs
    PRESENTATION = "presentation"   # revenue shown positive


# ---------------------------------------------------------------------------
# Account type → normal balance mapping
# ---------------------------------------------------------------------------

ACCOUNT_TYPE_NORMAL_BALANCE: dict[str, str] = {
    'asset': 'debit',
    'expense': 'debit',
    'cogs': 'debit',
    'other_expense': 'debit',
    'contra_revenue': 'debit',
    'contra_equity': 'debit',
    'liability': 'credit',
    'equity': 'credit',
    'revenue': 'credit',
    'other_income': 'credit',
    'contra_asset': 'credit',
    # legacy / extended types
    'tax': 'debit',
    'intercompany': 'debit',
}

# Account types whose accounting balance is flipped for FSP display.
# Revenue accounting_balance is positive (credit - debit).
# In AWV we display credit-normal accounts as negative in the debit-dominant view.
# In FSP they are displayed as positive (no flip from accounting_balance needed).
# Flip is only required for AWV display of credit-normal accounts.
_FLIP_FOR_AWV = frozenset({'revenue', 'other_income', 'liability', 'equity',
                            'contra_asset', 'contra_equity'})


def get_normal_balance(account_type: str) -> str:
    """Returns 'debit' or 'credit' for the given account type."""
    return ACCOUNT_TYPE_NORMAL_BALANCE.get(account_type.lower(), 'debit')


def get_accounting_signed_balance(
    account_type: str,
    debit: float | Decimal,
    credit: float | Decimal,
) -> float:
    """
    Returns the net balance with accounting sign convention:
    - Debit-normal accounts (asset, expense, cogs): return debit - credit (positive = balance)
    - Credit-normal accounts (liability, equity, revenue): return credit - debit (positive = balance)

    Examples:
    - Asset account: debit=1000, credit=200 → 800 (positive = asset exists)
    - Revenue account: debit=0, credit=5000 → 5000 (positive = revenue earned)
    - Expense account: debit=3000, credit=0 → 3000 (positive = expense incurred)
    """
    d = float(debit)
    c = float(credit)
    normal = get_normal_balance(account_type)
    return (d - c) if normal == 'debit' else (c - d)


def get_presentation_amount(
    account_type: str,
    accounting_balance: float | Decimal,
    sign_behavior: str | None = None,
) -> float:
    """
    Convert accounting signed balance to financial statement presentation amount.

    The accounting_balance for credit-normal accounts is already positive when
    the account has a normal credit position (revenue credit=5000 → balance=5000).
    In FSP, revenue is also shown positive, so NO flip is needed.

    The AWV display is what flips credit-normal accounts negative.

    sign_behavior overrides:
    - 'negative' or 'contra': flip the sign
    - 'positive': no flip
    """
    bal = float(accounting_balance)
    if sign_behavior in ('negative', 'contra'):
        return -bal
    if sign_behavior == 'positive':
        return bal
    # Default: presentation amount matches accounting balance for all types.
    # Revenue, equity, liability are already positive when in normal position.
    return bal


def get_awv_display_amount(
    account_type: str,
    accounting_balance: float | Decimal,
) -> float:
    """
    Return the amount for Accounting Working View display.

    In AWV, we are in a debit-dominant world. Credit-normal accounts
    (revenue, liability, equity) show as NEGATIVE because they carry
    credit balances. This makes the trial balance columns work as
    "debit side of the ledger".

    Examples:
    - Asset accounting_balance=800 → AWV: +800
    - Revenue accounting_balance=5000 → AWV: -5000 (credit balance in debit world)
    - Expense accounting_balance=3000 → AWV: +3000
    """
    bal = float(accounting_balance)
    if account_type.lower() in _FLIP_FOR_AWV:
        return -bal
    return bal


def compute_net_income(
    revenue_balance: float | Decimal,
    cogs_balance: float | Decimal,
    expense_balance: float | Decimal,
) -> float:
    """
    Net Income in presentation terms:
    Revenue (accounting_balance positive) - COGS - Expenses
    """
    return float(revenue_balance) - float(cogs_balance) - float(expense_balance)


def format_accounting_view_amount(
    amount: float | Decimal,
    account_type: str,
) -> dict:
    """
    Returns display metadata for accounting working view.
    """
    val = float(amount)
    is_normal = val >= 0
    return {
        'amount': val,
        'display_sign': '+' if val >= 0 else '-',
        'is_normal': is_normal,
        'color_hint': 'positive' if (is_normal and val != 0) else ('negative' if not is_normal else 'neutral'),
    }

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
