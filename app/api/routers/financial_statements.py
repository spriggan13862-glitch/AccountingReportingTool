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
    BalanceComputeResult,
    AccountingWorkingViewResponse,
    AwvSection,
    AwvTaxonomyRow,
    AwvAccountRow,
    PresentationViewResponse,
    IncomeStatementSummary,
    BalanceSheetSummary,
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
# Balance Engine — compute-balance utility endpoint
# ---------------------------------------------------------------------------

@router.get("/compute-balance", response_model=BalanceComputeResult)
def compute_balance(
    account_type: str = Query(...),
    debit: float = Query(...),
    credit: float = Query(...),
    view: str = Query("accounting", description="accounting or presentation"),
):
    from app.services.balance_engine import (
        get_normal_balance,
        get_accounting_signed_balance,
        get_presentation_amount,
        get_awv_display_amount,
    )
    normal = get_normal_balance(account_type)
    accounting_balance = get_accounting_signed_balance(account_type, debit, credit)
    presentation_amount = get_presentation_amount(account_type, accounting_balance)
    is_normal = accounting_balance >= 0
    return BalanceComputeResult(
        account_type=account_type,
        debit=debit,
        credit=credit,
        normal_balance=normal,
        accounting_balance=accounting_balance,
        presentation_amount=presentation_amount,
        is_normal=is_normal,
        view=view,
    )


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
                        source=je.source,
                        source_ref=je.source_ref,
                        source_import_id=je.source_import_id,
                        source_import_filename=je.source_import_filename,
                        document_id=je.document_id,
                        document_name=je.document_name,
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
# Accounting Working View
# ---------------------------------------------------------------------------

