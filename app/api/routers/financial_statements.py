"""
Financial Statement Engine API — Milestone 20.

All endpoints serve live-calculated financial statements from posted ledger data.
No calculated balances are persisted. Overlay-adjusted endpoints return preview data only.
"""

import io
import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.schemas import (
    ReportDefinitionCreate,
    ReportDefinitionOut,
    ReportLineCreate,
    ReportLineOut,
    ReportColumnCreate,
    ReportColumnOut,
    CashFlowResultOut,
    CashFlowSectionOut,
    CashFlowLineOut,
    EquityStatementOut,
    EquityLineOut,
    FsValidationResultOut,
    ReportLineDrilldownOut,
    DrilldownAccountOut,
    DrilldownJeOut,
    TrendReportOut,
    TrendRowOut,
)
from app.models.report_definition import ReportDefinition, ReportLine, ReportColumn
from app.services.financial_statement_service import (
    build_cash_flow_statement,
    build_equity_statement,
    build_overlay_adjusted_fs,
    build_trend_report,
    get_report_line_drilldown,
    validate_financial_statements,
    TrendPeriod,
)
from app.services.draft_overlay_service import OverlayParams
from app.services.export_service import (
    build_watermarked_close_package,
    workbook_to_bytes,
)

router = APIRouter(prefix="/financial-statements", tags=["financial-statements"])


# ---------------------------------------------------------------------------
# Cash Flow
# ---------------------------------------------------------------------------

@router.get("/cash-flow", response_model=CashFlowResultOut)
def get_cash_flow(
    entity_id: int = Query(...),
    period_start: str = Query(...),
    period_end: str = Query(...),
    scenario_ids: str = Query(..., description="Comma-separated scenario IDs"),
    db: Session = Depends(get_db),
):
    import datetime
    try:
        ps = datetime.date.fromisoformat(period_start)
        pe = datetime.date.fromisoformat(period_end)
        sids = [int(x) for x in scenario_ids.split(",")]
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    result = build_cash_flow_statement(db, entity_id, ps, pe, sids)
    return _cf_to_out(result)


# ---------------------------------------------------------------------------
# Statement of Equity
# ---------------------------------------------------------------------------

@router.get("/equity", response_model=EquityStatementOut)
def get_equity_statement(
    entity_id: int = Query(...),
    period_start: str = Query(...),
    period_end: str = Query(...),
    scenario_ids: str = Query(...),
    db: Session = Depends(get_db),
):
    import datetime
    try:
        ps = datetime.date.fromisoformat(period_start)
        pe = datetime.date.fromisoformat(period_end)
        sids = [int(x) for x in scenario_ids.split(",")]
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    result = build_equity_statement(db, entity_id, ps, pe, sids)
    return _eq_to_out(result)


# ---------------------------------------------------------------------------
# FS Validation / Tie-out
# ---------------------------------------------------------------------------

@router.get("/validate", response_model=FsValidationResultOut)
def validate_fs(
    entity_id: int = Query(...),
    as_of_date: str = Query(...),
    scenario_ids: str = Query(...),
    period_start: str | None = Query(None),
    db: Session = Depends(get_db),
):
    import datetime
    try:
        aod = datetime.date.fromisoformat(as_of_date)
        sids = [int(x) for x in scenario_ids.split(",")]
        ps = datetime.date.fromisoformat(period_start) if period_start else None
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    result = validate_financial_statements(db, entity_id, aod, sids, period_start=ps)
    return FsValidationResultOut(
        is_balanced=result.is_balanced,
        bs_difference=result.bs_difference,
        cf_tied=result.cf_tied,
        cf_difference=result.cf_difference,
        re_tied=result.re_tied,
        re_difference=result.re_difference,
        warnings=result.warnings,
    )


# ---------------------------------------------------------------------------
# Drilldown
# ---------------------------------------------------------------------------

