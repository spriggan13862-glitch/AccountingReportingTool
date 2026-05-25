"""
Unified Financial Statement Engine — Milestone 20.

Generates accountant-grade financial statements:
  - Balance Sheet (BS)
  - Income Statement (IS)
  - Statement of Cash Flows — indirect method (CF)
  - Statement of Changes in Equity (EQ)
  - Consolidated versions of all above
  - Overlay-adjusted (draft preview) versions

Accounting assumptions
----------------------
- Account numbers 1000-1099: cash / cash equivalents
- Account numbers 1100-1499: other current assets
- Account numbers 1500-1999: non-current / fixed assets
  (contra-assets such as accumulated depreciation have credit normal_balance)
- Account numbers 2000-2499: current liabilities
- Account numbers 2500-2999: long-term liabilities
- Account numbers 3000-3998: equity (contributed capital, partner capital)
- Account numbers 3900-3999: retained earnings / members' equity (RE roll)
- Account numbers 4000-4999: revenue
- Account numbers 5000-5999: expenses
  (D&A expense: name contains 'depreciation' or 'amortization')

Balance convention (consistent with rest of codebase)
------------------------------------------------------
- net_debit = SUM(debit - credit)  [positive = net debit position]
- signed_balance = net_debit if normal_balance=='debit' else -net_debit
  [always positive when account has its natural balance]
- Net Income = -sum(IS net_debit for period) [positive = profitable]
  because IS: expenses debit, revenue credit → net_debit_IS < 0 when profitable
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Sequence

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.services.reporting_service import TrialBalanceRow, get_trial_balance
from app.services.fs_reporting_service import FsLineBalance, get_fs_statement, build_fs_from_tb_rows
from app.services.consolidation_service import (
    get_consolidated_trial_balance,
    get_consolidation_members,
)
from app.services.draft_overlay_service import OverlayParams, calculate_overlay


# ---------------------------------------------------------------------------
# Cash Flow output types
# ---------------------------------------------------------------------------

@dataclass
class CashFlowLine:
    label: str
    amount: Decimal
    account_ids: list[int] = field(default_factory=list)
    is_subtotal: bool = False


@dataclass
class CashFlowSection:
    label: str
    lines: list[CashFlowLine]
    subtotal: Decimal


@dataclass
class CashFlowResult:
    entity_id: int
    period_start: datetime.date
    period_end: datetime.date
    scenario_ids: list[int]
    operating: CashFlowSection
    investing: CashFlowSection
    financing: CashFlowSection
    net_change: Decimal
    beginning_cash: Decimal
    ending_cash: Decimal
    tie_difference: Decimal          # net_change - (ending_cash - beginning_cash), should be ~0
    warnings: list[str] = field(default_factory=list)
    is_preview: bool = False


# ---------------------------------------------------------------------------
# Equity Statement output types
# ---------------------------------------------------------------------------

@dataclass
class EquityLine:
    account_id: int
    account_number: str
    account_name: str
    opening_balance: Decimal
    net_income_allocation: Decimal   # allocated NI (for RE accounts)
    contributions: Decimal
    distributions: Decimal
    other_changes: Decimal
    closing_balance: Decimal


@dataclass
class EquityStatementResult:
    entity_id: int
    period_start: datetime.date
    period_end: datetime.date
    lines: list[EquityLine]
    total_opening: Decimal
    total_net_income: Decimal
    total_contributions: Decimal
    total_distributions: Decimal
    total_closing: Decimal


# ---------------------------------------------------------------------------
# FS Validation output
# ---------------------------------------------------------------------------

@dataclass
class FsValidationResult:
    is_balanced: bool                # BS: assets == liabilities + equity
    bs_difference: Decimal           # assets - (liabilities + equity); 0 = balanced
    cf_tied: bool                    # CF: net_change == ending_cash - beginning_cash
    cf_difference: Decimal           # net_change - (ending_cash - beginning_cash)
    re_tied: bool                    # RE: opening + NI == closing
    re_difference: Decimal
    cons_tied: bool = True           # Consolidated TB: total_debit == total_credit
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Report Drilldown output
# ---------------------------------------------------------------------------

@dataclass
class DrilldownJournalEntry:
    je_id: int
    je_number: str
    entry_date: str
    debit: Decimal
    credit: Decimal
    description: str | None
    source: str | None = None
    source_ref: str | None = None
    source_import_id: int | None = None
    source_import_filename: str | None = None
    document_id: int | None = None
    document_name: str | None = None


@dataclass
class DrilldownAccount:
    account_id: int
    account_number: str
    account_name: str
    net_debit: Decimal
    signed_balance: Decimal
    journal_entries: list[DrilldownJournalEntry]


@dataclass
class ReportLineDrilldown:
    fs_line_code: str
    fs_line_name: str
    total_balance: Decimal
    accounts: list[DrilldownAccount]


# ---------------------------------------------------------------------------
# Account classification helpers
# ---------------------------------------------------------------------------

def _account_range(account: Account, low: int, high: int) -> bool:
    """Returns True if the account's number prefix falls within [low, high)."""
    try:
        n = int(account.account_number[:4].rstrip('A-Za-z-').ljust(4, '0'))
        return low <= n < high
    except (ValueError, IndexError):
        return False


