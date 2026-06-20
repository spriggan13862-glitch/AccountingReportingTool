"""
FSLI Mappings — entity+view scoped account-to-taxonomy-line resolution.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import (
    FsliBulkAssignRequest,
    FsliBulkAssignResult,
    FsliCopyFromViewResult,
    FsliEffectiveMapping,
    FsliMappingOut,
    FsliMappingUpsert,
    FsliMigrationResult,
    FsliPropagateRequest,
    FsliPropagateResult,
)
from app.models.account import Account
from app.models.reporting_taxonomy import ReportingTaxonomyLine
from app.models.view_account_override import ViewAccountOverride
from app.services.fsli_mapping_service import (
    bulk_assign_fsli,
    bulk_migrate_from_account_field,
    copy_fsli_mappings_from_view,
    delete_fsli_mapping,
    get_effective_fsli_for_all_accounts,
    list_fsli_mappings,
    propagate_fsli_to_children,
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
    locked = getattr(body, 'locked', None)
    override = upsert_fsli_mapping(entity_id, view_id, account_id, body.taxonomy_line_id, db, locked=locked)
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


@router.get("/{entity_id}/{view_id}/with-inheritance", response_model=list[FsliEffectiveMapping])
def list_with_inheritance(
    entity_id: int,
    view_id: int,
    db: Session = Depends(get_db),
):
    rows = get_effective_fsli_for_all_accounts(entity_id, view_id, db)
    return [FsliEffectiveMapping(**row) for row in rows]


@router.post(
    "/{entity_id}/{view_id}/propagate/{parent_account_id}",
    response_model=FsliPropagateResult,
)
def propagate_to_children(
    entity_id: int,
    view_id: int,
    parent_account_id: int,
    body: FsliPropagateRequest,
    db: Session = Depends(get_db),
):
    parent = db.query(Account).get(parent_account_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Account not found")
    if parent.entity_id != entity_id:
        raise HTTPException(status_code=400, detail="Account does not belong to this entity")

    count, updated_ids = propagate_fsli_to_children(
        parent_account_id,
        entity_id,
        view_id,
        body.taxonomy_line_id,
        db,
        body.overwrite_existing,
    )
    return FsliPropagateResult(propagated_count=count, accounts_updated=updated_ids)


@router.post(
    "/{entity_id}/{target_view_id}/copy-from/{source_view_id}",
    response_model=FsliCopyFromViewResult,
)
def copy_from_view(
    entity_id: int,
    target_view_id: int,
    source_view_id: int,
    db: Session = Depends(get_db),
):
    copied = copy_fsli_mappings_from_view(entity_id, target_view_id, source_view_id, db)
    return FsliCopyFromViewResult(copied=copied)


@router.post(
    "/{entity_id}/{view_id}/bulk-assign",
    response_model=FsliBulkAssignResult,
)
def bulk_assign(
    entity_id: int,
    view_id: int,
    body: FsliBulkAssignRequest,
    db: Session = Depends(get_db),
):
    updated = bulk_assign_fsli(entity_id, view_id, body.account_ids, body.taxonomy_line_id, db)
    return FsliBulkAssignResult(updated=updated)