@router.get("/drilldown", response_model=ReportLineDrilldownOut)
def drilldown(
    entity_id: int = Query(...),
    as_of_date: str = Query(...),
    scenario_ids: str = Query(...),
    fs_line_code: str = Query(...),
    db: Session = Depends(get_db),
):
    import datetime
    try:
        aod = datetime.date.fromisoformat(as_of_date)
        sids = [int(x) for x in scenario_ids.split(",")]
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    result = get_report_line_drilldown(db, entity_id, aod, sids, fs_line_code)
    if result is None:
        raise HTTPException(status_code=404, detail=f"FS line '{fs_line_code}' not found")

    return ReportLineDrilldownOut(
        fs_line_code=result.fs_line_code,
        fs_line_name=result.fs_line_name,
        total_balance=result.total_balance,
        accounts=[
            DrilldownAccountOut(
                account_id=a.account_id,
                account_number=a.account_number,
                account_name=a.account_name,
                net_debit=a.net_debit,
                signed_balance=a.signed_balance,
                journal_entries=[
                    DrilldownJeOut(
                        je_id=je.je_id,
                        je_number=je.je_number,
                        entry_date=je.entry_date,
                        debit=je.debit,
                        credit=je.credit,
                        description=je.description,
                    )
                    for je in a.journal_entries
                ],
            )
            for a in result.accounts
        ],
    )


# ---------------------------------------------------------------------------
# Trend report
# ---------------------------------------------------------------------------

@router.get("/trend", response_model=TrendReportOut)
def trend_report(
    entity_id: int = Query(...),
    periods_json: str = Query(..., description="JSON array of {label, as_of_date, scenario_ids}"),
    db: Session = Depends(get_db),
):
    import datetime
    try:
        raw = json.loads(periods_json)
        periods = [
            TrendPeriod(
                label=p["label"],
                as_of_date=datetime.date.fromisoformat(p["as_of_date"]),
                scenario_ids=p["scenario_ids"],
            )
            for p in raw
        ]
    except (ValueError, KeyError, json.JSONDecodeError) as e:
        raise HTTPException(status_code=422, detail=str(e))

    rows = build_trend_report(db, entity_id, periods)
    return TrendReportOut(
        entity_id=entity_id,
        period_labels=[p.label for p in periods],
        rows=[TrendRowOut(account_type=r.account_type, label=r.label, periods=r.periods) for r in rows],
    )


# ---------------------------------------------------------------------------
# Report Definitions (configurable layouts)
# ---------------------------------------------------------------------------

@router.post("/definitions", response_model=ReportDefinitionOut, status_code=201)
def create_definition(body: ReportDefinitionCreate, db: Session = Depends(get_db)):
    rd = ReportDefinition(
        organization_id=body.organization_id,
        name=body.name,
        report_type=body.report_type,
        description=body.description,
        is_template=body.is_template,
    )
    db.add(rd)
    db.commit()
    db.refresh(rd)
    return rd


@router.get("/definitions", response_model=list[ReportDefinitionOut])
def list_definitions(
    organization_id: int = Query(...),
    db: Session = Depends(get_db),
):
    return db.query(ReportDefinition).filter(
        ReportDefinition.organization_id == organization_id
    ).order_by(ReportDefinition.id).all()


@router.get("/definitions/{def_id}", response_model=ReportDefinitionOut)
def get_definition(def_id: int, db: Session = Depends(get_db)):
    rd = db.query(ReportDefinition).filter(ReportDefinition.id == def_id).first()
    if not rd:
        raise HTTPException(status_code=404, detail="Report definition not found")
    return rd


@router.post("/definitions/{def_id}/lines", response_model=ReportLineOut, status_code=201)
def add_line(def_id: int, body: ReportLineCreate, db: Session = Depends(get_db)):
    rd = db.query(ReportDefinition).filter(ReportDefinition.id == def_id).first()
    if not rd:
        raise HTTPException(status_code=404, detail="Report definition not found")
    line = ReportLine(
        report_definition_id=def_id,
        sort_order=body.sort_order,
        indent_level=body.indent_level,
        label=body.label,
        section=body.section,
        account_ids_json=json.dumps(body.account_ids) if body.account_ids else None,
        fs_line_codes_json=json.dumps(body.fs_line_codes) if body.fs_line_codes else None,
        calculation_type=body.calculation_type,
        sign_flip=body.sign_flip,
        is_subtotal=body.is_subtotal,
        bold=body.bold,
    )
    db.add(line)
    db.commit()
    db.refresh(line)
    return line


