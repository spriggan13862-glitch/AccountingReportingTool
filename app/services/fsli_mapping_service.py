"""
FSLI mapping resolution: entity_id + view_id + account_id → taxonomy_line_id.
This is the canonical source of truth for account-to-FSLI mapping.
Account.reporting_taxonomy_line_id is a legacy fallback only.
"""
from __future__ import annotations

import datetime

from sqlalchemy.orm import Session

from app.models.view_account_override import ViewAccountOverride
from app.models.account import Account
from app.models.reporting_taxonomy import ReportingTaxonomyLine


def resolve_fsli(
    account_id: int,
    entity_id: int,
    view_id: int | None,
    db: Session,
) -> int | None:
    """Resolution chain:
    1. ViewAccountOverride for exact (entity_id, view_id, account_id)
    2. ViewAccountOverride for (None entity, view_id, account_id) — org-wide view default
    3. Account.reporting_taxonomy_line_id — legacy global fallback
    Returns taxonomy_line_id or None.
    """
    if view_id is not None:
        entity_override = (
            db.query(ViewAccountOverride)
            .filter_by(entity_id=entity_id, view_id=view_id, account_id=account_id)
            .first()
        )
        if entity_override is not None:
            return entity_override.taxonomy_line_id

        org_override = (
            db.query(ViewAccountOverride)
            .filter(
                ViewAccountOverride.entity_id.is_(None),
                ViewAccountOverride.view_id == view_id,
                ViewAccountOverride.account_id == account_id,
            )
            .first()
        )
        if org_override is not None:
            return org_override.taxonomy_line_id

    account = db.query(Account).get(account_id)
    if account is not None:
        return account.reporting_taxonomy_line_id
    return None


def upsert_fsli_mapping(
    entity_id: int,
    view_id: int,
    account_id: int,
    taxonomy_line_id: int | None,
    db: Session,
    created_by: str | None = None,
    locked: bool | None = None,
) -> ViewAccountOverride:
    """Create or update the FSLI mapping for entity+view+account."""
    existing = (
        db.query(ViewAccountOverride)
        .filter_by(entity_id=entity_id, view_id=view_id, account_id=account_id)
        .first()
    )
    if existing is not None:
        existing.taxonomy_line_id = taxonomy_line_id
        existing.updated_at = datetime.datetime.utcnow()
        if locked is not None:
            existing.locked = locked
        db.commit()
        db.refresh(existing)
        return existing

    override = ViewAccountOverride(
        entity_id=entity_id,
        view_id=view_id,
        account_id=account_id,
        taxonomy_line_id=taxonomy_line_id,
        created_by=created_by,
        locked=locked if locked is not None else False,
    )
    db.add(override)
    db.commit()
    db.refresh(override)
    return override


def delete_fsli_mapping(
    entity_id: int,
    view_id: int,
    account_id: int,
    db: Session,
) -> bool:
    """Remove a mapping. Returns True if deleted."""
    existing = (
        db.query(ViewAccountOverride)
        .filter_by(entity_id=entity_id, view_id=view_id, account_id=account_id)
        .first()
    )
    if existing is None:
        return False
    db.delete(existing)
    db.commit()
    return True


def list_fsli_mappings(
    entity_id: int,
    view_id: int,
    db: Session,
) -> list[ViewAccountOverride]:
    """All mappings for a given entity and view."""
    return (
        db.query(ViewAccountOverride)
        .filter_by(entity_id=entity_id, view_id=view_id)
        .all()
    )


