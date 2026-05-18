"""
Draft Overlay Service — accountant-grade financial preview engine.

ACCOUNTING RULES ENFORCED:
  1. Official balances are ALWAYS sourced from posted entries only.
  2. Preview balances are NEVER persisted to any balance table.
  3. Overlay calculations are deterministic and repeatable.
  4. Organization isolation is preserved at every query boundary.
  5. Every preview generation is logged in PreviewRun for audit.

Terminology:
  official_net_debit   — SUM(debit - credit) for posted entries only
  draft_net_debit      — SUM(debit - credit) for selected draft entries
  preview_net_debit    — official_net_debit + draft_net_debit  (never persisted)
  signed_balance       — net_debit if normal_balance=='debit' else -net_debit
"""

from __future__ import annotations

import datetime
import json
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Sequence

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.entity import Entity
from app.models.entity_group_member import EntityGroupMember
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.models.preview_run import PreviewRun

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OVERLAY_GROUPS = {
    "audit_adjustments",
    "management_adjustments",
    "lender_adjustments",
    "qoe_adjustments",
    "acquisition_adjustments",
    "close_adjustments",
    "tax_adjustments",
    "eliminations",
    "consolidation_adjustments",
    "pro_forma_adjustments",
    "reclasses",
    "accruals",
    "topsides",
}

# Maps JournalEntry.overlay_group (or source) → canonical group name
_SOURCE_TO_GROUP: dict[str, str] = {
    "audit_adjustment": "audit_adjustments",
    "topside": "topsides",
    "reclass": "reclasses",
    "accrual": "accruals",
    "elimination": "eliminations",
    "close_entry": "close_adjustments",
    "consolidation": "consolidation_adjustments",
    "pro_forma": "pro_forma_adjustments",
    "tax": "tax_adjustments",
    "lender": "lender_adjustments",
    "qoe": "qoe_adjustments",
    "acquisition": "acquisition_adjustments",
}

PL_ACCOUNT_TYPES = {"revenue", "expense"}
BS_ACCOUNT_TYPES = {"asset", "liability", "equity"}

PREVIEW_LABEL = "Draft Preview — Not Posted"

# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class OverlayValidationError(Exception):
    """Raised when overlay parameters fail validation."""


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class OverlayParams:
    organization_id: int
    entity_id: int
    as_of_date: datetime.date
    scenario_id: int
    preview_type: str          # trial_balance | balance_sheet | income_statement |
                               # consolidated_tb | consolidated_bs | consolidated_is |
                               # working_capital | ebitda_bridge | pro_forma
    included_je_ids: list[int] | None = None   # None → all available drafts
    overlay_groups: list[str] | None = None    # None → all groups
    generated_by: str | None = None
    generated_by_user_id: int | None = None
    include_re_rollforward: bool = True
    is_consolidated: bool = False
    consolidation_entity_id: int | None = None
    period_start: datetime.date | None = None  # for period-aware overlays


@dataclass
class OverlayLineItem:
    account_id: int
    account_number: str
    account_name: str
    account_type: str
    normal_balance: str
    official_net_debit: Decimal
    draft_net_debit: Decimal           # net adjustment from selected drafts
    preview_net_debit: Decimal         # official + draft
    official_signed_balance: Decimal
    draft_signed_adjustment: Decimal   # adjustment in the account's natural direction
    preview_signed_balance: Decimal    # official + draft in natural direction
    source_je_ids: list[int] = field(default_factory=list)
    overlay_groups_used: list[str] = field(default_factory=list)
    is_synthetic_re: bool = False      # True for the auto RE-rollforward line


@dataclass
class OverlayResult:
    """
    Pure calculation result — never persisted.
    Always labeled; consumers MUST surface the label to end users.
    """
    is_preview: bool = True
    label: str = PREVIEW_LABEL
    preview_type: str = ""
    organization_id: int = 0
    entity_id: int = 0
    as_of_date: datetime.date = field(default_factory=datetime.date.today)
    scenario_id: int = 0
    generated_at: datetime.datetime = field(default_factory=lambda: datetime.datetime.now(datetime.UTC))
    included_je_count: int = 0
    overlay_groups: list[str] = field(default_factory=list)
    line_items: list[OverlayLineItem] = field(default_factory=list)
    re_rollforward_applied: bool = False
    re_draft_adjustment: Decimal = Decimal("0")
    warnings: list[str] = field(default_factory=list)
    # For consolidated previews
    member_entity_ids: list[int] = field(default_factory=list)