@router.get("/definitions/{def_id}/lines", response_model=list[ReportLineOut])
def get_lines(def_id: int, db: Session = Depends(get_db)):
    return (
        db.query(ReportLine)
        .filter(ReportLine.report_definition_id == def_id)
        .order_by(ReportLine.sort_order)
        .all()
    )


@router.post("/definitions/{def_id}/columns", response_model=ReportColumnOut, status_code=201)
def add_column(def_id: int, body: ReportColumnCreate, db: Session = Depends(get_db)):
    col = ReportColumn(
        report_definition_id=def_id,
        column_number=body.column_number,
        label=body.label,
        column_type=body.column_type,
        scenario_ids_json=json.dumps(body.scenario_ids) if body.scenario_ids else None,
        period_offset=body.period_offset,
        is_variance_column=body.is_variance_column,
        show_percentage=body.show_percentage,
    )
    db.add(col)
    db.commit()
    db.refresh(col)
    return col


# ---------------------------------------------------------------------------
# Export — close package
# ---------------------------------------------------------------------------

@router.get("/export/close-package")
def export_close_package(
    entity_id: int = Query(...),
    as_of_date: str = Query(...),
    scenario_ids: str = Query(...),
    label: str = Query("Close Package"),
    watermark: str = Query("DRAFT"),
    db: Session = Depends(get_db),
):
    import datetime
    from app.services.reporting_service import get_trial_balance
    from app.services.fs_reporting_service import get_fs_statement
    try:
        aod = datetime.date.fromisoformat(as_of_date)
        sids = [int(x) for x in scenario_ids.split(",")]
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    tb_rows = get_trial_balance(db, entity_id, aod, sids)
    fs_lines = get_fs_statement(db, entity_id, aod, sids)
    cf_result = None
    try:
        cf_result = build_cash_flow_statement(db, entity_id, datetime.date(aod.year, 1, 1), aod, sids)
    except Exception:
        pass

    wb = build_watermarked_close_package(
        entity_id=entity_id,
        as_of_date=aod,
        scenario_ids=sids,
        tb_rows=tb_rows,
        fs_lines=fs_lines,
        cf_result=cf_result,
        label=label,
        watermark=watermark,
    )
    data = workbook_to_bytes(wb)
    fname = f"{watermark}_{label.replace(' ', '_')}_{str(aod).replace('-', '')}.xlsx"
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------

def _cf_to_out(result) -> CashFlowResultOut:
    def section_out(s) -> CashFlowSectionOut:
        return CashFlowSectionOut(
            label=s.label,
            lines=[CashFlowLineOut(label=l.label, amount=l.amount, is_subtotal=l.is_subtotal) for l in s.lines],
            subtotal=s.subtotal,
        )
    return CashFlowResultOut(
        entity_id=result.entity_id,
        period_start=result.period_start,
        period_end=result.period_end,
        operating=section_out(result.operating),
        investing=section_out(result.investing),
        financing=section_out(result.financing),
        net_change=result.net_change,
        beginning_cash=result.beginning_cash,
        ending_cash=result.ending_cash,
        tie_difference=result.tie_difference,
        warnings=result.warnings,
        is_preview=result.is_preview,
    )


def _eq_to_out(result) -> EquityStatementOut:
    return EquityStatementOut(
        entity_id=result.entity_id,
        period_start=result.period_start,
        period_end=result.period_end,
        lines=[
            EquityLineOut(
                account_id=l.account_id,
                account_number=l.account_number,
                account_name=l.account_name,
                opening_balance=l.opening_balance,
                net_income_allocation=l.net_income_allocation,
                contributions=l.contributions,
                distributions=l.distributions,
                other_changes=l.other_changes,
                closing_balance=l.closing_balance,
            )
            for l in result.lines
        ],
        total_opening=result.total_opening,
        total_net_income=result.total_net_income,
        total_contributions=result.total_contributions,
        total_distributions=result.total_distributions,
        total_closing=result.total_closing,
    )
