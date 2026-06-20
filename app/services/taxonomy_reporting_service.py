"""
Taxonomy-based financial statement reporting service.

Generates BS/IS line output using:
  Account.reporting_taxonomy_line_id → ReportingTaxonomyLine hierarchy

This is an alternative to the legacy AccountMapping → FsLineItem path.
It lets users who imported a COA (setting taxonomy lines on accounts) see
financial statements immediately — without needing to create AccountMapping records.

Inheritance:
  If an account has no reporting_taxonomy_line_id, the service walks up the
  account's parent_account_id chain to find the nearest ancestor with one.
  This lets sub-accounts inherit their parent's classification automatically.

Balance semantics:
  net_debit = SUM(debit - credit)
  display_balance = -total_balance when sign_flip else total_balance
  sign_flip = True for credit-normal lines (liabilities, equity, revenue)
"""
from __future__ import annotations

import datetime
from collections import defaultdict
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Sequence

from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.reporting_taxonomy import ReportingTaxonomyLine
from app.services.reporting_service import get_trial_balance
from app.services import presentation_service


@dataclass
class TaxonomyFsRow:
    taxonomy_id: int
    code: str
    name: str
    section: str
    statement_type: str | None
    sort_order: int
    parent_id: int | None
    hierarchy_depth: int
    is_subtotal: bool
    normal_balance: str | None
    sign_flip: bool
    own_balance: Decimal = field(default_factory=lambda: Decimal("0"))
    total_balance: Decimal = field(default_factory=lambda: Decimal("0"))
    display_balance: Decimal = field(default_factory=lambda: Decimal("0"))
    account_count: int = 0


def _sign_flip(line: ReportingTaxonomyLine) -> bool:
    """
    DEPRECATED — delegates to presentation_service.should_sign_flip().
    Sprint P3 moved presentation logic out of this classification service.
    """
    return presentation_service.should_sign_flip(line.normal_balance, line.sign_behavior)


def _compute_depths(lines_by_id: dict[int, ReportingTaxonomyLine]) -> dict[int, int]:
    """BFS depth from root for each taxonomy line."""
    depths: dict[int, int] = {}

    def depth_of(lid: int, visited: set[int] = frozenset()) -> int:  # type: ignore[assignment]
        if lid in depths:
            return depths[lid]
        if lid in visited:
            return 0
        line = lines_by_id.get(lid)
        if not line or not line.parent_id or line.parent_id not in lines_by_id:
            depths[lid] = 0
            return 0
        d = 1 + depth_of(line.parent_id, visited | {lid})
        depths[lid] = d
        return d

    for lid in lines_by_id:
        depth_of(lid)
    return depths


def _rollup(
    own: dict[int, Decimal],
    lines_by_id: dict[int, ReportingTaxonomyLine],
) -> dict[int, Decimal]:
    """Recursive rollup: total_balance[parent] += total_balance[child]."""
    children: dict[int, list[int]] = defaultdict(list)
    for lid, line in lines_by_id.items():
        if line.parent_id and line.parent_id in lines_by_id:
            children[line.parent_id].append(lid)

    totals: dict[int, Decimal] = dict(own)
    memo: dict[int, Decimal] = {}

    def compute(lid: int, visited: set[int]) -> Decimal:
        if lid in memo:
            return memo[lid]
        if lid in visited:
            return Decimal("0")
        visited = visited | {lid}
        total = totals.get(lid, Decimal("0"))
        for child_id in children[lid]:
            total += compute(child_id, visited)
        memo[lid] = total
        return total

    roots = [
        lid for lid, line in lines_by_id.items()
        if not line.parent_id or line.parent_id not in lines_by_id
    ]
    for root_id in roots:
        compute(root_id, set())

    return {lid: memo.get(lid, totals.get(lid, Decimal("0"))) for lid in lines_by_id}


def _resolve_taxonomy_id(
    account: Account,
    accounts_by_id: dict[int, Account],
) -> int | None:
    """Walk account's parent chain to find nearest ancestor's taxonomy_line_id."""
    visited: set[int] = set()
    current: Account | None = account
    while current is not None:
        if current.id in visited:
            break
        visited.add(current.id)
        if current.reporting_taxonomy_line_id is not None:
            return current.reporting_taxonomy_line_id
        if current.parent_account_id:
            current = accounts_by_id.get(current.parent_account_id)
        else:
            break
    return None