@router.get("/accounting-view", response_model=AccountingWorkingViewResponse)
def get_accounting_working_view(
    entity_id: int = Query(...),
    period_id: int | None = Query(None),
    view_id: int | None = Query(None),
    scenario_ids: str = Query("", description="Comma-separated scenario IDs"),
    db: Session = Depends(get_db),
):
    import datetime
    from decimal import Decimal
    from collections import defaultdict

    from app.models.account import Account
    from app.models.reporting_taxonomy import ReportingTaxonomyLine
    from app.models.journal_entry import JournalEntry
    from app.models.journal_entry_line import JournalEntryLine
    from app.models.accounting_period import AccountingPeriod
    from app.services.fsli_mapping_service import resolve_fsli
    from app.services.balance_engine import (
        get_accounting_signed_balance,
        get_awv_display_amount,
        IMPORT_SOURCES,
        ACCOUNT_TYPE_SECTION,
        SECTION_ORDER,
    )

    sids: list[int] = [int(x) for x in scenario_ids.split(",") if x.strip()] if scenario_ids else []

    # Resolve as_of_date and period
    as_of_date_str: str | None = None
    period_start: datetime.date | None = None
    if period_id is not None:
        period = db.query(AccountingPeriod).filter(AccountingPeriod.id == period_id).first()
        if period:
            as_of_date_str = str(period.end_date)
            period_start = period.start_date
    if as_of_date_str is None:
        as_of_date_str = datetime.date.today().isoformat()

    # Default scenario: use scenario 1 when none supplied
    if not sids:
        sids = [1]

    # Load all accounts for entity
    accounts = db.query(Account).filter(Account.entity_id == entity_id).all()
    account_ids = [a.id for a in accounts]

    if not account_ids:
        return AccountingWorkingViewResponse(
            sections=[],
            entity_id=entity_id,
            period_id=period_id,
            view_id=view_id,
            as_of_date=as_of_date_str,
            net_income=0.0,
        )

    # Aggregate JE lines by account for ALL posted JEs in this entity/scenario up to as_of_date
    as_of = datetime.date.fromisoformat(as_of_date_str)

    def _sum_je_lines(source_filter=None, exclude_sources=None, statuses=("posted",)):
        filters = [
            JournalEntryLine.entity_id == entity_id,
            JournalEntry.entry_date <= as_of,
            JournalEntry.scenario_id.in_(sids),
            JournalEntry.status.in_(list(statuses)),
        ]
        if source_filter is not None:
            filters.append(JournalEntry.source.in_(list(source_filter)))
        if exclude_sources is not None:
            filters.append(JournalEntry.source.notin_(list(exclude_sources)))

        rows = (
            db.query(
                JournalEntryLine.account_id,
                JournalEntry.id.label("je_id"),
                JournalEntry.je_number,
                JournalEntry.entry_date,
                JournalEntry.description,
                JournalEntry.source,
                JournalEntryLine.debit,
                JournalEntryLine.credit,
            )
            .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
            .filter(*filters)
            .all()
        )
        return rows

    # Import-sourced rows (baseline TB)
    import_rows = _sum_je_lines(source_filter=IMPORT_SOURCES)
    # AJE rows (posted non-import)
    aje_rows = _sum_je_lines(exclude_sources=IMPORT_SOURCES)
    # Draft AJE rows
    draft_rows = _sum_je_lines(exclude_sources=IMPORT_SOURCES, statuses=("draft",))

    # Build per-account debit/credit aggregates
    def _aggregate(rows):
        acc: dict[int, tuple[Decimal, Decimal]] = defaultdict(lambda: (Decimal("0"), Decimal("0")))
        for r in rows:
            d, c = acc[r.account_id]
            acc[r.account_id] = (d + (r.debit or Decimal("0")), c + (r.credit or Decimal("0")))
        return acc

    import_agg = _aggregate(import_rows)
    aje_agg = _aggregate(aje_rows)
    draft_agg = _aggregate(draft_rows)

    # Build per-account JE list (import + aje combined)
    je_by_account: dict[int, list[dict]] = defaultdict(list)
    for r in import_rows + aje_rows:
        je_by_account[r.account_id].append({
            "je_id": r.je_id,
            "description": r.description or "",
            "amount": float((r.debit or Decimal("0")) - (r.credit or Decimal("0"))),
        })

    # Resolve FSLI mappings and load taxonomy lines
    taxonomy_line_ids: set[int] = set()
    account_fsli: dict[int, int | None] = {}
    for acc in accounts:
        tl_id = resolve_fsli(acc.id, entity_id, view_id, db)
        account_fsli[acc.id] = tl_id
        if tl_id is not None:
            taxonomy_line_ids.add(tl_id)

    taxonomy_lines_map: dict[int, ReportingTaxonomyLine] = {}
    if taxonomy_line_ids:
        for tl in db.query(ReportingTaxonomyLine).filter(ReportingTaxonomyLine.id.in_(list(taxonomy_line_ids))).all():
            taxonomy_lines_map[tl.id] = tl

    # Build AwvAccountRow for each account
    awv_accounts: list[AwvAccountRow] = []
    for acc in accounts:
        imp_d, imp_c = import_agg.get(acc.id, (Decimal("0"), Decimal("0")))
        aje_d, aje_c = aje_agg.get(acc.id, (Decimal("0"), Decimal("0")))
        drft_d, drft_c = draft_agg.get(acc.id, (Decimal("0"), Decimal("0")))

        imp_bal = get_accounting_signed_balance(acc.account_type, float(imp_d), float(imp_c))
        aje_bal = get_accounting_signed_balance(acc.account_type, float(aje_d), float(aje_c))
        drft_bal = get_accounting_signed_balance(acc.account_type, float(drft_d), float(drft_c))

        total_d = imp_d + aje_d
        total_c = imp_c + aje_c
        acct_bal = get_accounting_signed_balance(acc.account_type, float(total_d), float(total_c))
        awv_disp = get_awv_display_amount(acc.account_type, acct_bal)
        adj_bal = imp_bal + aje_bal + drft_bal

        awv_accounts.append(AwvAccountRow(
            account_id=acc.id,
            account_number=acc.account_number,
            account_name=acc.account_name,
            account_type=acc.account_type,
            normal_balance=acc.normal_balance,
            imported_balance=imp_bal,
            accounting_balance=acct_bal,
            awv_display_amount=awv_disp,
            posted_adj=aje_bal,
            draft_adj=drft_bal,
            adjusted_balance=adj_bal,
            journal_entries=je_by_account.get(acc.id, []),
        ))

    # Group accounts under taxonomy lines
    # Accounts with no mapping go to an "Unmapped" bucket per section
    tl_accounts: dict[int | None, list[AwvAccountRow]] = defaultdict(list)
    for awv_acc, acc in zip(awv_accounts, accounts):
        tl_id = account_fsli[acc.id]
        tl_accounts[tl_id].append(awv_acc)

    # Determine section for each taxonomy line
    def _section_for_type(account_type: str) -> str:
        return ACCOUNT_TYPE_SECTION.get(account_type.lower(), "Other")

    def _section_label(section: str) -> str:
        return {
            "Assets": "assets",
            "Liabilities": "liabilities",
            "Equity": "equity",
            "Revenue": "revenue",
            "Expenses": "expenses",
        }.get(section, section.lower())

    STATEMENT_FOR_SECTION = {
        "Assets": "balance_sheet",
        "Liabilities": "balance_sheet",
        "Equity": "balance_sheet",
        "Revenue": "income_statement",
        "Expenses": "income_statement",
    }

    # Build AwvTaxonomyRow list
    taxonomy_rows: list[AwvTaxonomyRow] = []

    for tl_id, acct_rows in tl_accounts.items():
        if tl_id is not None and tl_id in taxonomy_lines_map:
            tl = taxonomy_lines_map[tl_id]
            section_label = tl.section or _section_label(_section_for_type(acct_rows[0].account_type if acct_rows else "asset"))
            line_name = tl.name
            sort_order = tl.sort_order
            is_subtotal = tl.is_subtotal
            statement_type = tl.statement_type
        else:
            # Unmapped accounts: group by their account type section
            if not acct_rows:
                continue
            sec = _section_for_type(acct_rows[0].account_type)
            section_label = _section_label(sec)
            line_name = "Unmapped"
            sort_order = 9999
            is_subtotal = False
            statement_type = STATEMENT_FOR_SECTION.get(sec)

        imp_total = sum(r.imported_balance for r in acct_rows)
        aje_total = sum(r.posted_adj for r in acct_rows)
        drft_total = sum(r.draft_adj for r in acct_rows)
        acct_total = sum(r.accounting_balance for r in acct_rows)
        awv_total = sum(r.awv_display_amount for r in acct_rows)
        adj_total = sum(r.adjusted_balance for r in acct_rows)

        taxonomy_rows.append(AwvTaxonomyRow(
            taxonomy_line_id=tl_id,
            line_name=line_name,
            sort_order=sort_order,
            is_subtotal=is_subtotal,
            accounting_balance=acct_total,
            awv_display_amount=awv_total,
            imported_balance=imp_total,
            posted_adj=aje_total,
            draft_adj=drft_total,
            adjusted_balance=adj_total,
            accounts=sorted(acct_rows, key=lambda a: a.account_number),
        ))

    # Group taxonomy rows into sections
    # Determine section for each taxonomy row by looking at the taxonomy line section field
    section_rows: dict[str, list[AwvTaxonomyRow]] = defaultdict(list)
    for tr in taxonomy_rows:
        if tr.taxonomy_line_id is not None and tr.taxonomy_line_id in taxonomy_lines_map:
            tl = taxonomy_lines_map[tr.taxonomy_line_id]
            raw_sec = tl.section or ""
            # Normalize to canonical label
            sec_key = raw_sec.lower().strip()
        else:
            # Unmapped: derive from account types in the row
            sample_type = tr.accounts[0].account_type if tr.accounts else "asset"
            sec_key = _section_label(_section_for_type(sample_type))
        section_rows[sec_key].append(tr)

    SECTION_LABEL_MAP = {
        "assets": "Assets",
        "asset": "Assets",
        "liabilities": "Liabilities",
        "liability": "Liabilities",
        "equity": "Equity",
        "revenue": "Revenue",
        "income": "Revenue",
        "expenses": "Expenses",
        "expense": "Expenses",
        "cogs": "Expenses",
        "other_income": "Revenue",
        "other_expense": "Expenses",
    }

    SECTION_STATEMENT_MAP = {
        "assets": "balance_sheet",
        "liabilities": "balance_sheet",
        "equity": "balance_sheet",
        "revenue": "income_statement",
        "expenses": "income_statement",
    }

    canonical_order = ["assets", "liabilities", "equity", "revenue", "expenses"]
    sections_out: list[AwvSection] = []
    for sec_key in canonical_order:
        if sec_key not in section_rows:
            continue
        rows_in_sec = sorted(section_rows[sec_key], key=lambda r: (r.sort_order, r.line_name))
        sections_out.append(AwvSection(
            section=sec_key,
            label=SECTION_LABEL_MAP.get(sec_key, sec_key.title()),
            statement_type=SECTION_STATEMENT_MAP.get(sec_key),
            taxonomy_lines=rows_in_sec,
        ))

    # Remaining sections not in canonical_order
    for sec_key, rows_in_sec in section_rows.items():
        if sec_key in canonical_order:
            continue
        sections_out.append(AwvSection(
            section=sec_key,
            label=SECTION_LABEL_MAP.get(sec_key, sec_key.title()),
            statement_type=SECTION_STATEMENT_MAP.get(sec_key),
            taxonomy_lines=sorted(rows_in_sec, key=lambda r: (r.sort_order, r.line_name)),
        ))

    # Net income: sum of revenue accounting_balance - cogs - expenses
    revenue_bal = sum(
        r.accounting_balance
        for sec in sections_out if sec.section in ("revenue", "income")
        for tr in sec.taxonomy_lines
        for r in tr.accounts
    )
    expense_bal = sum(
        r.accounting_balance
        for sec in sections_out if sec.section in ("expenses", "cogs")
        for tr in sec.taxonomy_lines
        for r in tr.accounts
    )
    net_income = revenue_bal - expense_bal

    return AccountingWorkingViewResponse(
        sections=sections_out,
        entity_id=entity_id,
        period_id=period_id,
        view_id=view_id,
        as_of_date=as_of_date_str,
        net_income=net_income,
    )


