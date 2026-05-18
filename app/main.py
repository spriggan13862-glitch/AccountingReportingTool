from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

import app.models  # noqa: F401 — registers all models with Base.metadata
from app.database import Base, engine
from app.api.routers import (
    accounting_periods,
    accounts,
    consolidation,
    entities,
    fs_reporting,
    journal_entries,
    reporting,
    tb_import,
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
from app.services.tb_import_service import TbImportError

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


@app.get("/health")
def health_check():
    return {"status": "ok"}
