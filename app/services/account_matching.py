"""
Account matching engine for import pipeline.
Prevents silent mis-matches; surfaces conflicts for human review.
"""
from dataclasses import dataclass
from enum import Enum

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.account import Account
from app.services.account_parser import ParsedAccount, normalize_account_name

_TYPE_GROUPS = {
    'asset': 'balance_sheet',
    'liability': 'balance_sheet',
    'equity': 'balance_sheet',
    'revenue': 'income_statement',
    'cogs': 'income_statement',
    'expense': 'income_statement',
    'other_income': 'income_statement',
    'other_expense': 'income_statement',
    'tax': 'income_statement',
    'intercompany': 'balance_sheet',
}


class MatchStatus(str, Enum):
    EXACT = "exact"
    NUMBER_ONLY = "number_only"
    NAME_ONLY = "name_only"
    PARENT = "parent"
    CONFLICT = "conflict"
    NO_MATCH = "no_match"


@dataclass
class MatchResult:
    status: MatchStatus
    matched_account: Account | None
    conflict_reason: str | None
    suggested_number: str | None
    confidence: float


def find_best_match(
    parsed: ParsedAccount,
    entity_id: int,
    db: Session,
    account_type_hint: str | None = None,
) -> MatchResult:
    """
    Matching priority:
    1. Exact account number + compatible name → EXACT (confidence 1.0)
    2. Exact account number, name does not conflict in TYPE → NUMBER_ONLY (confidence 0.9)
    3. Account number exists but type conflicts → CONFLICT (confidence 0.0, flag for review)
    4. Exact normalized name match → NAME_ONLY (confidence 0.7)
    5. Parent/subaccount relationship (strip suffix, match parent) → PARENT (confidence 0.6)
    6. No match → NO_MATCH (confidence 0.0)
    """
    num = parsed.account_number
    name = parsed.account_name

    if num:
        acct = (
            db.query(Account)
            .filter(Account.account_number == num, Account.entity_id == entity_id)
            .first()
        )
        if acct:
            if names_are_compatible(acct.account_name, name or ''):
                if not types_conflict(acct.account_type, account_type_hint):
                    return MatchResult(
                        status=MatchStatus.EXACT,
                        matched_account=acct,
                        conflict_reason=None,
                        suggested_number=None,
                        confidence=1.0,
                    )
            # Number found but check type conflict first
            if types_conflict(acct.account_type, account_type_hint):
                reason = (
                    f"Number {num!r} exists as '{acct.account_name}' ({acct.account_type}), "
                    f"proposed type is '{account_type_hint or 'unknown'}'"
                )
                return MatchResult(
                    status=MatchStatus.CONFLICT,
                    matched_account=acct,
                    conflict_reason=reason,
                    suggested_number=None,
                    confidence=0.0,
                )
            # Same type group, name differs — surface for review but not a hard conflict
            return MatchResult(
                status=MatchStatus.NUMBER_ONLY,
                matched_account=acct,
                conflict_reason=None,
                suggested_number=None,
                confidence=0.9,
            )

    if name:
        norm = normalize_account_name(name)
        acct = (
            db.query(Account)
            .filter(
                func.lower(func.trim(Account.account_name)) == norm,
                Account.entity_id == entity_id,
            )
            .first()
        )
        if acct:
            return MatchResult(
                status=MatchStatus.NAME_ONLY,
                matched_account=acct,
                conflict_reason=None,
                suggested_number=None,
                confidence=0.7,
            )

    # Parent match: strip subaccount suffix and look for parent
    if num:
        parent_num = _get_parent_number(num)
        if parent_num:
            parent = (
                db.query(Account)
                .filter(Account.account_number == parent_num, Account.entity_id == entity_id)
                .first()
            )
            if parent:
                return MatchResult(
                    status=MatchStatus.PARENT,
                    matched_account=parent,
                    conflict_reason=None,
                    suggested_number=parent_num,
                    confidence=0.6,
                )

    return MatchResult(
        status=MatchStatus.NO_MATCH,
        matched_account=None,
        conflict_reason=None,
        suggested_number=None,
        confidence=0.0,
    )


def _get_parent_number(account_number: str) -> str | None:
    for sep in ('-', ':', '.'):
        if sep in account_number:
            parts = account_number.split(sep)
            if parts[0].isdigit():
                return parts[0]
    if account_number.isdigit() and len(account_number) > 4:
        return account_number[:4]
    return None


def names_are_compatible(existing_name: str, proposed_name: str) -> bool:
    """
    Returns True if the two names are similar enough to not be a conflict.
    Uses normalized comparison with substring matching.
    """
    if not proposed_name:
        return True
    if not existing_name:
        return True
    e = normalize_account_name(existing_name)
    p = normalize_account_name(proposed_name)
    if e == p:
        return True
    if len(p) >= 4 and (p in e or e in p):
        return True
    return False


def types_conflict(existing_type: str, proposed_type: str | None) -> bool:
    """
    Returns True if account types are fundamentally incompatible:
    e.g., existing='revenue', proposed='asset' → conflict
    Same type or blank proposed → not a conflict
    """
    if not proposed_type:
        return False
    e_group = _TYPE_GROUPS.get(existing_type.lower(), existing_type.lower())
    p_group = _TYPE_GROUPS.get(proposed_type.lower(), proposed_type.lower())
    return e_group != p_group