def _is_cash_account(a: Account) -> bool:
    return a.account_type == "asset" and _account_range(a, 1000, 1100)


def _is_current_asset(a: Account) -> bool:
    return a.account_type == "asset" and _account_range(a, 1100, 1500) and a.normal_balance == "debit"


def _is_noncurrent_asset(a: Account) -> bool:
    return a.account_type == "asset" and _account_range(a, 1500, 2000)


def _is_contra_asset(a: Account) -> bool:
    return a.account_type == "asset" and a.normal_balance == "credit"


def _is_current_liability(a: Account) -> bool:
    return a.account_type == "liability" and _account_range(a, 2000, 2500)


def _is_longterm_liability(a: Account) -> bool:
    return a.account_type == "liability" and _account_range(a, 2500, 3000)


def _is_re_account(a: Account) -> bool:
    return a.account_type == "equity" and _account_range(a, 3900, 4000)


def _is_equity_contribution(a: Account) -> bool:
    return a.account_type == "equity" and not _is_re_account(a)


def _is_is_account(a: Account) -> bool:
    return a.account_type in ("revenue", "expense")


def _is_da_account(a: Account) -> bool:
    """Depreciation/amortization expense — noncash add-back in operating CF."""
    if a.account_type != "expense":
        return False
    name_lower = (a.account_name or "").lower()
    return "depreciation" in name_lower or "amortization" in name_lower


# ---------------------------------------------------------------------------
# Period-scoped IS query helpers
# ---------------------------------------------------------------------------

def _get_period_net_debit_by_account(
    db: Session,
    entity_id: int,
    scenario_ids: Sequence[int],
    start_date: datetime.date,
    end_date: datetime.date,
    account_types: tuple[str, ...],
) -> dict[int, tuple[Account, Decimal]]:
    """
    Returns {account_id: (Account, net_debit)} for activity in [start_date, end_date].
    """
    rows = (
        db.query(
            Account,
            func.coalesce(func.sum(JournalEntryLine.debit - JournalEntryLine.credit), 0),
        )
        .join(JournalEntryLine, JournalEntryLine.account_id == Account.id)
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .filter(
            JournalEntryLine.entity_id == entity_id,
            JournalEntry.entry_date >= start_date,
            JournalEntry.entry_date <= end_date,
            JournalEntry.scenario_id.in_(scenario_ids),
            JournalEntry.status == "posted",
            Account.account_type.in_(account_types),
        )
        .group_by(Account.id)
        .all()
    )
    return {acct.id: (acct, Decimal(str(nd))) for acct, nd in rows}


def _period_net_income(
    db: Session,
    entity_id: int,
    scenario_ids: Sequence[int],
    start_date: datetime.date,
    end_date: datetime.date,
) -> Decimal:
    """
    Net Income = -sum(net_debit for IS accounts in period).
    Positive means profitable.
    """
    period_data = _get_period_net_debit_by_account(
        db, entity_id, scenario_ids, start_date, end_date, ("revenue", "expense")
    )
    total_is_net_debit = sum(nd for _, nd in period_data.values())
    return -total_is_net_debit


def _period_da_amount(
    db: Session,
    entity_id: int,
    scenario_ids: Sequence[int],
    start_date: datetime.date,
    end_date: datetime.date,
) -> Decimal:
    """
    Depreciation & amortization for the period — always positive (noncash add-back).
    """
    period_data = _get_period_net_debit_by_account(
        db, entity_id, scenario_ids, start_date, end_date, ("expense",)
    )
    return sum(
        nd for acct, nd in period_data.values()
        if _is_da_account(acct) and nd > 0
    )


