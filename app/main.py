from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

import app.models  # noqa: F401 — registers all models with Base.metadata
from app.database import Base, engine
from app.api.routers import (
    accounting_periods,
    accounts,
    consolidation,
    documents,
    entities,
    fs_reporting,
    journal_entries,
    organizations,
    report_runs,
    reporting,
    tb_import,
    users,
    workflow,
)
from app.services.accounting_period_service import (
    PeriodAlreadyClosedError,
    PeriodNotFoundError,
)
from app.services.journal_entry_service import (
    ClosedPeriodError,
    ImmutableEntryError,
    JournalEntryNotFoundError,
    JournalEntryValidationError,
)
from app.services.accounting_period_service import BlockedByCriticalIssueError
from app.services.permission_service import OrganizationAccessError, PermissionDeniedError
from app.services.tb_import_service import TbImportError
from app.services.workflow_service import (
    ReviewerSeparationError,
    ReviewSignoffStateError,
    WorkflowTaskStateError,
    WorkflowValidationError,
)
from app.services.report_service import (
    ReportRunNotFoundError,
    ReportRunStateError,
    ReportValidationError,
)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Accounting Tool", version="0.1.0")

# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------

@app.exception_handler(JournalEntryValidationError)
async def je_validation_handler(request: Request, exc: JournalEntryValidationError):
    result = exc.result
    return JSONResponse(
        status_code=400,
        content={
            "detail": str(exc),
            "validation": {
                "success": False,
                "errors": [i.to_dict() for i in result.errors],
                "warnings": [i.to_dict() for i in result.warnings],
                "info": [i.to_dict() for i in result.infos],
            },
        },
    )


@app.exception_handler(ImmutableEntryError)
async def immutable_entry_handler(request: Request, exc: ImmutableEntryError):
    return JSONResponse(status_code=409, content={"detail": str(exc)})


@app.exception_handler(JournalEntryNotFoundError)
async def je_not_found_handler(request: Request, exc: JournalEntryNotFoundError):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(TbImportError)
async def tb_import_error_handler(request: Request, exc: TbImportError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(ClosedPeriodError)
async def closed_period_handler(request: Request, exc: ClosedPeriodError):
    return JSONResponse(status_code=409, content={"detail": str(exc)})


@app.exception_handler(PeriodAlreadyClosedError)
async def period_already_closed_handler(request: Request, exc: PeriodAlreadyClosedError):
    return JSONResponse(status_code=409, content={"detail": str(exc)})


@app.exception_handler(PeriodNotFoundError)
async def period_not_found_handler(request: Request, exc: PeriodNotFoundError):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(PermissionDeniedError)
async def permission_denied_handler(request: Request, exc: PermissionDeniedError):
    return JSONResponse(status_code=403, content={"detail": str(exc)})


@app.exception_handler(OrganizationAccessError)
async def org_access_error_handler(request: Request, exc: OrganizationAccessError):
    return JSONResponse(status_code=403, content={"detail": str(exc)})


@app.exception_handler(BlockedByCriticalIssueError)
async def blocked_by_issue_handler(request: Request, exc: BlockedByCriticalIssueError):
    return JSONResponse(status_code=409, content={"detail": str(exc)})


@app.exception_handler(ReviewerSeparationError)
async def reviewer_separation_handler(request: Request, exc: ReviewerSeparationError):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(WorkflowTaskStateError)
async def task_state_handler(request: Request, exc: WorkflowTaskStateError):
    return JSONResponse(status_code=409, content={"detail": str(exc)})


@app.exception_handler(ReviewSignoffStateError)
async def signoff_state_handler(request: Request, exc: ReviewSignoffStateError):
    return JSONResponse(status_code=409, content={"detail": str(exc)})


@app.exception_handler(WorkflowValidationError)
async def workflow_validation_handler(request: Request, exc: WorkflowValidationError):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(ReportRunNotFoundError)
async def report_run_not_found_handler(request: Request, exc: ReportRunNotFoundError):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(ReportRunStateError)
async def report_run_state_handler(request: Request, exc: ReportRunStateError):
    return JSONResponse(status_code=409, content={"detail": str(exc)})


@app.exception_handler(ReportValidationError)
async def report_validation_handler(request: Request, exc: ReportValidationError):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

API_PREFIX = "/api/v1"

app.include_router(entities.router, prefix=API_PREFIX)
app.include_router(accounts.router, prefix=API_PREFIX)
app.include_router(journal_entries.router, prefix=API_PREFIX)
app.include_router(tb_import.router, prefix=API_PREFIX)
app.include_router(reporting.router, prefix=API_PREFIX)
app.include_router(fs_reporting.router, prefix=API_PREFIX)
app.include_router(consolidation.router, prefix=API_PREFIX)
app.include_router(accounting_periods.router, prefix=API_PREFIX)
app.include_router(organizations.router, prefix=API_PREFIX)
app.include_router(users.router, prefix=API_PREFIX)
app.include_router(documents.router, prefix=API_PREFIX)
app.include_router(workflow.router, prefix=API_PREFIX)
app.include_router(report_runs.router, prefix=API_PREFIX)


@app.get("/health")
def health_check():
    return {"status": "ok"}
