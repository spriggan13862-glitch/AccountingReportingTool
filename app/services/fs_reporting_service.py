"""
Financial statement reporting service.

Builds FS output by:
  1. Loading effective account→FS-line mappings for the entity and date
  2. Pulling net_debit balances from the trial balance
  3. Summing account balances into each FS line item's own_balance
  4. Rolling up parent→child hierarchies into total_balance
  5. Applying sign_flip for display (e.g. revenue shows as positive on the IS)

Balance semantics (consistent with reporting_service):
  net_debit  = SUM(debit - credit)  — positive = debit position
  display_balance = -total_balance if sign_flip else total_balance
"""

import datetime
from dataclasses import dataclass
from decimal import Decimal
from typing import Sequence

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.account_mapping import AccountMapping
from app.models.fs_line_item import FsLineItem
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.services.reporting_service import TrialBalanceRow, get_trial_balance
from app.services.validation import ValidationResult


# ---------------------------------------------------------------------------
# Output type
# ---------------------------------------------------------------------------

@dataclass
class FsLineBalance:
    line_id: int
    code: str
    name: str
    statement: str          # 'BS', 'IS', 'CF'
    section: str | None
    sort_order: int
    parent_line_id: int | None
    is_subtotal: bool
    sign_flip: bool
    own_balance: Decimal    # net_debit from accounts mapped directly to this line
    total_balance: Decimal  # own_balance + recursive sum of children's total_balance
    display_balance: Decimal  # total_balance, sign-flipped when sign_flip=True


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_fs_statement(
    db: Session,
    entity_id: int,
    as_of_date: datetime.date,
    scenario_ids: Sequence[int],
    statement: str | None = None,
    re_account_id: int | None = None,
    fiscal_year_start: datetime.date | None = None,
    source_filter: Sequence[str] | None = None,
) -> list[FsLineBalance]:
    """
    Returns FS line balances sorted by sort_order.

    Parameters
    ----------
    statement : 'BS', 'IS', 'CF', or None for all statements.
    re_account_id
        When provided, the FS line mapped to this account receives an
        additional adjustment for current-fiscal-year net income (IS accounts
        not yet closed to RE).  This ensures the BS retained-earnings line
        reflects open-period earnings before formal close.
    fiscal_year_start
        Start of the current fiscal year for the YTD net-income calculation.
        Defaults to January 1 of as_of_date's year.
    source_filter
        When provided, restrict to JEs whose source is in the list.
        e.g. ['tb_import','pdf_import','opening_balance'] for As Reported view.
    """
    tb_rows = get_trial_balance(db, entity_id, as_of_date, scenario_ids, source_filter=source_filter)
    return build_fs_from_tb_rows(
        db,
        tb_by_account_id={r.account_id: r for r in tb_rows},
        mapping_entity_id=entity_id,
        as_of_date=as_of_date,
        statement=statement,
        re_account_id=re_account_id,
        fiscal_year_start=fiscal_year_start,
        re_entity_id=entity_id,
        re_scenario_ids=list(scenario_ids),
    )


def build_fs_from_tb_rows(
    db: Session,
    tb_by_account_id: dict[int, TrialBalanceRow],
    mapping_entity_id: int,
    as_of_date: datetime.date,
    statement: str | None = None,
    re_account_id: int | None = None,
    fiscal_year_start: datetime.date | None = None,
    re_entity_id: int | None = None,
    re_scenario_ids: list[int] | None = None,
) -> list[FsLineBalance]:
    """
    Build FS output from a pre-computed {account_id: TrialBalanceRow} dict.

    Used by consolidation_service to feed a consolidated trial balance directly
    into the FS aggregation/rollup pipeline without re-querying the ledger.

    mapping_entity_id controls which entity's account mappings are used
    (entity-specific first, then global).

    When re_account_id is provided (along with re_entity_id and re_scenario_ids),
    the FS line mapped to the RE account is adjusted by current-fiscal-year IS
    net_debit, which incorporates open-period earnings into the BS RE line.
    """
    mappings = _effective_mappings(db, mapping_entity_id, as_of_date)
    lines_by_id = _fetch_fs_lines(db, statement)

    own: dict[int, Decimal] = {lid: Decimal("0") for lid in lines_by_id}
    for account_id, line_id in mappings.items():
        if line_id in own and account_id in tb_by_account_id:
            own[line_id] += tb_by_account_id[account_id].net_debit

    # Retained earnings adjustment: add current fiscal-year IS net_debit to the
    # FS line mapped to the RE account.  This ensures open-period earnings are
    # reflected in the BS before a formal close entry moves them to the RE ledger.
    if re_account_id is not None and re_entity_id is not None and re_scenario_ids is not None:
        re_line_id = mappings.get(re_account_id)
        if re_line_id is not None and re_line_id in own:
            fy_start = fiscal_year_start or datetime.date(as_of_date.year, 1, 1)
            ytd_is_net_debit = _ytd_is_net_debit(
                db, re_entity_id, re_scenario_ids, fy_start, as_of_date
            )
            own[re_line_id] += ytd_is_net_debit

    totals = _rollup(own, lines_by_id)

    result: list[FsLineBalance] = []
    for line in sorted(lines_by_id.values(), key=lambda l: (l.sort_order, l.id)):
        total = totals[line.id]
        result.append(FsLineBalance(
            line_id=line.id,
            code=line.code,
            name=line.name,
            statement=line.statement,
            section=line.section,
            sort_order=line.sort_order,
            parent_line_id=line.parent_line_id,
            is_subtotal=line.is_subtotal,
            sign_flip=line.sign_flip,
            own_balance=own[line.id],
            total_balance=total,
            display_balance=(-total if line.sign_flip else total),
        ))
    return result