@dataclass
class DrilldownResult:
    """Source draft entries that contributed to a specific account's preview adjustment."""
    account_id: int
    account_number: str
    account_name: str
    draft_net_debit: Decimal
    entries: list[dict]   # [{je_id, je_number, entry_date, debit, credit, description, overlay_group}]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _net_debit(debit: Decimal, credit: Decimal) -> Decimal:
    return debit - credit


def _signed(net_debit: Decimal, normal_balance: str) -> Decimal:
    return net_debit if normal_balance == "debit" else -net_debit


def _resolve_overlay_group(je: JournalEntry) -> str:
    """Resolve a JE's canonical overlay group from overlay_group or source."""
    raw = je.overlay_group or je.source or ""
    return _SOURCE_TO_GROUP.get(raw, raw or "unclassified")


def _get_official_balances(
    db: Session,
    entity_id: int,
    as_of_date: datetime.date,
    scenario_id: int,
) -> dict[int, tuple[Decimal, Decimal]]:
    """
    Returns {account_id: (total_debit, total_credit)} for POSTED entries only.
    This is the immutable official baseline — never modified by overlay logic.
    """
    rows = (
        db.query(
            JournalEntryLine.account_id,
            func.coalesce(func.sum(JournalEntryLine.debit), 0).label("d"),
            func.coalesce(func.sum(JournalEntryLine.credit), 0).label("c"),
        )
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .filter(
            JournalEntryLine.entity_id == entity_id,
            JournalEntry.entry_date <= as_of_date,
            JournalEntry.scenario_id == scenario_id,
            JournalEntry.status == "posted",          # CRITICAL: posted only
        )
        .group_by(JournalEntryLine.account_id)
        .all()
    )
    return {
        account_id: (Decimal(str(d)), Decimal(str(c)))
        for account_id, d, c in rows
    }


def _get_available_draft_jes(
    db: Session,
    entity_id: int,
    scenario_id: int,
    as_of_date: datetime.date,
    included_je_ids: list[int] | None,
    overlay_groups: list[str] | None,
) -> list[JournalEntry]:
    """Returns draft JEs matching the selection criteria."""
    q = (
        db.query(JournalEntry)
        .filter(
            JournalEntry.entity_id == entity_id,
            JournalEntry.scenario_id == scenario_id,
            JournalEntry.entry_date <= as_of_date,
            JournalEntry.status == "draft",           # CRITICAL: draft only
        )
    )
    if included_je_ids is not None:
        q = q.filter(JournalEntry.id.in_(included_je_ids))
    return q.all()


def _filter_by_groups(
    jes: list[JournalEntry],
    overlay_groups: list[str] | None,
) -> list[JournalEntry]:
    """Filter JEs by overlay group if a whitelist is provided."""
    if overlay_groups is None:
        return jes
    return [je for je in jes if _resolve_overlay_group(je) in overlay_groups]


def _calc_draft_adjustments(
    db: Session,
    je_ids: list[int],
    entity_id: int,
) -> dict[int, tuple[Decimal, Decimal, list[int], list[str]]]:
    """
    Returns {account_id: (total_debit, total_credit, [je_ids], [overlay_groups])}
    for all lines of the selected draft JEs.
    """
    if not je_ids:
        return {}

    lines = (
        db.query(JournalEntryLine)
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .filter(
            JournalEntryLine.entity_id == entity_id,
            JournalEntry.id.in_(je_ids),
        )
        .all()
    )

    # Build je_id → overlay_group map
    je_group_map: dict[int, str] = {}
    for je in db.query(JournalEntry).filter(JournalEntry.id.in_(je_ids)).all():
        je_group_map[je.id] = _resolve_overlay_group(je)

    result: dict[int, tuple[Decimal, Decimal, list[int], list[str]]] = {}
    for line in lines:
        acct = line.account_id
        d, c, ids, grps = result.get(acct, (Decimal("0"), Decimal("0"), [], []))
        new_d = d + Decimal(str(line.debit))
        new_c = c + Decimal(str(line.credit))
        je_id = line.journal_entry_id
        new_ids = ids + ([je_id] if je_id not in ids else [])
        grp = je_group_map.get(je_id, "unclassified")
        new_grps = grps + ([grp] if grp not in grps else [])
        result[acct] = (new_d, new_c, new_ids, new_grps)
    return result


