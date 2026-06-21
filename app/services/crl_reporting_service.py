"""
CRL Reporting service — CRL-G / P5 read path.

Rolls the trial balance up to the Common Reporting Line layer (instead
of going straight to the taxonomy or the legacy reporting_taxonomy_lines).
Mirrors the shape of fs_reporting_service.FsLineBalance so the frontend
can reuse the same rendering primitives.

Pipeline:
  1. get_trial_balance(...) — same source of truth as every other FS path
  2. resolve_crl_map(accounts) — bulk precedence-chain resolution
  3. accumulate per-CRL net_debit + display sign (sign-flip for
     credit-normal balances)
  4. roll children into parents (parent_crl_id hierarchy)
  5. optionally filter by reporting template membership
"""
from __future__ import annotations
import datetime
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Sequence

from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.common_reporting_line import (
    CommonReportingLine,
    ReportingTemplate,
    ReportingTemplateCrl,
)
from app.services.crl_resolver import resolve_crl_map
from app.services.crl_service import get_crl_by_code
from app.services.reporting_service import get_trial_balance


# Statement-type filters supported on the endpoint surface.
STATEMENT_TYPE_BALANCE_SHEET = "Balance Sheet"
STATEMENT_TYPE_INCOME_STATEMENT = "Income Statement"
STATEMENT_TYPE_CASH_FLOW = "Cash Flow"


# Sections whose normal_balance is credit — display flips sign so revenue,
# liabilities, equity show as positive in the rendered statement.
_CREDIT_NORMAL_SECTIONS = {
    "Liabilities", "Equity", "Revenue",
    "Other Income / Expense",  # net of other income - other expense
}


@dataclass
class CrlStatementRow:
    crl_id: int
    crl_code: str
    crl_name: str
    section: str
    statement_type: str
    parent_crl_id: int | None
    normal_balance: str | None
    sort_order: int
    is_mandatory: bool
    is_system: bool
    depth: int
    account_count: int
    # own_signed_balance = accounts mapped directly to this CRL
    own_signed_balance: Decimal
    # total_signed_balance = own + recursive sum of children's totals
    total_signed_balance: Decimal
    # display_balance = total_signed_balance, with sign flipped for
    # credit-normal sections so the rendered statement shows positives
    display_balance: Decimal