def resolve_fsli_with_inheritance(
    account_id: int,
    entity_id: int,
    view_id: int | None,
    db: Session,
) -> tuple[int | None, str, int | None]:
    """
    Resolve FSLI taxonomy_line_id with parent inheritance.
    Returns (taxonomy_line_id, source, inherited_from_account_id) where source is:
      'explicit'    — this account has its own ViewAccountOverride
      'parent'      — inherited from direct parent account's mapping
      'grandparent' — inherited from ancestor further up the chain
      'legacy'      — from Account.reporting_taxonomy_line_id (old field)
      'none'        — unmapped

    Inheritance chain:
    1. Check ViewAccountOverride for (entity_id, view_id, account_id) — explicit
    2. Walk up parent_account_id chain — find nearest mapped ancestor
    3. Fall back to Account.reporting_taxonomy_line_id
    4. Return None, 'none', None if nothing found
    """
    if view_id is not None:
        explicit = (
            db.query(ViewAccountOverride)
            .filter_by(entity_id=entity_id, view_id=view_id, account_id=account_id)
            .first()
        )
        if explicit is not None:
            return explicit.taxonomy_line_id, 'explicit', None

    account = db.query(Account).get(account_id)
    if account is None:
        return None, 'none', None

    # Walk parent chain via parent_account_id FK and number prefix fallback
    visited: set[int] = {account_id}
    depth = 0
    current = account

    while True:
        parent_id: int | None = current.parent_account_id

        # If no FK parent, try to find one by number prefix
        if parent_id is None and current.account_number and '-' in current.account_number:
            prefix = current.account_number.rsplit('-', 1)[0]
            parent_by_prefix = (
                db.query(Account)
                .filter_by(entity_id=entity_id, account_number=prefix)
                .first()
            )
            if parent_by_prefix is not None:
                parent_id = parent_by_prefix.id

        if parent_id is None or parent_id in visited:
            break

        visited.add(parent_id)
        depth += 1

        if view_id is not None:
            parent_override = (
                db.query(ViewAccountOverride)
                .filter_by(entity_id=entity_id, view_id=view_id, account_id=parent_id)
                .first()
            )
            if parent_override is not None and parent_override.taxonomy_line_id is not None:
                source = 'parent' if depth == 1 else 'grandparent'
                return parent_override.taxonomy_line_id, source, parent_id

        parent_account = db.query(Account).get(parent_id)
        if parent_account is None:
            break
        current = parent_account

    # Legacy fallback
    if account.reporting_taxonomy_line_id is not None:
        return account.reporting_taxonomy_line_id, 'legacy', None

    return None, 'none', None


def get_effective_fsli_for_all_accounts(
    entity_id: int,
    view_id: int | None,
    db: Session,
) -> list[dict]:
    """
    Returns all accounts for an entity with their effective FSLI mapping,
    including inherited ones.
    """
    accounts = (
        db.query(Account)
        .filter(Account.entity_id == entity_id, Account.active.is_(True))
        .order_by(Account.account_number)
        .all()
    )

    # Preload all explicit overrides for this entity+view to avoid N+1 queries
    explicit_map: dict[int, int | None] = {}
    if view_id is not None:
        overrides = (
            db.query(ViewAccountOverride)
            .filter_by(entity_id=entity_id, view_id=view_id)
            .all()
        )
        for o in overrides:
            explicit_map[o.account_id] = o.taxonomy_line_id

    # Build account lookup by number for prefix-based parent resolution
    account_by_number: dict[str, Account] = {a.account_number: a for a in accounts}
    account_by_id: dict[int, Account] = {a.id: a for a in accounts}

    # Preload taxonomy line names
    tax_line_ids = set(explicit_map.values()) - {None}
    for a in accounts:
        if a.reporting_taxonomy_line_id:
            tax_line_ids.add(a.reporting_taxonomy_line_id)
    tax_lines: dict[int, str] = {}
    if tax_line_ids:
        rows = (
            db.query(ReportingTaxonomyLine)
            .filter(ReportingTaxonomyLine.id.in_(tax_line_ids))
            .all()
        )
        tax_lines = {r.id: r.name for r in rows}

    result = []
    for account in accounts:
        taxonomy_line_id, source, inherited_from_id = resolve_fsli_with_inheritance(
            account.id, entity_id, view_id, db
        )
        inherited_from_number: str | None = None
        if inherited_from_id is not None:
            inherited_acc = account_by_id.get(inherited_from_id)
            inherited_from_number = inherited_acc.account_number if inherited_acc else None

        result.append({
            'account_id': account.id,
            'account_number': account.account_number,
            'account_name': account.account_name,
            'taxonomy_line_id': taxonomy_line_id,
            'taxonomy_line_name': tax_lines.get(taxonomy_line_id) if taxonomy_line_id else None,
            'mapping_source': source,
            'inherited_from_account_id': inherited_from_id,
            'inherited_from_account_number': inherited_from_number,
        })

    return result