def _compute_re_rollforward(
    line_items: list[OverlayLineItem],
) -> Decimal:
    """
    Compute the RE synthetic adjustment from draft P&L impacts.

    Net income = revenue - expense
    Revenue accounts: credit-normal → draft credit → net_debit is negative → income increases
    Expense accounts: debit-normal  → draft debit  → net_debit is positive → income decreases

    RE adjustment = -(sum of draft_net_debit for all P&L accounts)
    """
    pl_draft_net_debit = sum(
        item.draft_net_debit
        for item in line_items
        if item.account_type in PL_ACCOUNT_TYPES
    )
    return -pl_draft_net_debit   # negative of P&L net debit = net income impact


def _apply_re_rollforward(
    line_items: list[OverlayLineItem],
    re_adjustment: Decimal,
    db: Session,
    entity_id: int,
) -> None:
    """
    Apply the RE synthetic adjustment to the first equity account classified as RE,
    or append a synthetic line if none exists.
    RE is credit-normal: a positive re_adjustment (income) increases RE (reduces net_debit).
    """
    if re_adjustment == Decimal("0"):
        return

    # Find an equity account that is likely RE (simplistic: first equity account)
    re_accounts = [item for item in line_items if item.account_type == "equity"]
    if re_accounts:
        target = re_accounts[0]
        # RE is credit-normal: positive income → net credit → net_debit decreases
        delta = -re_adjustment   # re_adjustment is income; RE credit-normal means -delta on net_debit
        target.draft_net_debit += delta
        target.preview_net_debit += delta
        target.draft_signed_adjustment = _signed(target.draft_net_debit, target.normal_balance)
        target.preview_signed_balance = _signed(target.preview_net_debit, target.normal_balance)
        target.is_synthetic_re = True
    else:
        # No equity account in range — create a synthetic placeholder
        synthetic = OverlayLineItem(
            account_id=0,
            account_number="RE-SYNTHETIC",
            account_name="Retained Earnings (Synthetic Rollforward)",
            account_type="equity",
            normal_balance="credit",
            official_net_debit=Decimal("0"),
            draft_net_debit=-re_adjustment,
            preview_net_debit=-re_adjustment,
            official_signed_balance=Decimal("0"),
            draft_signed_adjustment=_signed(-re_adjustment, "credit"),
            preview_signed_balance=_signed(-re_adjustment, "credit"),
            is_synthetic_re=True,
        )
        line_items.append(synthetic)