@dataclass
class CrlStatement:
    rows: list[CrlStatementRow]
    # Diagnostic counters surfaced in the response banner.
    total_accounts: int
    classified_accounts: int          # account had a CRL via direct/sprint-o/legacy
    unclassified_accounts: int        # routed to CRL_UNCLASSIFIED sentinel
    needs_review_accounts: int        # routed to CRL_NEEDS_REVIEW sentinel
    accounts_outside_template: int    # CRL exists but not in active template
    template_id: int | None = None
    statement_type: str | None = None
    # Sections present in the response, in display order.
    sections: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_crl_statement(
    db: Session,
    *,
    entity_id: int,
    as_of_date: datetime.date,
    scenario_ids: Sequence[int],
    statement_type: str | None = None,
    organization_id: int | None = None,
    template_id: int | None = None,
    source_filter: Sequence[str] | None = None,
) -> CrlStatement:
    """
    Roll the trial balance up to the CRL layer.

    statement_type
        'Balance Sheet' | 'Income Statement' | 'Cash Flow' | None for all.
    template_id
        When set, suggestions outside the template fall into
        accounts_outside_template counter; the rows in `rows` are
        filtered to the template's visible CRLs (mandatory CRLs always
        included so unclassified/needs-review remain visible).
    """
    tb_rows = get_trial_balance(
        db, entity_id, as_of_date, scenario_ids, source_filter=source_filter,
    )

    # Bulk-load Account ORM rows so the resolver has access to the
    # *_id fields. tb_rows holds just denormalized data.
    account_ids = [r.account_id for r in tb_rows]
    if not account_ids:
        return CrlStatement(
            rows=[], total_accounts=0, classified_accounts=0,
            unclassified_accounts=0, needs_review_accounts=0,
            accounts_outside_template=0, template_id=template_id,
            statement_type=statement_type,
        )

    accounts = db.query(Account).filter(Account.id.in_(account_ids)).all()
    crl_map = resolve_crl_map(db, accounts, organization_id=organization_id)

    # Mandatory sentinels — every account ends up at one of these if
    # the resolver returned None.
    unclassified = get_crl_by_code(db, "CRL_UNCLASSIFIED", organization_id)
    needs_review = get_crl_by_code(db, "CRL_NEEDS_REVIEW", organization_id)

    # Aggregate per-CRL own balance + per-CRL account count
    own_by_crl_id: dict[int, Decimal] = {}
    accts_by_crl_id: dict[int, int] = {}
    unclassified_n = 0
    needs_review_n = 0
    classified_n = 0

    tb_by_account_id = {r.account_id: r for r in tb_rows}
    for acct in accounts:
        crl = crl_map.get(acct.id)
        is_sentinel = False
        if crl is None:
            crl = unclassified
            unclassified_n += 1
            is_sentinel = True
        elif unclassified is not None and crl.code == unclassified.code:
            unclassified_n += 1
            is_sentinel = True
        elif needs_review is not None and crl.code == needs_review.code:
            needs_review_n += 1
            is_sentinel = True
        if not is_sentinel:
            classified_n += 1

        if crl is None:
            continue  # sentinel not seeded — skip (shouldn't happen after CRL-B)

        tb = tb_by_account_id[acct.id]
        own_by_crl_id[crl.id] = own_by_crl_id.get(crl.id, Decimal("0")) + tb.net_debit
        accts_by_crl_id[crl.id] = accts_by_crl_id.get(crl.id, 0) + 1

    # Load the CRL rows we need + their ancestors so we can roll up.
    used_ids = set(own_by_crl_id.keys())
    crl_rows_by_id = _load_crls_with_ancestors(db, used_ids)

    # Filter by statement_type
    if statement_type is not None:
        filtered_ids = {
            c.id for c in crl_rows_by_id.values()
            if c.statement_type == statement_type
        }
        # When filtering by IS/BS, drop balances from accounts whose CRL
        # is on a different statement so we don't bleed across types.
        own_by_crl_id = {k: v for k, v in own_by_crl_id.items() if k in filtered_ids}
        accts_by_crl_id = {k: v for k, v in accts_by_crl_id.items() if k in filtered_ids}
        crl_rows_by_id = {
            cid: c for cid, c in crl_rows_by_id.items()
            if c.statement_type == statement_type
            or _has_descendant_in_filter(c, filtered_ids, crl_rows_by_id)
        }

    # Template filter — note accounts whose CRL falls outside the template
    # but keep mandatory sentinels visible no matter what.
    accounts_outside_template = 0
    template_crl_ids: set[int] | None = None
    if template_id is not None:
        template_crl_ids = _load_template_crl_ids(db, template_id)
        # Always include mandatory CRLs (Unclassified, Needs Review) so
        # status banners remain meaningful.
        if unclassified is not None:
            template_crl_ids.add(unclassified.id)
        if needs_review is not None:
            template_crl_ids.add(needs_review.id)
        for crl_id, n in accts_by_crl_id.items():
            if crl_id not in template_crl_ids:
                accounts_outside_template += n

    # Roll children into parents. Use depth-first walk so deepest
    # descendants flow upward through total_signed_balance.
    total_by_crl_id: dict[int, Decimal] = dict(own_by_crl_id)
    depth_by_id, ordered = _ordered_with_depth(crl_rows_by_id)
    # Process from deepest to shallowest so child totals are final by
    # the time their parent reads them.
    ordered_deep_first = sorted(ordered, key=lambda cid: -depth_by_id[cid])
    for crl_id in ordered_deep_first:
        crl = crl_rows_by_id[crl_id]
        if crl.parent_crl_id is None:
            continue
        parent_total = total_by_crl_id.get(crl.parent_crl_id, Decimal("0"))
        total_by_crl_id[crl.parent_crl_id] = parent_total + total_by_crl_id.get(crl_id, Decimal("0"))

    # Build output rows in display order (section, then sort_order, then code).
    rows: list[CrlStatementRow] = []
    for crl_id in ordered:
        crl = crl_rows_by_id[crl_id]
        if template_crl_ids is not None and crl.id not in template_crl_ids:
            continue
        own = own_by_crl_id.get(crl.id, Decimal("0"))
        total = total_by_crl_id.get(crl.id, Decimal("0"))
        # Skip CRLs that have no own balance AND no descendant balance —
        # otherwise the statement is cluttered with every catalog row.
        if own == 0 and total == 0 and accts_by_crl_id.get(crl.id, 0) == 0:
            # Always show mandatory sentinels so users see "0 unclassified"
            # confirmation rather than a missing row.
            if not crl.is_mandatory:
                continue
        rows.append(CrlStatementRow(
            crl_id=crl.id,
            crl_code=crl.code,
            crl_name=crl.name,
            section=crl.section,
            statement_type=crl.statement_type,
            parent_crl_id=crl.parent_crl_id,
            normal_balance=crl.normal_balance,
            sort_order=crl.sort_order,
            is_mandatory=crl.is_mandatory,
            is_system=crl.is_system,
            depth=depth_by_id[crl.id],
            account_count=accts_by_crl_id.get(crl.id, 0),
            own_signed_balance=own,
            total_signed_balance=total,
            display_balance=_display_balance(crl.section, total),
        ))

    rows.sort(key=lambda r: (_section_sort_key(r.section), r.sort_order, r.depth, r.crl_code))
    sections = []
    seen = set()
    for r in rows:
        if r.section not in seen:
            sections.append(r.section)
            seen.add(r.section)

    return CrlStatement(
        rows=rows,
        total_accounts=len(accounts),
        classified_accounts=classified_n,
        unclassified_accounts=unclassified_n,
        needs_review_accounts=needs_review_n,
        accounts_outside_template=accounts_outside_template,
        template_id=template_id,
        statement_type=statement_type,
        sections=sections,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_crls_with_ancestors(
    db: Session, used_ids: set[int],
) -> dict[int, CommonReportingLine]:
    """Load every used CRL + all of its parent ancestors so rollup works."""
    if not used_ids:
        return {}
    out: dict[int, CommonReportingLine] = {}
    pending = set(used_ids)
    while pending:
        rows = db.query(CommonReportingLine).filter(
            CommonReportingLine.id.in_(pending),
        ).all()
        out.update({r.id: r for r in rows})
        next_pending = set()
        for r in rows:
            if r.parent_crl_id is not None and r.parent_crl_id not in out:
                next_pending.add(r.parent_crl_id)
        pending = next_pending
    return out


def _load_template_crl_ids(db: Session, template_id: int) -> set[int]:
    rows = (
        db.query(ReportingTemplateCrl.crl_id)
        .filter(
            ReportingTemplateCrl.template_id == template_id,
            ReportingTemplateCrl.is_visible.is_(True),
        )
        .all()
    )
    return {r[0] for r in rows}


def _ordered_with_depth(
    crl_rows_by_id: dict[int, CommonReportingLine],
) -> tuple[dict[int, int], list[int]]:
    """Compute depth for each CRL (root = 0) and a stable traversal order."""
    depth: dict[int, int] = {}

    def d(crl_id: int) -> int:
        if crl_id in depth:
            return depth[crl_id]
        crl = crl_rows_by_id.get(crl_id)
        if crl is None or crl.parent_crl_id is None or crl.parent_crl_id not in crl_rows_by_id:
            depth[crl_id] = 0
        else:
            depth[crl_id] = d(crl.parent_crl_id) + 1
        return depth[crl_id]

    ordered = sorted(crl_rows_by_id.keys(), key=lambda cid: (d(cid), cid))
    return depth, ordered


def _has_descendant_in_filter(
    crl: CommonReportingLine,
    keep_ids: set[int],
    crl_rows_by_id: dict[int, CommonReportingLine],
) -> bool:
    """True if any descendant of `crl` is in the keep set (preserves parents
    so the section header row survives when only sub-lines are in scope)."""
    for c in crl_rows_by_id.values():
        if c.parent_crl_id == crl.id and (c.id in keep_ids
                                          or _has_descendant_in_filter(c, keep_ids, crl_rows_by_id)):
            return True
    return False


_SECTION_ORDER = [
    # Balance Sheet
    "Assets", "Liabilities", "Equity",
    # Income Statement
    "Revenue", "Cost of Revenue", "Operating Expenses",
    "Other Income / Expense", "Income Taxes",
    # Cash Flow
    "Operating Activities", "Investing Activities", "Financing Activities",
    # Misc
    "KPI", "Disclosure", "Sentinel",
]


def _section_sort_key(section: str) -> int:
    try:
        return _SECTION_ORDER.index(section)
    except ValueError:
        return 999


def _display_balance(section: str, signed_balance: Decimal) -> Decimal:
    """
    Flip sign for credit-normal sections so the rendered statement shows
    positives for revenue, liabilities, equity. Assets / expenses already
    display naturally as positive net-debit balances.
    """
    if section in _CREDIT_NORMAL_SECTIONS:
        return -signed_balance
    return signed_balance
