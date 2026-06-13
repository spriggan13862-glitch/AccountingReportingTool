"""
Multi-entity consolidation service.

Consolidation model (from schema.sql usage note 4)
---------------------------------------------------
Consolidated balance for entity P as of date D, scenario stack S =
    SUM of each member entity's balance (scaled by ownership_pct)
    + elimination JEs booked directly to P in the ELIM scenario

Two membership mechanisms are supported, matching the schema:

  1. entity_group_members table — explicit many-to-many with ownership_pct.
     Use get_consolidation_members() + get_consolidated_trial_balance().

  2. entities.parent_id tree — implicit hierarchy traversal.
     Use get_entity_subtree() for a depth-first list of descendants.

Both mechanisms can feed into get_group_trial_balance() which accepts an
arbitrary list of entity IDs with optional ownership percentages.

Elimination journal entries
---------------------------
Eliminations are ordinary journal entries posted to the consolidation entity (P)
under an elimination scenario (e.g. scenario_type='elimination').
The consolidation service fetches P's own trial balance under those scenarios
and merges it into the consolidated aggregate.

This means the intercompany receivable and payable booked at operating entities
are summed first, then the elimination entries (opposite signs, booked to P)
are added — netting both positions to zero.
"""

import datetime
from decimal import Decimal
from typing import Sequence

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.entity import Entity
from app.models.entity_group_member import EntityGroupMember
from app.services.fs_reporting_service import FsLineBalance, build_fs_from_tb_rows
from app.services.reporting_service import TrialBalanceRow, get_trial_balance
from app.services.validation import ValidationResult


# ---------------------------------------------------------------------------
# Entity tree traversal
# ---------------------------------------------------------------------------

def get_entity_subtree(db: Session, root_entity_id: int) -> list[int]:
    """
    Returns all entity IDs in the subtree rooted at root_entity_id using the
    entities.parent_id relationship (depth-first, includes the root itself).
    Handles arbitrary depth; guards against circular parent references.
    """
    all_entities = db.query(Entity).all()
    children: dict[int, list[int]] = {}
    for e in all_entities:
        if e.parent_id is not None:
            children.setdefault(e.parent_id, []).append(e.id)

    result: list[int] = []
    visited: set[int] = set()
    stack = [root_entity_id]
    while stack:
        eid = stack.pop()
        if eid in visited:
            continue
        visited.add(eid)
        result.append(eid)
        stack.extend(children.get(eid, []))
    return result


def get_consolidation_members(
    db: Session,
    consolidation_entity_id: int,
    as_of_date: datetime.date,
) -> list[tuple[int, Decimal]]:
    """
    Returns (member_entity_id, ownership_pct) from entity_group_members
    effective on as_of_date (NULL effective dates are treated as unbounded).
    """
    rows = (
        db.query(EntityGroupMember)
        .filter(
            EntityGroupMember.consolidation_entity_id == consolidation_entity_id,
            or_(
                EntityGroupMember.effective_from.is_(None),
                EntityGroupMember.effective_from <= as_of_date,
            ),
            or_(
                EntityGroupMember.effective_to.is_(None),
                EntityGroupMember.effective_to >= as_of_date,
            ),
        )
        .all()
    )
    return [(r.member_entity_id, Decimal(str(r.ownership_pct))) for r in rows]


# ---------------------------------------------------------------------------
# Consolidated trial balance
# ---------------------------------------------------------------------------

def get_group_trial_balance(
    db: Session,
    entity_ids: Sequence[int],
    as_of_date: datetime.date,
    scenario_ids: Sequence[int],
    ownership_pcts: dict[int, Decimal] | None = None,
    source_filter: Sequence[str] | None = None,
) -> list[TrialBalanceRow]:
    """
    Aggregates trial balance rows across a list of entities.

    Balances are scaled by ownership_pct (default 100% for each entity).
    Returns one TrialBalanceRow per account (summed across all entities).
    """
    pcts = ownership_pcts or {}
    debit_totals:  dict[int, Decimal] = {}
    credit_totals: dict[int, Decimal] = {}
    meta:          dict[int, TrialBalanceRow] = {}

    for entity_id in entity_ids:
        scale = pcts.get(entity_id, Decimal("100")) / Decimal("100")
        for row in get_trial_balance(db, entity_id, as_of_date, scenario_ids, source_filter=source_filter):
            aid = row.account_id
            debit_totals[aid]  = debit_totals.get(aid,  Decimal("0")) + row.total_debit  * scale
            credit_totals[aid] = credit_totals.get(aid, Decimal("0")) + row.total_credit * scale
            if aid not in meta:
                meta[aid] = row

    return _build_tb_rows(debit_totals, credit_totals, meta)


def get_consolidated_trial_balance(
    db: Session,
    consolidation_entity_id: int,
    as_of_date: datetime.date,
    operating_scenario_ids: Sequence[int],
    elim_scenario_ids: Sequence[int],
    source_filter: Sequence[str] | None = None,
) -> list[TrialBalanceRow]:
    """
    Full consolidation via entity_group_members.

    Step 1 — operating: sum each member entity's trial balance, scaled by
              their ownership_pct from entity_group_members.
    Step 2 — eliminations: add the consolidation entity's own trial balance
              under elim_scenario_ids (elimination JEs).
    Step 3 — merge and return.

    Parameters
    ----------
    operating_scenario_ids
        Scenarios used to query each member entity (typically [ACTUAL] or
        [ACTUAL, TOPSIDE]).
    elim_scenario_ids
        Scenarios used to query the consolidation entity's own ledger for
        elimination entries (typically [ELIM]).
    """
    members = get_consolidation_members(db, consolidation_entity_id, as_of_date)
    if not members:
        return []

    entity_ids = [eid for eid, _ in members]
    pcts = {eid: pct for eid, pct in members}

    operating_tb = get_group_trial_balance(
        db, entity_ids, as_of_date, operating_scenario_ids, pcts, source_filter=source_filter
    )

    if elim_scenario_ids:
        elim_tb = get_group_trial_balance(
            db, [consolidation_entity_id], as_of_date, elim_scenario_ids, source_filter=source_filter
        )
        return _merge_tb_lists(operating_tb, elim_tb)

    return operating_tb