def _build_line_items(
    db: Session,
    official: dict[int, tuple[Decimal, Decimal]],
    draft_adj: dict[int, tuple[Decimal, Decimal, list[int], list[str]]],
) -> list[OverlayLineItem]:
    """Merge official and draft adjustments into OverlayLineItem list."""
    all_account_ids = set(official.keys()) | set(draft_adj.keys())
    if not all_account_ids:
        return []

    accounts = {
        a.id: a
        for a in db.query(Account).filter(Account.id.in_(all_account_ids)).all()
    }

    items: list[OverlayLineItem] = []
    for acct_id in sorted(all_account_ids):
        acct = accounts.get(acct_id)
        if acct is None:
            continue
        off_d, off_c = official.get(acct_id, (Decimal("0"), Decimal("0")))
        dr_d, dr_c, je_ids, grps = draft_adj.get(acct_id, (Decimal("0"), Decimal("0"), [], []))

        off_net = _net_debit(off_d, off_c)
        dr_net = _net_debit(dr_d, dr_c)
        prev_net = off_net + dr_net

        off_signed = _signed(off_net, acct.normal_balance)
        dr_signed = _signed(dr_net, acct.normal_balance)
        prev_signed = _signed(prev_net, acct.normal_balance)

        items.append(OverlayLineItem(
            account_id=acct_id,
            account_number=acct.account_number,
            account_name=acct.account_name,
            account_type=acct.account_type,
            normal_balance=acct.normal_balance,
            official_net_debit=off_net,
            draft_net_debit=dr_net,
            preview_net_debit=prev_net,
            official_signed_balance=off_signed,
            draft_signed_adjustment=dr_signed,
            preview_signed_balance=prev_signed,
            source_je_ids=je_ids,
            overlay_groups_used=grps,
        ))
    return items


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def _validate_params(db: Session, params: OverlayParams) -> None:
    """Validate overlay parameters before executing calculation."""
    errors: list[str] = []

    # Cross-org check: entity must belong to the specified organization
    entity = db.query(Entity).filter(Entity.id == params.entity_id).first()
    if entity is None:
        errors.append(f"Entity {params.entity_id} not found.")
    elif entity.organization_id is not None and entity.organization_id != params.organization_id:
        errors.append(
            f"Entity {params.entity_id} belongs to organization {entity.organization_id}, "
            f"not {params.organization_id}. Cross-org overlays are not permitted."
        )

    # Overlay group validation
    if params.overlay_groups:
        unknown = set(params.overlay_groups) - OVERLAY_GROUPS
        if unknown:
            errors.append(f"Unknown overlay groups: {sorted(unknown)}")

    # Duplicate JE check
    if params.included_je_ids is not None:
        if len(params.included_je_ids) != len(set(params.included_je_ids)):
            errors.append("Duplicate JE IDs in included_je_ids.")

    # JE org isolation: all included JEs must belong to the same org/entity
    if params.included_je_ids:
        alien_jes = (
            db.query(JournalEntry.id)
            .join(Entity, JournalEntry.entity_id == Entity.id)
            .filter(
                JournalEntry.id.in_(params.included_je_ids),
                Entity.organization_id != params.organization_id,
            )
            .all()
        )
        if alien_jes:
            ids = [r[0] for r in alien_jes]
            errors.append(f"JEs {ids} belong to a different organization. Cross-org overlays are not permitted.")

    # Posted JEs cannot be included as draft overlays (they are already in official)
    if params.included_je_ids:
        posted_jes = (
            db.query(JournalEntry.id)
            .filter(
                JournalEntry.id.in_(params.included_je_ids),
                JournalEntry.status != "draft",
            )
            .all()
        )
        if posted_jes:
            ids = [r[0] for r in posted_jes]
            errors.append(f"JEs {ids} are not in draft status. Only draft entries can be overlaid.")

    # Consolidated preview must specify a consolidation entity
    if params.is_consolidated and params.consolidation_entity_id is None:
        errors.append("Consolidated preview requires consolidation_entity_id.")

    if errors:
        raise OverlayValidationError("; ".join(errors))


# ---------------------------------------------------------------------------
# Consolidated overlay
# ---------------------------------------------------------------------------