def propagate_fsli_to_children(
    parent_account_id: int,
    entity_id: int,
    view_id: int,
    taxonomy_line_id: int,
    db: Session,
    overwrite_existing: bool = False,
) -> tuple[int, list[int]]:
    """
    Assign taxonomy_line_id to all child accounts of parent_account_id
    that are currently unmapped (or all if overwrite_existing=True).

    Child detection: accounts where parent_account_id = parent_account_id
    OR where account_number starts with parent's account_number + delimiter.

    Returns (count, list of account_ids updated).
    """
    parent = db.query(Account).get(parent_account_id)
    if parent is None:
        return 0, []

    parent_num = parent.account_number
    delimiters = ('-', '.', ':')

    # Find children by FK or by number prefix
    all_entity_accounts = (
        db.query(Account)
        .filter(Account.entity_id == entity_id, Account.active.is_(True))
        .all()
    )

    children: list[Account] = []
    for acct in all_entity_accounts:
        if acct.id == parent_account_id:
            continue
        is_child = (acct.parent_account_id == parent_account_id) or any(
            acct.account_number.startswith(parent_num + d) for d in delimiters
        )
        if is_child:
            children.append(acct)

    existing_overrides = {
        row.account_id
        for row in db.query(ViewAccountOverride.account_id)
        .filter_by(entity_id=entity_id, view_id=view_id)
        .all()
    }

    updated_ids: list[int] = []
    for child in children:
        if not overwrite_existing and child.id in existing_overrides:
            continue
        upsert_fsli_mapping(entity_id, view_id, child.id, taxonomy_line_id, db)
        updated_ids.append(child.id)

    return len(updated_ids), updated_ids


def copy_fsli_mappings_from_view(
    entity_id: int,
    target_view_id: int,
    source_view_id: int,
    db: Session,
) -> int:
    """Copy all mappings from source_view_id to target_view_id for entity_id.
    Skips accounts already mapped in target view.
    Returns count of rows copied.
    """
    source_overrides = (
        db.query(ViewAccountOverride)
        .filter_by(entity_id=entity_id, view_id=source_view_id)
        .all()
    )
    existing_account_ids = {
        row.account_id
        for row in db.query(ViewAccountOverride.account_id)
        .filter_by(entity_id=entity_id, view_id=target_view_id)
        .all()
    }
    copied = 0
    for src in source_overrides:
        if src.account_id in existing_account_ids:
            continue
        override = ViewAccountOverride(
            entity_id=entity_id,
            view_id=target_view_id,
            account_id=src.account_id,
            taxonomy_line_id=src.taxonomy_line_id,
            display_label=src.display_label,
            locked=False,
        )
        db.add(override)
        copied += 1
    if copied:
        db.commit()
    return copied


def bulk_assign_fsli(
    entity_id: int,
    view_id: int,
    account_ids: list[int],
    taxonomy_line_id: int,
    db: Session,
) -> int:
    """Assign taxonomy_line_id to multiple accounts in one call.
    Skips accounts whose mapping is locked.
    Returns count of accounts updated.
    """
    locked_account_ids = {
        row.account_id
        for row in db.query(ViewAccountOverride.account_id)
        .filter_by(entity_id=entity_id, view_id=view_id)
        .filter(ViewAccountOverride.locked.is_(True))
        .all()
    }
    updated = 0
    for account_id in account_ids:
        if account_id in locked_account_ids:
            continue
        upsert_fsli_mapping(entity_id, view_id, account_id, taxonomy_line_id, db)
        updated += 1
    return updated


def bulk_migrate_from_account_field(
    entity_id: int,
    view_id: int,
    db: Session,
) -> int:
    """
    One-time migration: read Account.reporting_taxonomy_line_id for all accounts
    belonging to entity_id that have it set, and insert ViewAccountOverride rows
    for view_id. Skips accounts that already have an override for this view.
    Returns count of rows migrated.
    """
    accounts = (
        db.query(Account)
        .filter(
            Account.entity_id == entity_id,
            Account.reporting_taxonomy_line_id.isnot(None),
        )
        .all()
    )

    existing_account_ids = {
        row.account_id
        for row in db.query(ViewAccountOverride.account_id)
        .filter_by(entity_id=entity_id, view_id=view_id)
        .all()
    }

    migrated = 0
    for account in accounts:
        if account.id in existing_account_ids:
            continue
        override = ViewAccountOverride(
            entity_id=entity_id,
            view_id=view_id,
            account_id=account.id,
            taxonomy_line_id=account.reporting_taxonomy_line_id,
        )
        db.add(override)
        migrated += 1

    if migrated:
        db.commit()
    return migrated
