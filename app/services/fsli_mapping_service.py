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
        db.commit()
        db.refresh(existing)
        return existing

    override = ViewAccountOverride(
        entity_id=entity_id,
        view_id=view_id,
        account_id=account_id,
        taxonomy_line_id=taxonomy_line_id,
        created_by=created_by,
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