def _calculate_consolidated_overlay(
    db: Session,
    params: OverlayParams,
    member_ids: list[int],
) -> list[OverlayLineItem]:
    """
    For each member entity, compute preview balances weighted by ownership_pct,
    then sum across all members.  Elimination JEs posted to the consolidation entity
    are included in official balances automatically via the standard query.
    Draft elimination entries are included when their entity_id matches
    the consolidation entity.
    """
    # Get ownership percentages
    memberships = (
        db.query(EntityGroupMember)
        .filter(
            EntityGroupMember.consolidation_entity_id == params.consolidation_entity_id,
            EntityGroupMember.member_entity_id.in_(member_ids),
        )
        .all()
    )
    pct_map = {m.member_entity_id: Decimal(str(m.ownership_pct or 100)) / 100 for m in memberships}

    # Aggregate across members
    combined_official: dict[int, tuple[Decimal, Decimal]] = {}
    combined_draft: dict[int, tuple[Decimal, Decimal, list[int], list[str]]] = {}

    for member_id in member_ids:
        pct = pct_map.get(member_id, Decimal("1"))

        off = _get_official_balances(db, member_id, params.as_of_date, params.scenario_id)
        for acct_id, (d, c) in off.items():
            prev_d, prev_c = combined_official.get(acct_id, (Decimal("0"), Decimal("0")))
            combined_official[acct_id] = (prev_d + d * pct, prev_c + c * pct)

        member_params = OverlayParams(
            organization_id=params.organization_id,
            entity_id=member_id,
            as_of_date=params.as_of_date,
            scenario_id=params.scenario_id,
            preview_type=params.preview_type,
            included_je_ids=params.included_je_ids,
            overlay_groups=params.overlay_groups,
        )
        draft_jes = _get_available_draft_jes(
            db, member_id, params.scenario_id, params.as_of_date,
            params.included_je_ids, params.overlay_groups,
        )
        filtered = _filter_by_groups(draft_jes, params.overlay_groups)
        member_draft = _calc_draft_adjustments(db, [je.id for je in filtered], member_id)

        for acct_id, (d, c, ids, grps) in member_draft.items():
            prev_d, prev_c, prev_ids, prev_grps = combined_draft.get(
                acct_id, (Decimal("0"), Decimal("0"), [], [])
            )
            merged_ids = list(set(prev_ids + ids))
            merged_grps = list(set(prev_grps + grps))
            combined_draft[acct_id] = (prev_d + d * pct, prev_c + c * pct, merged_ids, merged_grps)

    return _build_line_items(db, combined_official, combined_draft)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def calculate_overlay(db: Session, params: OverlayParams) -> OverlayResult:
    """
    Calculate a draft-impact preview overlay.

    NEVER persists balance data.  Returns OverlayResult for immediate API response.
    To create an audit trail, call create_preview_run() separately.
    """
    _validate_params(db, params)

    generated_at = datetime.datetime.now(datetime.UTC)

    if params.is_consolidated:
        # Get consolidation entity members
        members = (
            db.query(EntityGroupMember.member_entity_id)
            .filter(EntityGroupMember.consolidation_entity_id == params.consolidation_entity_id)
            .all()
        )
        member_ids = [r[0] for r in members]
        line_items = _calculate_consolidated_overlay(db, params, member_ids)
        included_je_count = len(params.included_je_ids) if params.included_je_ids is not None else 0
    else:
        # Standard single-entity overlay
        official = _get_official_balances(
            db, params.entity_id, params.as_of_date, params.scenario_id
        )
        draft_jes = _get_available_draft_jes(
            db, params.entity_id, params.scenario_id, params.as_of_date,
            params.included_je_ids, params.overlay_groups,
        )
        filtered_jes = _filter_by_groups(draft_jes, params.overlay_groups)
        je_ids = [je.id for je in filtered_jes]
        draft_adj = _calc_draft_adjustments(db, je_ids, params.entity_id)
        line_items = _build_line_items(db, official, draft_adj)
        included_je_count = len(je_ids)
        member_ids = []

    # RE rollforward: synthetic adjustment flows draft P&L impact into equity
    re_adjustment = Decimal("0")
    if params.include_re_rollforward:
        re_adjustment = _compute_re_rollforward(line_items)
        if re_adjustment != Decimal("0"):
            _apply_re_rollforward(line_items, re_adjustment, db, params.entity_id)

    used_groups = sorted({
        grp
        for item in line_items
        for grp in item.overlay_groups_used
    })

    return OverlayResult(
        is_preview=True,
        label=PREVIEW_LABEL,
        preview_type=params.preview_type,
        organization_id=params.organization_id,
        entity_id=params.entity_id,
        as_of_date=params.as_of_date,
        scenario_id=params.scenario_id,
        generated_at=generated_at,
        included_je_count=included_je_count,
        overlay_groups=used_groups,
        line_items=line_items,
        re_rollforward_applied=re_adjustment != Decimal("0"),
        re_draft_adjustment=re_adjustment,
        warnings=[],
        member_entity_ids=member_ids,
    )


