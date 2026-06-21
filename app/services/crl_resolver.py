"""
CRL Resolver — the precedence chain that maps an Account to its CRL.

Per the architecture v2 spec (§4 step 4 dual-read precedence):

  1. accounts.common_reporting_line_id  (canonical CRL path — preferred)
  2. AccountTaxonomyMapping             (Sprint O override; advanced users)
  3. accounts.reporting_taxonomy_line_id (legacy)

Resolution stops at the first non-NULL link and returns the CRL. Steps
2 and 3 reverse-lookup the CRL via the
common_reporting_line_taxonomy_nodes junction (one-to-many supported
per the final requirement).

A NULL return means no CRL is wired — caller (FS engine, wizard,
backfill) decides whether to flag NEEDS_REVIEW or leave as
UNCLASSIFIED.

This module is read-only. Mutations live in crl_service.update_crl()
and the CRL-C save/apply endpoints.
"""
from __future__ import annotations
from typing import Iterable
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.common_reporting_line import (
    CommonReportingLine,
    CommonReportingLineTaxonomyNode,
)
from app.models.taxonomy import AccountTaxonomyMapping, TaxonomyNode
from app.models.reporting_taxonomy import ReportingTaxonomyLine


# ---------------------------------------------------------------------------
# Single-account resolver
# ---------------------------------------------------------------------------

def resolve_crl_for_account(
    db: Session,
    account: Account,
    organization_id: int | None = None,
) -> CommonReportingLine | None:
    """
    Return the CRL for this account, traversing the precedence chain.
    organization_id lets the resolver prefer an org-specific CRL clone
    over a system row of the same code.
    """
    # 1. Direct CRL link on the Account (canonical path)
    if account.common_reporting_line_id is not None:
        crl = db.query(CommonReportingLine).filter_by(
            id=account.common_reporting_line_id,
        ).first()
        if crl is not None:
            return _prefer_org_clone(db, crl, organization_id)

    # 2. AccountTaxonomyMapping (Sprint O) -> reverse-lookup CRL by taxonomy node code
    sprint_o = db.query(AccountTaxonomyMapping).filter_by(
        account_id=account.id,
    ).first()
    if sprint_o is not None:
        node = db.query(TaxonomyNode).filter_by(id=sprint_o.taxonomy_node_id).first()
        if node is not None:
            crl = _crl_for_taxonomy_code(db, node.code, organization_id)
            if crl is not None:
                return crl

    # 3. Legacy Account.reporting_taxonomy_line_id
    if account.reporting_taxonomy_line_id is not None:
        legacy_line = db.query(ReportingTaxonomyLine).filter_by(
            id=account.reporting_taxonomy_line_id,
        ).first()
        if legacy_line is not None:
            crl = _crl_for_taxonomy_code(db, legacy_line.code, organization_id)
            if crl is not None:
                return crl

    return None


def resolve_crl_id_for_account(
    db: Session,
    account: Account,
    organization_id: int | None = None,
) -> int | None:
    """Convenience: just the id, or None."""
    crl = resolve_crl_for_account(db, account, organization_id=organization_id)
    return crl.id if crl else None


# ---------------------------------------------------------------------------
# Bulk resolver — N accounts in 4 queries instead of N
# ---------------------------------------------------------------------------