def validate_fs_mappings(
    db: Session,
    entity_id: int,
    as_of_date: datetime.date,
    scenario_ids: Sequence[int],
    source_filter: Sequence[str] | None = None,
) -> ValidationResult:
    """
    Returns a ValidationResult with WARNING issues for every account that has
    a non-zero net balance but no effective FS line mapping on as_of_date.
    These accounts are silently excluded from FS output and should be mapped.
    """
    result = ValidationResult()
    for row in find_unmapped_accounts(db, entity_id, as_of_date, scenario_ids, source_filter=source_filter):
        if row.net_debit != Decimal("0"):
            result.warning(
                code="FS_UNMAPPED_BALANCE",
                message=(
                    f"Account {row.account_number} ({row.account_name}) "
                    f"has a balance of {row.net_debit} but no FS line mapping"
                ),
                source_type="account_mapping",
                source_id=row.account_id,
                field_name="fs_line_item_id",
                suggested_resolution=(
                    f"Add an AccountMapping for account {row.account_number} "
                    f"to include it in financial statement output."
                ),
            )
    return result


def find_unmapped_accounts(
    db: Session,
    entity_id: int,
    as_of_date: datetime.date,
    scenario_ids: Sequence[int],
    source_filter: Sequence[str] | None = None,
) -> list[TrialBalanceRow]:
    """
    Returns trial balance rows for accounts that have posted activity through
    as_of_date but carry no effective FS line mapping on that date.
    """
    tb_rows = get_trial_balance(db, entity_id, as_of_date, scenario_ids, source_filter=source_filter)
    mapped_account_ids = set(_effective_mappings(db, entity_id, as_of_date).keys())
    return [r for r in tb_rows if r.account_id not in mapped_account_ids]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _effective_mappings(
    db: Session,
    entity_id: int,
    as_of_date: datetime.date,
) -> dict[int, int]:
    """
    Returns {account_id: fs_line_item_id} for all effective mappings.

    Effective = effective_from <= as_of_date <= effective_to
                AND (entity_id matches OR entity_id IS NULL / global)

    Entity-specific mappings take precedence over global ones.
    """
    rows = (
        db.query(AccountMapping)
        .filter(
            or_(
                AccountMapping.entity_id == entity_id,
                AccountMapping.entity_id.is_(None),
            ),
            AccountMapping.effective_from <= as_of_date,
            AccountMapping.effective_to >= as_of_date,
        )
        .all()
    )

    result: dict[int, int] = {}
    for m in rows:
        acct = m.account_id
        # entity-specific (non-NULL) beats global (NULL)
        if acct not in result or m.entity_id is not None:
            result[acct] = m.fs_line_item_id
    return result


def _fetch_fs_lines(
    db: Session,
    statement: str | None,
) -> dict[int, FsLineItem]:
    q = db.query(FsLineItem)
    if statement is not None:
        q = q.filter(FsLineItem.statement == statement)
    return {line.id: line for line in q.all()}


def _rollup(
    own: dict[int, Decimal],
    lines_by_id: dict[int, FsLineItem],
) -> dict[int, Decimal]:
    """
    Computes total_balance[line_id] = own_balance + SUM(total_balance[child]).
    Handles arbitrary depth; guards against circular references.
    """
    # Build children index restricted to lines in our set
    children: dict[int, list[int]] = {lid: [] for lid in lines_by_id}
    for line in lines_by_id.values():
        if line.parent_line_id is not None and line.parent_line_id in children:
            children[line.parent_line_id].append(line.id)

    totals: dict[int, Decimal] = {}

    def compute(line_id: int, ancestors: frozenset[int]) -> Decimal:
        if line_id in totals:
            return totals[line_id]
        if line_id in ancestors:          # circular reference guard
            return Decimal("0")
        path = ancestors | {line_id}
        value = own.get(line_id, Decimal("0"))
        for child_id in children.get(line_id, []):
            value += compute(child_id, path)
        totals[line_id] = value
        return value

    for lid in lines_by_id:
        if lid not in totals:
            compute(lid, frozenset())

    return totals


def _ytd_is_net_debit(
    db: Session,
    entity_id: int,
    scenario_ids: list[int],
    fiscal_year_start: datetime.date,
    as_of_date: datetime.date,
) -> Decimal:
    """
    Sum of (debit − credit) for all IS accounts in the fiscal year to date.

    Adding this to the RE account's FS-line own_balance incorporates open-period
    earnings into the BS retained-earnings presentation before a formal close.

    After a close the closing entry zeroes IS accounts, so this returns 0,
    and the RE account's ledger balance already reflects net income.
    """
    raw = (
        db.query(func.sum(JournalEntryLine.debit - JournalEntryLine.credit))
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .join(Account, JournalEntryLine.account_id == Account.id)
        .filter(
            JournalEntryLine.entity_id == entity_id,
            JournalEntry.entry_date >= fiscal_year_start,
            JournalEntry.entry_date <= as_of_date,
            JournalEntry.scenario_id.in_(scenario_ids),
            JournalEntry.status == "posted",
            Account.account_type.in_(["revenue", "expense"]),
        )
        .scalar()
    )
    return Decimal(str(raw)) if raw is not None else Decimal("0")