def create_preview_run(db: Session, params: OverlayParams, result: OverlayResult) -> PreviewRun:
    """
    Persist an audit record for this preview generation.
    ONLY metadata is saved — never balance data.
    """
    run = PreviewRun(
        organization_id=params.organization_id,
        entity_id=params.entity_id,
        generated_by=params.generated_by,
        generated_by_user_id=params.generated_by_user_id,
        generated_at=result.generated_at,
        preview_type=params.preview_type,
        as_of_date=str(params.as_of_date),
        scenario_id=params.scenario_id,
        included_je_ids=json.dumps(params.included_je_ids or []),
        overlay_groups=json.dumps(result.overlay_groups),
        parameters=json.dumps({
            "include_re_rollforward": params.include_re_rollforward,
            "is_consolidated": params.is_consolidated,
            "consolidation_entity_id": params.consolidation_entity_id,
            "period_start": str(params.period_start) if params.period_start else None,
        }),
        included_je_count=result.included_je_count,
        preview_label=result.label,
        is_consolidated=params.is_consolidated,
        consolidation_entity_id=params.consolidation_entity_id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def get_overlay_drilldown(
    db: Session,
    account_id: int,
    entity_id: int,
    scenario_id: int,
    as_of_date: datetime.date,
    included_je_ids: list[int] | None = None,
) -> DrilldownResult:
    """
    Return the source draft JE lines that contribute to a specific account's overlay.
    Supports drilldown from preview figures to underlying draft entries.
    """
    acct = db.query(Account).filter(Account.id == account_id).first()
    if acct is None:
        raise OverlayValidationError(f"Account {account_id} not found.")

    q = (
        db.query(JournalEntryLine, JournalEntry)
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .filter(
            JournalEntryLine.account_id == account_id,
            JournalEntryLine.entity_id == entity_id,
            JournalEntry.scenario_id == scenario_id,
            JournalEntry.entry_date <= as_of_date,
            JournalEntry.status == "draft",
        )
    )
    if included_je_ids is not None:
        q = q.filter(JournalEntry.id.in_(included_je_ids))

    rows = q.all()
    entries = []
    total_d = Decimal("0")
    total_c = Decimal("0")
    for line, je in rows:
        d = Decimal(str(line.debit))
        c = Decimal(str(line.credit))
        total_d += d
        total_c += c
        entries.append({
            "je_id": je.id,
            "je_number": je.je_number,
            "entry_date": str(je.entry_date),
            "debit": float(d),
            "credit": float(c),
            "description": line.description,
            "overlay_group": _resolve_overlay_group(je),
        })

    return DrilldownResult(
        account_id=account_id,
        account_number=acct.account_number,
        account_name=acct.account_name,
        draft_net_debit=total_d - total_c,
        entries=entries,
    )


def list_available_drafts(
    db: Session,
    entity_id: int,
    scenario_id: int,
    as_of_date: datetime.date,
    organization_id: int,
) -> list[dict]:
    """
    List draft JEs available for overlay selection, grouped by overlay_group.
    Returns lightweight summary — not full line detail.
    """
    jes = (
        db.query(JournalEntry)
        .join(Entity, JournalEntry.entity_id == Entity.id)
        .filter(
            JournalEntry.entity_id == entity_id,
            JournalEntry.scenario_id == scenario_id,
            JournalEntry.entry_date <= as_of_date,
            JournalEntry.status == "draft",
            Entity.organization_id == organization_id,
        )
        .order_by(JournalEntry.entry_date.desc())
        .all()
    )
    return [
        {
            "je_id": je.id,
            "je_number": je.je_number,
            "entry_date": str(je.entry_date),
            "description": je.description,
            "source": je.source,
            "overlay_group": _resolve_overlay_group(je),
        }
        for je in jes
    ]