def resolve_crl_map(
    db: Session,
    accounts: Iterable[Account],
    organization_id: int | None = None,
) -> dict[int, CommonReportingLine | None]:
    """
    Bulk version: returns {account_id: CRL | None} for every account.
    Used by FS aggregation (avoids N+1 queries).
    """
    accounts = list(accounts)
    if not accounts:
        return {}

    account_ids = [a.id for a in accounts]
    result: dict[int, CommonReportingLine | None] = {a.id: None for a in accounts}

    # 1. Direct links — single batched query
    direct_links: dict[int, int] = {}  # account_id -> crl_id
    for a in accounts:
        if a.common_reporting_line_id is not None:
            direct_links[a.id] = a.common_reporting_line_id
    if direct_links:
        crls_by_id = {
            c.id: c for c in db.query(CommonReportingLine).filter(
                CommonReportingLine.id.in_(set(direct_links.values()))
            ).all()
        }
        for aid, crl_id in direct_links.items():
            crl = crls_by_id.get(crl_id)
            if crl is not None:
                result[aid] = _prefer_org_clone(db, crl, organization_id)

    # 2. Sprint O mappings — batched
    sprint_o_unresolved = [a.id for a in accounts if result[a.id] is None]
    if sprint_o_unresolved:
        sprint_o_rows = db.query(AccountTaxonomyMapping).filter(
            AccountTaxonomyMapping.account_id.in_(sprint_o_unresolved)
        ).all()
        if sprint_o_rows:
            node_ids = {r.taxonomy_node_id for r in sprint_o_rows}
            nodes_by_id = {
                n.id: n for n in db.query(TaxonomyNode).filter(
                    TaxonomyNode.id.in_(node_ids)
                ).all()
            }
            for r in sprint_o_rows:
                node = nodes_by_id.get(r.taxonomy_node_id)
                if node is None:
                    continue
                crl = _crl_for_taxonomy_code(db, node.code, organization_id)
                if crl is not None and result[r.account_id] is None:
                    result[r.account_id] = crl

    # 3. Legacy reporting_taxonomy_line_id — batched
    legacy_unresolved = [
        a for a in accounts
        if result[a.id] is None and a.reporting_taxonomy_line_id is not None
    ]
    if legacy_unresolved:
        legacy_ids = {a.reporting_taxonomy_line_id for a in legacy_unresolved}
        legacy_lines = {
            l.id: l for l in db.query(ReportingTaxonomyLine).filter(
                ReportingTaxonomyLine.id.in_(legacy_ids)
            ).all()
        }
        for a in legacy_unresolved:
            line = legacy_lines.get(a.reporting_taxonomy_line_id)
            if line is None:
                continue
            crl = _crl_for_taxonomy_code(db, line.code, organization_id)
            if crl is not None:
                result[a.id] = crl

    return result


# ---------------------------------------------------------------------------
# State derivation
# ---------------------------------------------------------------------------

def derive_crl_state_for_account(account: Account, crl: CommonReportingLine | None) -> str:
    """
    Per the architecture: no posted account has NULL crl_state.
    Maps the resolved CRL into the canonical state string used on
    accounts.crl_state.

      crl_state = 'assigned'        CRL is a real classification
      crl_state = 'needs_review'    CRL points to the NEEDS_REVIEW sentinel
      crl_state = 'unclassified'    CRL is missing or points to UNCLASSIFIED sentinel
    """
    if crl is None:
        return "unclassified"
    if crl.code == "CRL_NEEDS_REVIEW":
        return "needs_review"
    if crl.code == "CRL_UNCLASSIFIED":
        return "unclassified"
    return "assigned"


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------

def _crl_for_taxonomy_code(
    db: Session,
    taxonomy_node_code: str,
    organization_id: int | None,
) -> CommonReportingLine | None:
    """
    Reverse-lookup: given a TaxonomyNode code, which CRL maps to it?
    The junction supports one-to-many, so a single node code can be
    referenced by multiple CRLs (e.g. CASH appears under CRL_CASH for
    SMB and could be under a future CRL_RESTRICTED_CASH for a more
    granular taxonomy variant). We prefer the entry flagged is_primary.
    """
    rows = (
        db.query(CommonReportingLineTaxonomyNode, CommonReportingLine)
        .join(
            CommonReportingLine,
            CommonReportingLine.id == CommonReportingLineTaxonomyNode.crl_id,
        )
        .filter(CommonReportingLineTaxonomyNode.taxonomy_node_code == taxonomy_node_code)
        .all()
    )
    if not rows:
        return None
    # Prefer org-specific over system
    if organization_id is not None:
        for junction, crl in rows:
            if crl.organization_id == organization_id and junction.is_primary:
                return crl
        for junction, crl in rows:
            if crl.organization_id == organization_id:
                return crl
    # Prefer is_primary among system rows
    for junction, crl in rows:
        if junction.is_primary and crl.organization_id is None:
            return crl
    for junction, crl in rows:
        if crl.organization_id is None:
            return crl
    return rows[0][1]


def _prefer_org_clone(
    db: Session,
    system_crl: CommonReportingLine,
    organization_id: int | None,
) -> CommonReportingLine:
    """If the org has cloned this CRL for customization, prefer the clone."""
    if organization_id is None or system_crl.organization_id == organization_id:
        return system_crl
    clone = (
        db.query(CommonReportingLine)
        .filter_by(code=system_crl.code, organization_id=organization_id)
        .first()
    )
    return clone or system_crl