# ---------------------------------------------------------------------------
# Financial Statement Presentation View
# ---------------------------------------------------------------------------

@router.get("/presentation-view", response_model=PresentationViewResponse)
def get_presentation_view(
    entity_id: int = Query(...),
    period_id: int | None = Query(None),
    view_id: int | None = Query(None),
    scenario_ids: str = Query("", description="Comma-separated scenario IDs"),
    db: Session = Depends(get_db),
):
    import datetime
    from decimal import Decimal
    from collections import defaultdict

    from app.models.account import Account
    from app.models.reporting_taxonomy import ReportingTaxonomyLine
    from app.models.journal_entry import JournalEntry
    from app.models.journal_entry_line import JournalEntryLine
    from app.models.accounting_period import AccountingPeriod
    from app.services.fsli_mapping_service import resolve_fsli
    from app.services.balance_engine import (
        get_accounting_signed_balance,
        get_presentation_amount,
        get_awv_display_amount,
        IMPORT_SOURCES,
        ACCOUNT_TYPE_SECTION,
    )

    sids: list[int] = [int(x) for x in scenario_ids.split(",") if x.strip()] if scenario_ids else []

    as_of_date_str: str | None = None
    if period_id is not None:
        period = db.query(AccountingPeriod).filter(AccountingPeriod.id == period_id).first()
        if period:
            as_of_date_str = str(period.end_date)
    if as_of_date_str is None:
        as_of_date_str = datetime.date.today().isoformat()

    if not sids:
        sids = [1]

    accounts = db.query(Account).filter(Account.entity_id == entity_id).all()
    account_ids = [a.id for a in accounts]

    empty_is = IncomeStatementSummary(
        revenue=0, cogs=0, gross_profit=0, total_expenses=0,
        operating_income=0, other_income=0, other_expenses=0, net_income=0,
    )
    empty_bs = BalanceSheetSummary(total_assets=0, total_liabilities=0, total_equity=0, balanced=True)

    if not account_ids:
        return PresentationViewResponse(
            sections=[],
            income_statement=empty_is,
            balance_sheet=empty_bs,
            entity_id=entity_id,
            period_id=period_id,
            view_id=view_id,
            as_of_date=as_of_date_str,
        )

    as_of = datetime.date.fromisoformat(as_of_date_str)

    def _sum_je_lines(source_filter=None, exclude_sources=None, statuses=("posted",)):
        filters = [
            JournalEntryLine.entity_id == entity_id,
            JournalEntry.entry_date <= as_of,
            JournalEntry.scenario_id.in_(sids),
            JournalEntry.status.in_(list(statuses)),
        ]
        if source_filter is not None:
            filters.append(JournalEntry.source.in_(list(source_filter)))
        if exclude_sources is not None:
            filters.append(JournalEntry.source.notin_(list(exclude_sources)))
        rows = (
            db.query(
                JournalEntryLine.account_id,
                JournalEntry.id.label("je_id"),
                JournalEntry.je_number,
                JournalEntry.entry_date,
                JournalEntry.description,
                JournalEntry.source,
                JournalEntryLine.debit,
                JournalEntryLine.credit,
            )
            .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
            .filter(*filters)
            .all()
        )
        return rows

    import_rows = _sum_je_lines(source_filter=IMPORT_SOURCES)
    aje_rows = _sum_je_lines(exclude_sources=IMPORT_SOURCES)
    draft_rows = _sum_je_lines(exclude_sources=IMPORT_SOURCES, statuses=("draft",))

    def _aggregate(rows):
        acc: dict[int, tuple[Decimal, Decimal]] = defaultdict(lambda: (Decimal("0"), Decimal("0")))
        for r in rows:
            d, c = acc[r.account_id]
            acc[r.account_id] = (d + (r.debit or Decimal("0")), c + (r.credit or Decimal("0")))
        return acc

    import_agg = _aggregate(import_rows)
    aje_agg = _aggregate(aje_rows)
    draft_agg = _aggregate(draft_rows)

    je_by_account: dict[int, list[dict]] = defaultdict(list)
    for r in import_rows + aje_rows:
        je_by_account[r.account_id].append({
            "je_id": r.je_id,
            "description": r.description or "",
            "amount": float((r.debit or Decimal("0")) - (r.credit or Decimal("0"))),
        })

    taxonomy_line_ids: set[int] = set()
    account_fsli: dict[int, int | None] = {}
    for acc in accounts:
        tl_id = resolve_fsli(acc.id, entity_id, view_id, db)
        account_fsli[acc.id] = tl_id
        if tl_id is not None:
            taxonomy_line_ids.add(tl_id)

    taxonomy_lines_map: dict[int, ReportingTaxonomyLine] = {}
    if taxonomy_line_ids:
        for tl in db.query(ReportingTaxonomyLine).filter(ReportingTaxonomyLine.id.in_(list(taxonomy_line_ids))).all():
            taxonomy_lines_map[tl.id] = tl

    awv_accounts: list[AwvAccountRow] = []
    for acc in accounts:
        imp_d, imp_c = import_agg.get(acc.id, (Decimal("0"), Decimal("0")))
        aje_d, aje_c = aje_agg.get(acc.id, (Decimal("0"), Decimal("0")))
        drft_d, drft_c = draft_agg.get(acc.id, (Decimal("0"), Decimal("0")))

        imp_bal = get_accounting_signed_balance(acc.account_type, float(imp_d), float(imp_c))
        aje_bal = get_accounting_signed_balance(acc.account_type, float(aje_d), float(aje_c))
        drft_bal = get_accounting_signed_balance(acc.account_type, float(drft_d), float(drft_c))

        total_d = imp_d + aje_d
        total_c = imp_c + aje_c
        acct_bal = get_accounting_signed_balance(acc.account_type, float(total_d), float(total_c))
        # Presentation amount: revenue/expenses/assets all show positive when in normal position
        pres_amt = get_presentation_amount(acc.account_type, acct_bal)
        awv_disp = get_awv_display_amount(acc.account_type, acct_bal)
        adj_bal = imp_bal + aje_bal + drft_bal

        awv_accounts.append(AwvAccountRow(
            account_id=acc.id,
            account_number=acc.account_number,
            account_name=acc.account_name,
            account_type=acc.account_type,
            normal_balance=acc.normal_balance,
            imported_balance=get_presentation_amount(acc.account_type, imp_bal),
            accounting_balance=acct_bal,
            awv_display_amount=pres_amt,
            posted_adj=get_presentation_amount(acc.account_type, aje_bal),
            draft_adj=drft_bal,
            adjusted_balance=get_presentation_amount(acc.account_type, adj_bal),
            journal_entries=je_by_account.get(acc.id, []),
        ))

    tl_accounts: dict[int | None, list[AwvAccountRow]] = defaultdict(list)
    for awv_acc, acc in zip(awv_accounts, accounts):
        tl_id = account_fsli[acc.id]
        tl_accounts[tl_id].append(awv_acc)

    def _section_for_type(account_type: str) -> str:
        return ACCOUNT_TYPE_SECTION.get(account_type.lower(), "Other")

    def _section_label(section: str) -> str:
        return {
            "Assets": "assets",
            "Liabilities": "liabilities",
            "Equity": "equity",
            "Revenue": "revenue",
            "Expenses": "expenses",
        }.get(section, section.lower())

    STATEMENT_FOR_SECTION = {
        "Assets": "balance_sheet",
        "Liabilities": "balance_sheet",
        "Equity": "balance_sheet",
        "Revenue": "income_statement",
        "Expenses": "income_statement",
    }

    taxonomy_rows: list[AwvTaxonomyRow] = []

    for tl_id, acct_rows in tl_accounts.items():
        if tl_id is not None and tl_id in taxonomy_lines_map:
            tl = taxonomy_lines_map[tl_id]
            section_label = tl.section or _section_label(_section_for_type(acct_rows[0].account_type if acct_rows else "asset"))
            line_name = tl.name
            sort_order = tl.sort_order
            is_subtotal = tl.is_subtotal
        else:
            if not acct_rows:
                continue
            sec = _section_for_type(acct_rows[0].account_type)
            section_label = _section_label(sec)
            line_name = "Unmapped"
            sort_order = 9999
            is_subtotal = False

        imp_total = sum(r.imported_balance for r in acct_rows)
        aje_total = sum(r.posted_adj for r in acct_rows)
        drft_total = sum(r.draft_adj for r in acct_rows)
        acct_total = sum(r.accounting_balance for r in acct_rows)
        pres_total = sum(r.awv_display_amount for r in acct_rows)
        adj_total = sum(r.adjusted_balance for r in acct_rows)

        taxonomy_rows.append(AwvTaxonomyRow(
            taxonomy_line_id=tl_id,
            line_name=line_name,
            sort_order=sort_order,
            is_subtotal=is_subtotal,
            accounting_balance=acct_total,
            awv_display_amount=pres_total,
            imported_balance=imp_total,
            posted_adj=aje_total,
            draft_adj=drft_total,
            adjusted_balance=adj_total,
            accounts=sorted(acct_rows, key=lambda a: a.account_number),
        ))

    section_rows: dict[str, list[AwvTaxonomyRow]] = defaultdict(list)
    for tr in taxonomy_rows:
        if tr.taxonomy_line_id is not None and tr.taxonomy_line_id in taxonomy_lines_map:
            tl = taxonomy_lines_map[tr.taxonomy_line_id]
            sec_key = (tl.section or "").lower().strip()
        else:
            sample_type = tr.accounts[0].account_type if tr.accounts else "asset"
            sec_key = _section_label(_section_for_type(sample_type))
        section_rows[sec_key].append(tr)

    SECTION_LABEL_MAP = {
        "assets": "Assets",
        "asset": "Assets",
        "liabilities": "Liabilities",
        "liability": "Liabilities",
        "equity": "Equity",
        "revenue": "Revenue",
        "income": "Revenue",
        "expenses": "Expenses",
        "expense": "Expenses",
        "cogs": "Expenses",
        "other_income": "Revenue",
        "other_expense": "Expenses",
    }

    SECTION_STATEMENT_MAP = {
        "assets": "balance_sheet",
        "liabilities": "balance_sheet",
        "equity": "balance_sheet",
        "revenue": "income_statement",
        "expenses": "income_statement",
    }

    canonical_order = ["assets", "liabilities", "equity", "revenue", "expenses"]
    sections_out: list[AwvSection] = []
    for sec_key in canonical_order:
        if sec_key not in section_rows:
            continue
        rows_in_sec = sorted(section_rows[sec_key], key=lambda r: (r.sort_order, r.line_name))
        sections_out.append(AwvSection(
            section=sec_key,
            label=SECTION_LABEL_MAP.get(sec_key, sec_key.title()),
            statement_type=SECTION_STATEMENT_MAP.get(sec_key),
            taxonomy_lines=rows_in_sec,
        ))

    for sec_key, rows_in_sec in section_rows.items():
        if sec_key in canonical_order:
            continue
        sections_out.append(AwvSection(
            section=sec_key,
            label=SECTION_LABEL_MAP.get(sec_key, sec_key.title()),
            statement_type=SECTION_STATEMENT_MAP.get(sec_key),
            taxonomy_lines=sorted(rows_in_sec, key=lambda r: (r.sort_order, r.line_name)),
        ))

    # Compute IS summary using presentation amounts
    def _section_pres_total(sec_keys: list[str]) -> float:
        return sum(
            r.awv_display_amount
            for sec in sections_out if sec.section in sec_keys
            for r in sec.taxonomy_lines
        )

    revenue = _section_pres_total(["revenue", "income"])
    cogs = _section_pres_total(["cogs"])
    gross_profit = revenue - cogs
    other_income = _section_pres_total(["other_income"])
    other_expenses = _section_pres_total(["other_expense"])
    total_expenses = _section_pres_total(["expenses", "expense"])
    operating_income = gross_profit - total_expenses
    net_income = operating_income + other_income - other_expenses

    total_assets = _section_pres_total(["assets", "asset"])
    total_liabilities = _section_pres_total(["liabilities", "liability"])
    total_equity = _section_pres_total(["equity"])
    balanced = abs((total_liabilities + total_equity) - total_assets) < 0.01

    is_summary = IncomeStatementSummary(
        revenue=revenue,
        cogs=cogs,
        gross_profit=gross_profit,
        total_expenses=total_expenses,
        operating_income=operating_income,
        other_income=other_income,
        other_expenses=other_expenses,
        net_income=net_income,
    )
    bs_summary = BalanceSheetSummary(
        total_assets=total_assets,
        total_liabilities=total_liabilities,
        total_equity=total_equity,
        balanced=balanced,
    )

    return PresentationViewResponse(
        sections=sections_out,
        income_statement=is_summary,
        balance_sheet=bs_summary,
        entity_id=entity_id,
        period_id=period_id,
        view_id=view_id,
        as_of_date=as_of_date_str,
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
