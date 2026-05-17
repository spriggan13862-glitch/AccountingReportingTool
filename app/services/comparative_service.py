"""
Comparative and scenario-stacking reporting service.

Core concepts
-------------
ScenarioStack
    A named column in a comparative report.  It specifies WHICH scenarios to
    combine (scenario_ids) and THROUGH WHICH DATE to query (as_of_date).
    Because multiple scenario IDs map directly to `scenario_id IN (...)` in the
    existing trial-balance query, stacking is just additive set union — no extra
    logic needed.

    Examples
    --------
    Actual only:           ScenarioStack("Actual",          [actual_id],              date)
    Actual + Topside:      ScenarioStack("Actual+Topside",  [actual_id, topside_id],  date)
    Actual + Pro Forma:    ScenarioStack("Pro Forma View",  [actual_id, proforma_id], date)
    Budget:                ScenarioStack("Budget",          [budget_id],              date)
    Prior Period Actual:   ScenarioStack("Prior Year",      [actual_id],              prior_date)

Variance
    amount  = current − base   (signed)
    pct     = amount / |base| × 100   (None when base = 0)

Comparative trial balance
    One ComparativeTbRow per account active in at least one stack.
    columns[label] = net_debit for that stack (0 when account has no activity).

Comparative FS statement
    One ComparativeFsRow per FS line.
    columns[label]   = display_balance (sign_flip applied).
    variances        = adjacent-pair variances: stacks[i] vs stacks[i-1].
"""

import datetime
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Sequence

from sqlalchemy.orm import Session

from app.services.fs_reporting_service import (
    FsLineBalance,
    find_unmapped_accounts,
    get_fs_statement,
)
from app.services.reporting_service import TrialBalanceRow, get_trial_balance


# ---------------------------------------------------------------------------
# Public data structures
# ---------------------------------------------------------------------------

@dataclass
class ScenarioStack:
    """Defines one column in a comparative report."""
    label: str
    scenario_ids: list[int]
    as_of_date: datetime.date


@dataclass
class Variance:
    """
    Directional variance: current_value − base_value.
    percentage is None when base is zero (avoids division by zero).
    """
    amount: Decimal
    percentage: Decimal | None


@dataclass
class ComparativeTbRow:
    """One account across all stacks' trial balances."""
    account_id: int
    account_number: str
    account_name: str
    account_type: str
    normal_balance: str
    columns: dict[str, Decimal]   # label → net_debit (positive = debit position)


@dataclass
class ComparativeFsRow:
    """One FS line item across all stacks."""
    line_id: int
    code: str
    name: str
    statement: str
    section: str | None
    sort_order: int
    parent_line_id: int | None
    is_subtotal: bool
    sign_flip: bool
    columns: dict[str, Decimal]      # label → display_balance (sign_flip applied)
    variances: dict[str, Variance]   # "{stacks[i].label}_vs_{stacks[i-1].label}" → Variance


# ---------------------------------------------------------------------------
# Core variance primitive
# ---------------------------------------------------------------------------

def calculate_variance(current: Decimal, base: Decimal) -> Variance:
    """
    Returns Variance(amount, percentage).

    amount      = current − base
    percentage  = (amount / |base|) × 100  when base ≠ 0, else None

    Signs are preserved — a negative amount means current < base.
    """
    amount = current - base
    if base != Decimal("0"):
        pct = (amount / abs(base)) * Decimal("100")
    else:
        pct = None
    return Variance(amount=amount, percentage=pct)


# ---------------------------------------------------------------------------
# Comparative trial balance
# ---------------------------------------------------------------------------