# ---------------------------------------------------------------------------
# Consolidated FS statement
# ---------------------------------------------------------------------------

def get_consolidated_fs_statement(
    db: Session,
    consolidation_entity_id: int,
    as_of_date: datetime.date,
    operating_scenario_ids: Sequence[int],
    elim_scenario_ids: Sequence[int],
    statement: str | None = None,
) -> list[FsLineBalance]:
    """
    Full consolidated FS output.

    Builds the consolidated trial balance first, then feeds it through the
    existing FS aggregation / rollup pipeline using the consolidation entity's
    account mappings (falling back to global mappings as usual).
    """
    cons_tb = get_consolidated_trial_balance(
        db, consolidation_entity_id, as_of_date, operating_scenario_ids, elim_scenario_ids
    )
    return build_fs_from_tb_rows(
        db,
        tb_by_account_id={r.account_id: r for r in cons_tb},
        mapping_entity_id=consolidation_entity_id,
        as_of_date=as_of_date,
        statement=statement,
    )


def get_subgroup_trial_balance(
    db: Session,
    entity_ids: Sequence[int],
    as_of_date: datetime.date,
    operating_scenario_ids: Sequence[int],
    elim_entity_id: int | None = None,
    elim_scenario_ids: Sequence[int] = (),
    ownership_pcts: dict[int, Decimal] | None = None,
) -> list[TrialBalanceRow]:
    """
    Arbitrary-subgroup consolidation: caller provides the entity list directly.
    Useful for partial rollups (e.g. a regional sub-group within a larger group).
    """
    operating_tb = get_group_trial_balance(
        db, entity_ids, as_of_date, operating_scenario_ids, ownership_pcts
    )

    if elim_entity_id and elim_scenario_ids:
        elim_tb = get_group_trial_balance(
            db, [elim_entity_id], as_of_date, elim_scenario_ids
        )
        return _merge_tb_lists(operating_tb, elim_tb)

    return operating_tb


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_consolidated_tb(tb_rows: list[TrialBalanceRow]) -> ValidationResult:
    """
    Validate that a consolidated trial balance is in balance.

    Returns ERROR if total debits ≠ total credits (indicates an elimination
    entry error or ownership percentage misconfiguration).
    Returns INFO if the TB is empty (possibly no members configured).
    """
    result = ValidationResult()
    if not tb_rows:
        result.info(
            code="CONS_TB_EMPTY",
            message="Consolidated trial balance has no rows; verify group membership configuration",
            source_type="consolidated_trial_balance",
        )
        return result

    total_debit  = sum(r.total_debit  for r in tb_rows)
    total_credit = sum(r.total_credit for r in tb_rows)

    if total_debit != total_credit:
        result.error(
            code="CONS_TB_OUT_OF_BALANCE",
            message=(
                f"Consolidated trial balance is out of balance: "
                f"total_debit={total_debit}, total_credit={total_credit}"
            ),
            source_type="consolidated_trial_balance",
            suggested_resolution=(
                "Check elimination entries and ownership percentages. "
                "Elimination JEs must be posted to the consolidation entity under an ELIM scenario."
            ),
        )

    return result


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _build_tb_rows(
    debit_totals:  dict[int, Decimal],
    credit_totals: dict[int, Decimal],
    meta:          dict[int, TrialBalanceRow],
) -> list[TrialBalanceRow]:
    result: list[TrialBalanceRow] = []
    for aid in sorted(debit_totals.keys(), key=lambda k: meta[k].account_number):
        d   = debit_totals[aid]
        c   = credit_totals.get(aid, Decimal("0"))
        net = d - c
        ref = meta[aid]
        signed = net if ref.normal_balance == "debit" else -net
        result.append(TrialBalanceRow(
            account_id=aid,
            account_number=ref.account_number,
            account_name=ref.account_name,
            account_type=ref.account_type,
            normal_balance=ref.normal_balance,
            total_debit=d,
            total_credit=c,
            net_debit=net,
            signed_balance=signed,
            beginning_balance=Decimal("0"),
            period_debit=d,
            period_credit=c,
            ending_balance=signed,
        ))
    return result


def _merge_tb_lists(*tb_lists: list[TrialBalanceRow]) -> list[TrialBalanceRow]:
    """Merge multiple trial balance lists by summing debits and credits per account."""
    debit_totals:  dict[int, Decimal] = {}
    credit_totals: dict[int, Decimal] = {}
    meta:          dict[int, TrialBalanceRow] = {}

    for tb in tb_lists:
        for row in tb:
            aid = row.account_id
            debit_totals[aid]  = debit_totals.get(aid,  Decimal("0")) + row.total_debit
            credit_totals[aid] = credit_totals.get(aid, Decimal("0")) + row.total_credit
            if aid not in meta:
                meta[aid] = row

    return _build_tb_rows(debit_totals, credit_totals, meta)