def get_taxonomy_fs_statement(
    db: Session,
    entity_id: int,
    as_of_date: datetime.date,
    scenario_ids: Sequence[int],
    statement_type: str,            # "balance_sheet" or "income_statement"
    view_overrides: dict[int, int] | None = None,  # account_id → taxonomy_line_id
    source_filter: Sequence[str] | None = None,
) -> list[TaxonomyFsRow]:
    """
    Build FS output using ReportingTaxonomyLine + Account.reporting_taxonomy_line_id.

    Children with no taxonomy_line_id inherit from their nearest ancestor account.
    view_overrides substitutes taxonomy_line_id for specific accounts in this view.
    Returns rows sorted by sort_order, with rollup totals.
    """
    # Load all taxonomy lines for this statement type (and their ancestors)
    all_lines = db.query(ReportingTaxonomyLine).filter_by(active=True).all()
    lines_by_id: dict[int, ReportingTaxonomyLine] = {l.id: l for l in all_lines}

    # Filter to target statement type, but keep ancestors of matching lines
    target_ids: set[int] = {
        l.id for l in all_lines if l.statement_type == statement_type
    }

    def ancestors_of(lid: int, visited: set[int] = frozenset()) -> set[int]:
        if lid in visited:
            return set()
        line = lines_by_id.get(lid)
        if not line or not line.parent_id:
            return set()
        parent_id = line.parent_id
        return {parent_id} | ancestors_of(parent_id, visited | {lid})

    included_ids = set(target_ids)
    for tid in list(target_ids):
        included_ids |= ancestors_of(tid)

    lines_in_scope: dict[int, ReportingTaxonomyLine] = {
        lid: lines_by_id[lid] for lid in included_ids if lid in lines_by_id
    }

    # Load entity accounts and build lookup
    entity_accounts = (
        db.query(Account)
        .filter(Account.entity_id == entity_id)
        .all()
    )
    accounts_by_id: dict[int, Account] = {a.id: a for a in entity_accounts}

    # Get trial balance
    tb_rows = get_trial_balance(db, entity_id, as_of_date, list(scenario_ids), source_filter=source_filter)
    tb_by_account_id = {r.account_id: r for r in tb_rows}

    # Accumulate own_balance per taxonomy line using inherited resolution
    own: dict[int, Decimal] = {lid: Decimal("0") for lid in lines_in_scope}
    account_counts: dict[int, int] = {lid: 0 for lid in lines_in_scope}

    for account in entity_accounts:
        if view_overrides and account.id in view_overrides:
            override_tid = view_overrides[account.id]
            tax_id = override_tid if override_tid is not None else None
        else:
            tax_id = _resolve_taxonomy_id(account, accounts_by_id)
        if tax_id is None or tax_id not in lines_in_scope:
            continue
        tb_row = tb_by_account_id.get(account.id)
        if tb_row is None:
            continue
        own[tax_id] = own.get(tax_id, Decimal("0")) + tb_row.net_debit
        account_counts[tax_id] = account_counts.get(tax_id, 0) + 1

    # Rollup totals through taxonomy hierarchy
    totals = _rollup(own, lines_in_scope)

    # Compute hierarchy depths
    depths = _compute_depths(lines_in_scope)

    # Build output rows. Presentation transforms (sign flip, display balance)
    # are delegated to presentation_service (Sprint P3 extraction).
    result: list[TaxonomyFsRow] = []
    for line in sorted(lines_in_scope.values(), key=lambda l: (l.sort_order, l.id)):
        flip = presentation_service.should_sign_flip(line.normal_balance, line.sign_behavior)
        total = totals[line.id]
        display = presentation_service.apply_sign_for_display(total, line.normal_balance, line.sign_behavior)
        result.append(TaxonomyFsRow(
            taxonomy_id=line.id,
            code=line.code,
            name=line.name,
            section=line.section,
            statement_type=line.statement_type,
            sort_order=line.sort_order,
            parent_id=line.parent_id,
            hierarchy_depth=depths.get(line.id, 0),
            is_subtotal=line.is_subtotal,
            normal_balance=line.normal_balance,
            sign_flip=flip,
            own_balance=own.get(line.id, Decimal("0")),
            total_balance=total,
            display_balance=display,
            account_count=account_counts.get(line.id, 0),
        ))
    return result


def propagate_taxonomy_to_children(
    entity_id: int,
    db: Session,
) -> dict[str, int]:
    """
    Walk account parent-child tree and assign reporting_taxonomy_line_id to
    children that have none, inheriting from their nearest ancestor.

    Returns {"updated": N, "already_set": M, "no_ancestor": K}
    """
    entity_accounts = (
        db.query(Account)
        .filter(Account.entity_id == entity_id)
        .all()
    )
    accounts_by_id: dict[int, Account] = {a.id: a for a in entity_accounts}

    updated = 0
    already_set = 0
    no_ancestor = 0

    for account in entity_accounts:
        if account.reporting_taxonomy_line_id is not None:
            already_set += 1
            continue
        inherited = _resolve_taxonomy_id(account, accounts_by_id)
        if inherited is not None:
            account.reporting_taxonomy_line_id = inherited
            updated += 1
        else:
            no_ancestor += 1

    db.flush()
    return {"updated": updated, "already_set": already_set, "no_ancestor": no_ancestor}