def get_comparative_trial_balance(
    db: Session,
    entity_id: int,
    stacks: list[ScenarioStack],
) -> list[ComparativeTbRow]:
    """
    Returns one row per account that has activity in any of the provided stacks.

    columns[stack.label] = net_debit for that stack (0 when the account is inactive
    in that stack).

    Rows are sorted by account_number.
    """
    if not stacks:
        return []

    # Fetch trial balance for every stack
    per_stack: list[dict[int, TrialBalanceRow]] = [
        {r.account_id: r for r in get_trial_balance(db, entity_id, s.as_of_date, s.scenario_ids)}
        for s in stacks
    ]

    # Union of all account_ids, keeping one representative row for metadata
    meta: dict[int, TrialBalanceRow] = {}
    for stack_dict in per_stack:
        for acct_id, row in stack_dict.items():
            if acct_id not in meta:
                meta[acct_id] = row

    result: list[ComparativeTbRow] = []
    for acct_id, ref in sorted(meta.items(), key=lambda kv: kv[1].account_number):
        columns = {
            stack.label: (stack_dict[acct_id].net_debit if acct_id in stack_dict else Decimal("0"))
            for stack, stack_dict in zip(stacks, per_stack)
        }
        result.append(ComparativeTbRow(
            account_id=acct_id,
            account_number=ref.account_number,
            account_name=ref.account_name,
            account_type=ref.account_type,
            normal_balance=ref.normal_balance,
            columns=columns,
        ))
    return result


# ---------------------------------------------------------------------------
# Comparative FS statement
# ---------------------------------------------------------------------------

def get_comparative_fs_statement(
    db: Session,
    entity_id: int,
    stacks: list[ScenarioStack],
    statement: str | None = None,
) -> list[ComparativeFsRow]:
    """
    Returns one ComparativeFsRow per FS line active across any stack, sorted by
    sort_order.

    columns[stack.label]  = display_balance for that stack (sign_flip applied).
    variances             = adjacent-stack variances:
                            key  = "{stacks[i].label}_vs_{stacks[i-1].label}"
                            value = calculate_variance(stacks[i], stacks[i-1])
    """
    if not stacks:
        return []

    # Fetch FS output for every stack
    per_stack: list[dict[str, FsLineBalance]] = [
        {row.code: row for row in get_fs_statement(db, entity_id, s.as_of_date, s.scenario_ids, statement)}
        for s in stacks
    ]

    # Union of all line codes
    meta: dict[str, FsLineBalance] = {}
    for stack_dict in per_stack:
        for code, row in stack_dict.items():
            if code not in meta:
                meta[code] = row

    result: list[ComparativeFsRow] = []
    for code, ref in sorted(meta.items(), key=lambda kv: (kv[1].sort_order, kv[1].line_id)):
        columns = {
            stack.label: (stack_dict[code].display_balance if code in stack_dict else Decimal("0"))
            for stack, stack_dict in zip(stacks, per_stack)
        }

        # Variance between each consecutive pair
        variances: dict[str, Variance] = {}
        for i in range(1, len(stacks)):
            key = f"{stacks[i].label}_vs_{stacks[i - 1].label}"
            variances[key] = calculate_variance(
                current=columns[stacks[i].label],
                base=columns[stacks[i - 1].label],
            )

        result.append(ComparativeFsRow(
            line_id=ref.line_id,
            code=code,
            name=ref.name,
            statement=ref.statement,
            section=ref.section,
            sort_order=ref.sort_order,
            parent_line_id=ref.parent_line_id,
            is_subtotal=ref.is_subtotal,
            sign_flip=ref.sign_flip,
            columns=columns,
            variances=variances,
        ))
    return result


# ---------------------------------------------------------------------------
# Comparative unmapped-account detection
# ---------------------------------------------------------------------------

def find_comparative_unmapped_accounts(
    db: Session,
    entity_id: int,
    stacks: list[ScenarioStack],
) -> list[TrialBalanceRow]:
    """
    Returns accounts that are active in any stack but have no effective FS mapping
    as of the latest as_of_date across all stacks.

    Uses the latest as_of_date so that the most-recent mappings are consulted.
    """
    if not stacks:
        return []

    latest_date = max(s.as_of_date for s in stacks)
    all_scenario_ids = list({sid for s in stacks for sid in s.scenario_ids})
    return find_unmapped_accounts(db, entity_id, latest_date, all_scenario_ids)