# ---------------------------------------------------------------------------
# Cash Flow — indirect method
# ---------------------------------------------------------------------------

def build_cash_flow_statement(
    db: Session,
    entity_id: int,
    period_start: datetime.date,
    period_end: datetime.date,
    scenario_ids: Sequence[int],
) -> CashFlowResult:
    """
    Build indirect-method cash flow statement for the period.

    Operating  = Net Income + D&A + Working Capital changes
    Investing  = Changes in non-current assets (excl D&A effect on contra-assets)
    Financing  = Changes in long-term liabilities + equity contributions / distributions

    Tie check: net_change should equal ending_cash - beginning_cash.
    """
    begin_date = period_start - datetime.timedelta(days=1)

    end_tb_rows = get_trial_balance(db, entity_id, period_end, scenario_ids)
    begin_tb_rows = get_trial_balance(db, entity_id, begin_date, scenario_ids)

    end_by_id: dict[int, TrialBalanceRow] = {r.account_id: r for r in end_tb_rows}
    begin_by_id: dict[int, TrialBalanceRow] = {r.account_id: r for r in begin_tb_rows}

    # Load account metadata
    all_account_ids = set(end_by_id) | set(begin_by_id)
    accounts: dict[int, Account] = {
        a.id: a for a in db.query(Account).filter(Account.id.in_(all_account_ids)).all()
    }

    def delta_signed(acct_id: int) -> Decimal:
        """Change in signed_balance from begin to end."""
        end_row = end_by_id.get(acct_id)
        begin_row = begin_by_id.get(acct_id)
        e_signed = end_row.signed_balance if end_row else Decimal("0")
        b_signed = begin_row.signed_balance if begin_row else Decimal("0")
        return e_signed - b_signed

    # ------------------------------------------------------------------ #
    # Operating Activities                                                 #
    # ------------------------------------------------------------------ #
    net_income = _period_net_income(db, entity_id, scenario_ids, period_start, period_end)
    da_addback = _period_da_amount(db, entity_id, scenario_ids, period_start, period_end)

    # Working capital: current assets (ex-cash) changes and current liabilities changes
    wc_lines: list[CashFlowLine] = []
    for acct_id, acct in accounts.items():
        if _is_current_asset(acct):
            # Increase in current asset = use of cash (negative)
            delta = delta_signed(acct_id)
            if delta != Decimal("0"):
                wc_lines.append(CashFlowLine(
                    label=f"Change in {acct.account_name}",
                    amount=-delta,
                    account_ids=[acct_id],
                ))
        elif _is_current_liability(acct):
            # Increase in current liability = source of cash (positive)
            delta = delta_signed(acct_id)
            if delta != Decimal("0"):
                wc_lines.append(CashFlowLine(
                    label=f"Change in {acct.account_name}",
                    amount=delta,
                    account_ids=[acct_id],
                ))

    total_wc = sum(l.amount for l in wc_lines)
    operating_total = net_income + da_addback + total_wc

    operating_lines: list[CashFlowLine] = [
        CashFlowLine("Net Income", net_income),
        CashFlowLine("Depreciation & Amortization", da_addback),
    ] + wc_lines + [
        CashFlowLine("Net Cash from Operating Activities", operating_total, is_subtotal=True),
    ]
    operating = CashFlowSection("Operating Activities", operating_lines, operating_total)

    # ------------------------------------------------------------------ #
    # Investing Activities                                                 #
    # ------------------------------------------------------------------ #
    investing_lines: list[CashFlowLine] = []
    for acct_id, acct in accounts.items():
        if _is_noncurrent_asset(acct) and not _is_contra_asset(acct):
            # Increase in non-current gross asset = cash outflow
            delta = delta_signed(acct_id)
            if delta != Decimal("0"):
                investing_lines.append(CashFlowLine(
                    label=f"{'Purchase of' if delta > 0 else 'Proceeds from'} {acct.account_name}",
                    amount=-delta,
                    account_ids=[acct_id],
                ))

    investing_total = sum(l.amount for l in investing_lines)
    investing_lines.append(
        CashFlowLine("Net Cash from Investing Activities", investing_total, is_subtotal=True)
    )
    investing = CashFlowSection("Investing Activities", investing_lines, investing_total)

    # ------------------------------------------------------------------ #
    # Financing Activities                                                 #
    # ------------------------------------------------------------------ #
    financing_lines: list[CashFlowLine] = []
    for acct_id, acct in accounts.items():
        if _is_longterm_liability(acct):
            delta = delta_signed(acct_id)
            if delta != Decimal("0"):
                financing_lines.append(CashFlowLine(
                    label=f"{'Proceeds from' if delta > 0 else 'Repayment of'} {acct.account_name}",
                    amount=delta,
                    account_ids=[acct_id],
                ))
        elif _is_equity_contribution(acct):
            delta = delta_signed(acct_id)
            if delta != Decimal("0"):
                financing_lines.append(CashFlowLine(
                    label=f"{'Capital contribution —' if delta > 0 else 'Distribution —'} {acct.account_name}",
                    amount=delta,
                    account_ids=[acct_id],
                ))

    financing_total = sum(l.amount for l in financing_lines)
    financing_lines.append(
        CashFlowLine("Net Cash from Financing Activities", financing_total, is_subtotal=True)
    )
    financing = CashFlowSection("Financing Activities", financing_lines, financing_total)

    # ------------------------------------------------------------------ #
    # Tie-out                                                              #
    # ------------------------------------------------------------------ #
    net_change = operating_total + investing_total + financing_total

    beginning_cash = sum(
        (begin_by_id[aid].signed_balance if aid in begin_by_id else Decimal("0"))
        for aid, acct in accounts.items() if _is_cash_account(acct)
    )
    ending_cash = sum(
        (end_by_id[aid].signed_balance if aid in end_by_id else Decimal("0"))
        for aid, acct in accounts.items() if _is_cash_account(acct)
    )

    tie_diff = net_change - (ending_cash - beginning_cash)
    warnings: list[str] = []
    if abs(tie_diff) > Decimal("0.01"):
        warnings.append(
            f"Cash flow statement does not tie: net change {net_change} vs "
            f"cash change {ending_cash - beginning_cash} (diff={tie_diff})"
        )

    return CashFlowResult(
        entity_id=entity_id,
        period_start=period_start,
        period_end=period_end,
        scenario_ids=list(scenario_ids),
        operating=operating,
        investing=investing,
        financing=financing,
        net_change=net_change,
        beginning_cash=beginning_cash,
        ending_cash=ending_cash,
        tie_difference=tie_diff,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Statement of Changes in Equity
# ---------------------------------------------------------------------------

def build_equity_statement(
    db: Session,
    entity_id: int,
    period_start: datetime.date,
    period_end: datetime.date,
    scenario_ids: Sequence[int],
) -> EquityStatementResult:
    """
    Build the Statement of Changes in Equity.

    For each equity account:
    - Opening balance as of period_start - 1 day
    - Net income allocation (for RE accounts only)
    - Period-activity changes
    - Closing balance as of period_end

    Partner/member capital accounts (3000-3899) show contribution/distribution activity.
    Retained earnings accounts (3900-3999) receive the net income allocation.
    """
    begin_date = period_start - datetime.timedelta(days=1)

    end_tb: dict[int, TrialBalanceRow] = {
        r.account_id: r for r in get_trial_balance(db, entity_id, period_end, scenario_ids)
    }
    begin_tb: dict[int, TrialBalanceRow] = {
        r.account_id: r for r in get_trial_balance(db, entity_id, begin_date, scenario_ids)
    }

    equity_account_ids = set(
        aid for aid, row in {**end_tb, **begin_tb}.items()
        if row.account_type == "equity"
    )
    accounts: dict[int, Account] = {
        a.id: a
        for a in db.query(Account).filter(Account.id.in_(equity_account_ids)).all()
    }

    net_income = _period_net_income(db, entity_id, scenario_ids, period_start, period_end)

    # Period activity per equity account
    period_activity = _get_period_net_debit_by_account(
        db, entity_id, scenario_ids, period_start, period_end, ("equity",)
    )

    lines: list[EquityLine] = []
    total_opening = Decimal("0")
    total_ni = Decimal("0")
    total_contribs = Decimal("0")
    total_distribs = Decimal("0")
    total_closing = Decimal("0")

    for acct_id in sorted(equity_account_ids, key=lambda i: accounts[i].account_number if i in accounts else ""):
        acct = accounts.get(acct_id)
        if acct is None:
            continue

        open_row = begin_tb.get(acct_id)
        close_row = end_tb.get(acct_id)
        opening = open_row.signed_balance if open_row else Decimal("0")
        closing = close_row.signed_balance if close_row else Decimal("0")

        pa_acct, pa_net_debit = period_activity.get(acct_id, (acct, Decimal("0")))
        # For credit-normal equity: signed period activity = -net_debit
        period_signed = -pa_net_debit if acct.normal_balance == "credit" else pa_net_debit

        is_re = _is_re_account(acct)
        ni_alloc = net_income if is_re else Decimal("0")
        # Non-RE equity: period change is contributions (positive) or distributions (negative)
        contributions = period_signed if not is_re and period_signed > 0 else Decimal("0")
        distributions = -period_signed if not is_re and period_signed < 0 else Decimal("0")
        other = (period_signed - ni_alloc) if is_re else Decimal("0")

        lines.append(EquityLine(
            account_id=acct_id,
            account_number=acct.account_number,
            account_name=acct.account_name,
            opening_balance=opening,
            net_income_allocation=ni_alloc,
            contributions=contributions,
            distributions=distributions,
            other_changes=other,
            closing_balance=closing,
        ))
        total_opening += opening
        total_ni += ni_alloc
        total_contribs += contributions
        total_distribs += distributions
        total_closing += closing

    return EquityStatementResult(
        entity_id=entity_id,
        period_start=period_start,
        period_end=period_end,
        lines=lines,
        total_opening=total_opening,
        total_net_income=total_ni,
        total_contributions=total_contribs,
        total_distributions=total_distribs,
        total_closing=total_closing,
    )


# ---------------------------------------------------------------------------
# Overlay-adjusted FS
# ---------------------------------------------------------------------------

def build_overlay_adjusted_fs(
    db: Session,
    params: OverlayParams,
    statement: str | None = None,
) -> list[FsLineBalance]:
    """
    Build FS output incorporating draft overlay adjustments.

    Computes the overlay result (never persisted), merges draft adjustments
    into the trial balance, then feeds the combined TB through the standard
    FS aggregation pipeline.

    Returns a list of FsLineBalance marked as preview (is_preview_adjusted=True
    in the additional dict; callers should watermark these as DRAFT).
    """
    overlay_result = calculate_overlay(db, params)

    # Build a merged trial balance from overlay line items
    # overlay_result.line_items contains both official and draft balances
    from app.models.account import Account as _Account

    # Convert overlay line items back to TrialBalanceRow-compatible format
    preview_tb: dict[int, TrialBalanceRow] = {}
    for item in overlay_result.line_items:
        # Use preview_net_debit as the effective balance
        from app.services.reporting_service import TrialBalanceRow as _TBRow
        preview_nd = item.preview_net_debit
        preview_signed = preview_nd if item.normal_balance == "debit" else -preview_nd
        preview_tb[item.account_id] = _TBRow(
            account_id=item.account_id,
            account_number=item.account_number,
            account_name=item.account_name,
            account_type=item.account_type,
            normal_balance=item.normal_balance,
            total_debit=Decimal("0"),
            total_credit=Decimal("0"),
            net_debit=preview_nd,
            signed_balance=preview_signed,
        )

    return build_fs_from_tb_rows(
        db,
        tb_by_account_id=preview_tb,
        mapping_entity_id=params.entity_id,
        as_of_date=params.as_of_date,
        statement=statement,
    )


# ---------------------------------------------------------------------------
# Validation / Tie-out
# ---------------------------------------------------------------------------

def validate_financial_statements(
    db: Session,
    entity_id: int,
    as_of_date: datetime.date,
    scenario_ids: Sequence[int],
    period_start: datetime.date | None = None,
) -> FsValidationResult:
    """
    Run all FS tie-out checks and return a FsValidationResult.

    Checks:
    - BS: total assets == total liabilities + total equity
    - CF: net change in cash == ending cash - beginning cash
    - RE: opening RE + net income == closing RE
    """
    warnings: list[str] = []

    # --- Balance Sheet balance check ---
    tb = get_trial_balance(db, entity_id, as_of_date, scenario_ids)
    totals: dict[str, Decimal] = {}
    for row in tb:
        totals[row.account_type] = totals.get(row.account_type, Decimal("0")) + row.signed_balance

    assets = totals.get("asset", Decimal("0"))
    liabilities = totals.get("liability", Decimal("0"))
    equity = totals.get("equity", Decimal("0"))
    bs_diff = assets - (liabilities + equity)
    is_balanced = abs(bs_diff) <= Decimal("0.01")
    if not is_balanced:
        warnings.append(f"Balance sheet out of balance: assets={assets}, L+E={liabilities + equity}, diff={bs_diff}")

    # --- Cash flow tie ---
    cf_tied = True
    cf_diff = Decimal("0")
    if period_start is not None:
        try:
            cf = build_cash_flow_statement(db, entity_id, period_start, as_of_date, scenario_ids)
            cf_diff = cf.tie_difference
            cf_tied = abs(cf_diff) <= Decimal("0.01")
            if not cf_tied:
                warnings.append(f"Cash flow statement does not tie: difference={cf_diff}")
        except Exception as e:
            warnings.append(f"Cash flow validation error: {e}")

    # --- RE tie ---
    re_tied = True
    re_diff = Decimal("0")
    if period_start is not None:
        eq_stmt = build_equity_statement(db, entity_id, period_start, as_of_date, scenario_ids)
        for line in eq_stmt.lines:
            acct_rows = [r for r in tb if r.account_id == line.account_id]
            if not acct_rows:
                continue
            # Check that opening + NI + contributions - distributions + other == closing
            expected = (
                line.opening_balance
                + line.net_income_allocation
                + line.contributions
                - line.distributions
                + line.other_changes
            )
            actual = line.closing_balance
            diff = expected - actual
            if abs(diff) > Decimal("0.01"):
                re_tied = False
                re_diff += diff
                warnings.append(
                    f"Equity account {line.account_number} rollforward does not tie: "
                    f"expected={expected}, actual={actual}"
                )

    return FsValidationResult(
        is_balanced=is_balanced,
        bs_difference=bs_diff,
        cf_tied=cf_tied,
        cf_difference=cf_diff,
        re_tied=re_tied,
        re_difference=re_diff,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Report Line Drilldown
# ---------------------------------------------------------------------------

def get_report_line_drilldown(
    db: Session,
    entity_id: int,
    as_of_date: datetime.date,
    scenario_ids: Sequence[int],
    fs_line_code: str,
) -> ReportLineDrilldown | None:
    """
    Resolve a report line code to its contributing accounts and journal entries.

    Returns None if the FS line code is not found or has no mapped accounts.
    """
    from app.models.fs_line_item import FsLineItem
    from app.models.account_mapping import AccountMapping
    from sqlalchemy import or_

    line = db.query(FsLineItem).filter(FsLineItem.code == fs_line_code).first()
    if not line:
        return None

    # Find accounts mapped to this line
    mappings = (
        db.query(AccountMapping)
        .filter(
            AccountMapping.fs_line_item_id == line.id,
            or_(
                AccountMapping.entity_id == entity_id,
                AccountMapping.entity_id.is_(None),
            ),
            AccountMapping.effective_from <= as_of_date,
            AccountMapping.effective_to >= as_of_date,
        )
        .all()
    )

    if not mappings:
        return ReportLineDrilldown(
            fs_line_code=fs_line_code,
            fs_line_name=line.name,
            total_balance=Decimal("0"),
            accounts=[],
        )

    from app.models.import_batch import ImportBatch
    from app.models.pdf_import_batch import PDFImportBatch
    from app.models.document_link import DocumentLink
    from app.models.document import Document

    # Fetch and cache imports and docs
    tbs = db.query(ImportBatch).filter(ImportBatch.entity_id == entity_id).all()
    posted_je_to_tb = {tb.posted_je_id: tb for tb in tbs if tb.posted_je_id is not None}
    id_to_tb = {tb.id: tb for tb in tbs}

    pdfs = db.query(PDFImportBatch).filter(PDFImportBatch.entity_id == entity_id).all()
    id_to_pdf = {p.id: p for p in pdfs}

    doc_links = db.query(DocumentLink, Document).join(Document, Document.id == DocumentLink.document_id).all()
    doc_map = {}
    for link, doc in doc_links:
        doc_map[(link.linked_object_type, link.linked_object_id)] = doc

    acct_ids = [m.account_id for m in mappings]
    accounts = {a.id: a for a in db.query(Account).filter(Account.id.in_(acct_ids)).all()}

    drill_accounts: list[DrilldownAccount] = []
    total = Decimal("0")

    for mapping in mappings:
        acct_id = mapping.account_id
        acct = accounts.get(acct_id)
        if acct is None:
            continue

        # Get JEs for this account
        je_rows = (
            db.query(JournalEntry, JournalEntryLine)
            .join(JournalEntryLine, JournalEntryLine.journal_entry_id == JournalEntry.id)
            .filter(
                JournalEntryLine.account_id == acct_id,
                JournalEntryLine.entity_id == entity_id,
                JournalEntry.entry_date <= as_of_date,
                JournalEntry.scenario_id.in_(scenario_ids),
                JournalEntry.status == "posted",
            )
            .order_by(JournalEntry.entry_date)
            .all()
        )

        net_debit = Decimal("0")
        je_list: list[DrilldownJournalEntry] = []
        for je, jel in je_rows:
            net_debit += jel.debit - jel.credit

            source_import_id = None
            source_import_filename = None
            doc_id = None
            doc_name = None

            if je.source == "tb_import":
                tb = posted_je_to_tb.get(je.id)
                if not tb and je.source_ref and je.source_ref.startswith("batch:"):
                    try:
                        b_id = int(je.source_ref.split(":")[-1])
                        tb = id_to_tb.get(b_id)
                    except ValueError:
                        pass
                if tb:
                    source_import_id = tb.id
                    source_import_filename = tb.filename
                    d = doc_map.get(("tb_import", tb.id))
                    if d:
                        doc_id = d.id
                        doc_name = d.original_file_name
            elif je.source == "pdf_import":
                pdf = None
                if je.source_ref and je.source_ref.startswith("batch:"):
                    try:
                        b_id = int(je.source_ref.split(":")[-1])
                        pdf = id_to_pdf.get(b_id)
                    except ValueError:
                        pass
                if pdf:
                    source_import_id = pdf.id
                    source_import_filename = pdf.filename
                    d = doc_map.get(("pdf_import", pdf.id))
                    if d:
                        doc_id = d.id
                        doc_name = d.original_file_name

            je_list.append(DrilldownJournalEntry(
                je_id=je.id,
                je_number=je.je_number,
                entry_date=str(je.entry_date),
                debit=jel.debit,
                credit=jel.credit,
                description=jel.description,
                source=je.source,
                source_ref=je.source_ref,
                source_import_id=source_import_id,
                source_import_filename=source_import_filename,
                document_id=doc_id,
                document_name=doc_name,
            ))

        signed = net_debit if acct.normal_balance == "debit" else -net_debit
        total += net_debit

        drill_accounts.append(DrilldownAccount(
            account_id=acct_id,
            account_number=acct.account_number,
            account_name=acct.account_name,
            net_debit=net_debit,
            signed_balance=signed,
            journal_entries=je_list,
        ))

    return ReportLineDrilldown(
        fs_line_code=fs_line_code,
        fs_line_name=line.name,
        total_balance=total,
        accounts=drill_accounts,
    )


# ---------------------------------------------------------------------------
# Multi-period trend builder
# ---------------------------------------------------------------------------

@dataclass
class TrendPeriod:
    label: str
    as_of_date: datetime.date
    scenario_ids: list[int]


@dataclass
class TrendRow:
    account_type: str
    label: str
    periods: dict[str, Decimal]  # period label → signed_balance


def build_trend_report(
    db: Session,
    entity_id: int,
    periods: list[TrendPeriod],
) -> list[TrendRow]:
    """
    Multi-period trend: returns one TrendRow per account type,
    with signed_balance for each period.
    """
    type_labels = {
        "asset": "Total Assets",
        "liability": "Total Liabilities",
        "equity": "Total Equity",
        "revenue": "Total Revenue",
        "expense": "Total Expenses",
    }

    rows: dict[str, dict[str, Decimal]] = {at: {} for at in type_labels}

    for period in periods:
        tb = get_trial_balance(db, entity_id, period.as_of_date, period.scenario_ids)
        totals: dict[str, Decimal] = {}
        for row in tb:
            totals[row.account_type] = totals.get(row.account_type, Decimal("0")) + row.signed_balance
        for at in type_labels:
            rows[at][period.label] = totals.get(at, Decimal("0"))

    return [
        TrendRow(account_type=at, label=label, periods=rows[at])
        for at, label in type_labels.items()
    ]
