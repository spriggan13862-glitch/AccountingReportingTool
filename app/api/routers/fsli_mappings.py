"""
FSLI Mappings — entity+view scoped account-to-taxonomy-line resolution.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import FsliMappingOut, FsliMappingUpsert, FsliMigrationResult
from app.models.account import Account
from app.models.reporting_taxonomy import ReportingTaxonomyLine
from app.models.view_account_override import ViewAccountOverride
from app.services.fsli_mapping_service import (
    bulk_migrate_from_account_field,
    delete_fsli_mapping,
    list_fsli_mappings,
    upsert_fsli_mapping,
)

router = APIRouter(prefix="/fsli-mappings", tags=["fsli-mappings"])


def _enrich(override: ViewAccountOverride, db: Session) -> FsliMappingOut:
    account = db.query(Account).get(override.account_id)
    tax_line = (
        db.query(ReportingTaxonomyLine).get(override.taxonomy_line_id)
        if override.taxonomy_line_id
        else None
    )
    return FsliMappingOut(
        entity_id=override.entity_id,
        view_id=override.view_id,
        account_id=override.account_id,
        taxonomy_line_id=override.taxonomy_line_id,
        display_label=override.display_label,
        account_number=account.account_number if account else "",
        account_name=account.account_name if account else "",
        taxonomy_line_name=tax_line.name if tax_line else None,
    )


@router.get("/", response_model=list[FsliMappingOut])
def list_mappings(
    entity_id: int = Query(...),
    view_id: int = Query(...),
    db: Session = Depends(get_db),
):
    overrides = list_fsli_mappings(entity_id, view_id, db)
    return [_enrich(o, db) for o in overrides]


@router.put("/{entity_id}/{view_id}/{account_id}", response_model=FsliMappingOut)
def upsert_mapping(
    entity_id: int,
    view_id: int,
    account_id: int,
    body: FsliMappingUpsert,
    db: Session = Depends(get_db),
):
    account = db.query(Account).get(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.entity_id != entity_id:
        raise HTTPException(status_code=400, detail="Account does not belong to this entity")
    override = upsert_fsli_mapping(entity_id, view_id, account_id, body.taxonomy_line_id, db)
    return _enrich(override, db)


@router.delete("/{entity_id}/{view_id}/{account_id}", status_code=204)
def remove_mapping(
    entity_id: int,
    view_id: int,
    account_id: int,
    db: Session = Depends(get_db),
):
    deleted = delete_fsli_mapping(entity_id, view_id, account_id, db)
    if not deleted:
        raise HTTPException(status_code=404, detail="Mapping not found")


@router.post("/{entity_id}/{view_id}/migrate-from-accounts", response_model=FsliMigrationResult)
def migrate_from_accounts(
    entity_id: int,
    view_id: int,
    db: Session = Depends(get_db),
):
    migrated = bulk_migrate_from_account_field(entity_id, view_id, db)
    return FsliMigrationResult(migrated=migrated)
