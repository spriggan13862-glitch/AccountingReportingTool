"""
Import Readiness API.

GET /import-readiness — returns readiness matrix for an entity+period.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import ImportReadinessStatus
from app.services.import_source_logic import get_readiness_status

router = APIRouter(prefix="/import-readiness", tags=["import-readiness"])


@router.get("/", response_model=ImportReadinessStatus)
def get_import_readiness_matrix(
    entity_id: int = Query(...),
    period_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    """Return the import readiness matrix for an entity, optionally scoped to a period."""
    result = get_readiness_status(entity_id=entity_id, period_id=period_id, db=db)
    return ImportReadinessStatus(**result)
