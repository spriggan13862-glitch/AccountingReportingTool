"""
Centralized accounting sign convention engine.

Applied to: import balances, trial balance, bridge, financial statements.

Sign convention (accounting view):
- Debit-normal accounts (asset, expense): positive = debit > credit
- Credit-normal accounts (liability, equity, revenue): positive = credit > debit

Financial statement presentation (all line items positive):
- Revenue: credit balance shown as positive → negate accounting balance
- Expense: debit balance shown as positive → keep accounting balance
- Asset: debit balance shown as positive → keep accounting balance
- Liability/Equity: credit balance shown as positive → negate accounting balance
"""

from decimal import Decimal

_DEBIT_NORMAL = frozenset(("asset", "expense"))
_CREDIT_NORMAL = frozenset(("liability", "equity", "revenue"))


def get_normal_balance(account_type: str) -> str:
    """Return 'debit' or 'credit' for the given account_type."""
    return "debit" if account_type in _DEBIT_NORMAL else "credit"


def get_accounting_signed_balance(
    normal_balance: str, debit: Decimal, credit: Decimal
) -> Decimal:
    """
    Accounting balance with proper sign for the normal_balance convention.
    Debit-normal: debit - credit (positive when debit > credit).
    Credit-normal: credit - debit (positive when credit > debit).
    """
    if normal_balance == "debit":
        return debit - credit
    return credit - debit


def get_fs_presentation_amount(account_type: str, accounting_balance: Decimal) -> Decimal:
    """
    Financial statement presentation amount.
    Credit-normal accounts are negated so a normal credit balance shows as positive.
    """
    if account_type in _CREDIT_NORMAL:
        return -accounting_balance
    return accounting_balance
