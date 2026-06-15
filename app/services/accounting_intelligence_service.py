"""
Accounting Intelligence Engine — Sprint 3.12

Rules-based issue detection engine. Runs against a pair of accounting periods
(current + comparison) to surface potential accounting issues automatically.

Architecture
------------
- PeriodMetrics   : aggregated financial data for one period
- DetectionResult : an issue detected by a rule function
- run_detection() : entry point — computes metrics, runs all rules, persists results

Detection rules are plain functions: (current, prior, thresholds) -> list[DetectionResult]

Future AI integration
---------------------
DetectedIssue rows contain narrative_prompt / narrative_output / ai_explanation /
management_questions columns. These are stored but never populated here.
A future LLM layer will read `narrative_prompt` and write `narrative_output`.
"""

from __future__ import annotations

import datetime
import json
import logging
import uuid
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.models.account import Account
from app.models.accounting_period import AccountingPeriod
from app.models.detected_issue import DetectedIssue, IssueDetectionThreshold
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine


# ---------------------------------------------------------------------------
# Default thresholds
# ---------------------------------------------------------------------------

_DEFAULTS: dict[str, tuple[str, Decimal]] = {
    # (threshold_type, default_value)
    "AR_GROWTH_EXCEEDS_REVENUE":      ("pct_change",  Decimal("10")),   # AR growth > Revenue growth by 10pp
    "REVENUE_SPIKE":                   ("pct_change",  Decimal("25")),   # Revenue change > 25%
    "INVENTORY_GROWTH_EXCEEDS_SALES":  ("pct_change",  Decimal("10")),   # Inventory > Sales by 10pp
    "CASH_DECLINE_POSITIVE_EARNINGS":  ("absolute",    Decimal("0")),    # Cash down, NI up
    "PAYROLL_GROWTH_EXCEEDS_REVENUE":  ("pct_change",  Decimal("10")),   # Payroll > Revenue by 10pp
    "DEBT_INCREASE":                   ("pct_change",  Decimal("20")),   # Debt up > 20%
    "EQUITY_UNEXPECTED_DECREASE":      ("absolute",    Decimal("0")),    # Equity down without losses
    "WORKING_CAPITAL_DETERIORATION":   ("ratio",       Decimal("0.20")), # Current ratio dropped > 0.20
    "GROSS_MARGIN_COMPRESSION":        ("pp_change",   Decimal("3")),    # GM dropped > 3 percentage points
    "EXPENSE_FLUCTUATION":             ("pct_change",  Decimal("20")),   # Any expense category > 20%
    "NEGATIVE_OPERATING_CASH":         ("absolute",    Decimal("0")),    # Operating CF negative
}


# ---------------------------------------------------------------------------
# Period financial metrics
# ---------------------------------------------------------------------------

@dataclass
class PeriodMetrics:
    period_id: int
    period_name: str
    start_date: datetime.date
    end_date: datetime.date

    # Income statement
    revenue: Decimal = Decimal(0)
    cogs: Decimal = Decimal(0)
    gross_profit: Decimal = Decimal(0)
    gross_margin_pct: Optional[Decimal] = None          # 0–100
    total_expenses: Decimal = Decimal(0)
    payroll_expense: Decimal = Decimal(0)
    net_income: Decimal = Decimal(0)

    # Balance sheet
    cash: Decimal = Decimal(0)
    accounts_receivable: Decimal = Decimal(0)
    inventory: Decimal = Decimal(0)
    total_current_assets: Decimal = Decimal(0)
    total_assets: Decimal = Decimal(0)
    total_current_liabilities: Decimal = Decimal(0)
    total_liabilities: Decimal = Decimal(0)
    total_debt: Decimal = Decimal(0)       # LT debt + current portion LTD
    total_equity: Decimal = Decimal(0)

    # Derived ratios
    current_ratio: Optional[Decimal] = None
    working_capital: Decimal = Decimal(0)

    # Account-level detail for affected_accounts reporting
    account_balances: dict[int, tuple[str, Decimal]] = field(default_factory=dict)
    # {account_id: (account_number, signed_balance)}


# ---------------------------------------------------------------------------
# Detection result (pre-persist)
# ---------------------------------------------------------------------------

@dataclass
class DetectionResult:
    issue_code: str
    category: str
    severity: str
    title: str
    description: str
    detection_trigger: str
    affected_account_ids: list[int] = field(default_factory=list)
    supporting_metrics: dict = field(default_factory=dict)
    suggested_procedures: str = ""
    suggested_ajes: str = ""


# ---------------------------------------------------------------------------
# Account range helpers (mirrors financial_statement_service conventions)
# ---------------------------------------------------------------------------

def _acct_num_int(num: str) -> int:
    try:
        return int(num.replace("-", "").split(".")[0][:6])
    except (ValueError, IndexError):
        return 0


def _is_cash(acct: Account) -> bool:
    n = _acct_num_int(acct.account_number)
    return acct.account_type == "asset" and 1000 <= n <= 1099


def _is_ar(acct: Account) -> bool:
    n = _acct_num_int(acct.account_number)
    return acct.account_type == "asset" and 1100 <= n <= 1199


def _is_inventory(acct: Account) -> bool:
    n = _acct_num_int(acct.account_number)
    return acct.account_type == "asset" and 1200 <= n <= 1399


def _is_current_asset(acct: Account) -> bool:
    n = _acct_num_int(acct.account_number)
    return acct.account_type == "asset" and 1000 <= n <= 1499


def _is_current_liability(acct: Account) -> bool:
    n = _acct_num_int(acct.account_number)
    return acct.account_type == "liability" and 2000 <= n <= 2499


def _is_lt_debt(acct: Account) -> bool:
    n = _acct_num_int(acct.account_number)
    return acct.account_type == "liability" and 2500 <= n <= 2999


def _is_payroll_expense(acct: Account) -> bool:
    name = acct.account_name.lower()
    return acct.account_type in ("expense",) and any(
        kw in name for kw in ("payroll", "salary", "salaries", "wages", "compensation", "benefits")
    )


# ---------------------------------------------------------------------------
# Metrics computation
# ---------------------------------------------------------------------------

def _get_account_balances(
    db: Session,
    entity_id: int,
    start_date: datetime.date,
    end_date: datetime.date,
    scenario_id: int | None,
) -> dict[int, tuple[Account, Decimal]]:
    """Return {account_id: (account, signed_balance)} for a date range."""
    rows = (
        db.query(
            Account,
            func.sum(JournalEntryLine.debit - JournalEntryLine.credit).label("net_debit"),
        )
        .join(JournalEntryLine, JournalEntryLine.account_id == Account.id)
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .filter(
            JournalEntryLine.entity_id == entity_id,
            JournalEntry.entry_date >= start_date,
            JournalEntry.entry_date <= end_date,
            JournalEntry.status == "posted",
        )
        .group_by(Account.id)
    )
    if scenario_id is not None:
        rows = rows.filter(JournalEntry.scenario_id == scenario_id)

    result: dict[int, tuple[Account, Decimal]] = {}
    for acct, net_debit in rows.all():
        nd = Decimal(str(net_debit or 0))
        # Sign: positive = natural balance direction (matches comparative_report_service)
        if acct.account_type in ("revenue", "liability", "equity", "other_income"):
            signed = -nd   # credit-normal
        else:
            signed = nd    # debit-normal: asset, expense, cogs, tax, intercompany
        result[acct.id] = (acct, signed)
    return result


def _compute_metrics(
    db: Session,
    entity_id: int,
    period: AccountingPeriod,
    scenario_id: int | None,
) -> PeriodMetrics:
    balances = _get_account_balances(
        db, entity_id, period.start_date, period.end_date, scenario_id
    )

    m = PeriodMetrics(
        period_id=period.id,
        period_name=period.period_name,
        start_date=period.start_date,
        end_date=period.end_date,
    )

    for account_id, (acct, signed) in balances.items():
        m.account_balances[account_id] = (acct.account_number, signed)

        if acct.account_type == "revenue":
            m.revenue += signed
        elif acct.account_type == "cogs":
            m.cogs += signed
        elif acct.account_type == "expense":
            m.total_expenses += signed
            if _is_payroll_expense(acct):
                m.payroll_expense += signed
        elif acct.account_type == "asset":
            m.total_assets += signed
            if _is_cash(acct):
                m.cash += signed
            if _is_ar(acct):
                m.accounts_receivable += signed
            if _is_inventory(acct):
                m.inventory += signed
            if _is_current_asset(acct):
                m.total_current_assets += signed
        elif acct.account_type == "liability":
            m.total_liabilities += signed
            if _is_current_liability(acct):
                m.total_current_liabilities += signed
            if _is_lt_debt(acct):
                m.total_debt += signed
        elif acct.account_type == "equity":
            m.total_equity += signed

    m.gross_profit = m.revenue - m.cogs
    m.net_income = m.gross_profit - m.total_expenses
    m.working_capital = m.total_current_assets - m.total_current_liabilities

    if m.revenue != 0:
        m.gross_margin_pct = (m.gross_profit / m.revenue * 100).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
    if m.total_current_liabilities != 0:
        m.current_ratio = (m.total_current_assets / m.total_current_liabilities).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )

    return m


# ---------------------------------------------------------------------------
# Threshold helpers
# ---------------------------------------------------------------------------

def _load_thresholds(
    db: Session,
    entity_id: int,
) -> dict[str, Decimal]:
    """Return {issue_code: threshold_value} merging entity overrides over defaults."""
    thresholds = {k: v for k, (_, v) in _DEFAULTS.items()}

    overrides = (
        db.query(IssueDetectionThreshold)
        .filter(
            IssueDetectionThreshold.entity_id.in_([entity_id, None]),
            IssueDetectionThreshold.is_active == True,
        )
        .all()
    )
    for row in overrides:
        try:
            val = Decimal(row.threshold_value)
            # Entity-specific overrides win over global defaults
            if row.entity_id == entity_id or row.issue_code not in thresholds:
                thresholds[row.issue_code] = val
        except Exception:
            pass

    return thresholds


# ---------------------------------------------------------------------------
# Percentage change helper
# ---------------------------------------------------------------------------

def _pct_change(current: Decimal, prior: Decimal) -> Optional[Decimal]:
    if prior == 0:
        return None
    return ((current - prior) / abs(prior) * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _fmt_pct(val: Optional[Decimal]) -> str:
    if val is None:
        return "N/A"
    sign = "+" if val >= 0 else ""
    return f"{sign}{val}%"


def _fmt_amt(val: Decimal) -> str:
    sign = "+" if val >= 0 else ""
    return f"{sign}${val:,.0f}"


# ---------------------------------------------------------------------------
# Detection rules
# ---------------------------------------------------------------------------

def _rule_ar_growth_exceeds_revenue(
    cur: PeriodMetrics,
    pri: PeriodMetrics,
    thresholds: dict[str, Decimal],
) -> list[DetectionResult]:
    code = "AR_GROWTH_EXCEEDS_REVENUE"
    threshold = thresholds.get(code, Decimal("10"))

    rev_chg = _pct_change(cur.revenue, pri.revenue)
    ar_chg = _pct_change(cur.accounts_receivable, pri.accounts_receivable)

    if rev_chg is None or ar_chg is None:
        return []
    if cur.accounts_receivable <= 0 and pri.accounts_receivable <= 0:
        return []

    spread = ar_chg - rev_chg
    if spread <= threshold:
        return []

    return [DetectionResult(
        issue_code=code,
        category="accounts_receivable",
        severity="high",
        title="Accounts Receivable Growth Exceeds Revenue Growth",
        description=(
            f"AR grew {_fmt_pct(ar_chg)} versus revenue growth of {_fmt_pct(rev_chg)}, "
            f"a spread of {spread:.1f} percentage points. Accelerating AR relative to revenue "
            "may indicate collection issues, premature revenue recognition, or channel stuffing."
        ),
        detection_trigger=(
            f"AR change ({_fmt_pct(ar_chg)}) exceeded revenue change ({_fmt_pct(rev_chg)}) "
            f"by {spread:.1f}pp, threshold is {threshold}pp"
        ),
        supporting_metrics={
            "revenue_current": str(cur.revenue),
            "revenue_prior": str(pri.revenue),
            "revenue_change_pct": str(rev_chg),
            "ar_current": str(cur.accounts_receivable),
            "ar_prior": str(pri.accounts_receivable),
            "ar_change_pct": str(ar_chg),
            "spread_pp": str(spread),
        },
        suggested_procedures=(
            "1. Obtain aged AR schedule and identify accounts > 90 days.\n"
            "2. Confirm revenue recognition timing — ensure revenue is recorded in the correct period.\n"
            "3. Inquire about any bill-and-hold arrangements or side agreements.\n"
            "4. Test subsequent cash receipts for the largest AR balances.\n"
            "5. Review allowance for doubtful accounts for adequacy."
        ),
        suggested_ajes=(
            "Consider: AJE to increase Allowance for Doubtful Accounts if specific accounts are uncollectible.\n"
            "Consider: AJE to defer revenue if recognition criteria were not met at period end."
        ),
    )]


def _rule_revenue_spike(
    cur: PeriodMetrics,
    pri: PeriodMetrics,
    thresholds: dict[str, Decimal],
) -> list[DetectionResult]:
    code = "REVENUE_SPIKE"
    threshold = thresholds.get(code, Decimal("25"))

    rev_chg = _pct_change(cur.revenue, pri.revenue)
    if rev_chg is None or abs(rev_chg) <= threshold:
        return []
    if cur.revenue == 0 and pri.revenue == 0:
        return []

    direction = "increase" if rev_chg > 0 else "decrease"
    severity = "high" if abs(rev_chg) > 50 else "moderate"

    return [DetectionResult(
        issue_code=code,
        category="revenue_recognition",
        severity=severity,
        title=f"Unusual Revenue {direction.capitalize()} ({_fmt_pct(rev_chg)})",
        description=(
            f"Revenue changed {_fmt_pct(rev_chg)} from {pri.period_name} to {cur.period_name}. "
            f"Unusual revenue movements warrant examination of recognition policies and completeness."
        ),
        detection_trigger=f"Revenue change {_fmt_pct(rev_chg)} exceeded threshold ±{threshold}%",
        supporting_metrics={
            "revenue_current": str(cur.revenue),
            "revenue_prior": str(pri.revenue),
            "revenue_change_pct": str(rev_chg),
        },
        suggested_procedures=(
            "1. Review revenue recognition policy and test application.\n"
            "2. Examine cutoff — confirm revenue is recorded in correct periods.\n"
            "3. Obtain support for top 10 revenue transactions in current period.\n"
            "4. Compare revenue by product/service line to identify concentration changes.\n"
            "5. Test for related-party sales."
        ),
        suggested_ajes=(
            "Consider: AJE to defer revenue recognized before delivery/performance obligation met.\n"
            "Consider: AJE to record revenue earned but not yet billed (unbilled AR)."
        ),
    )]


def _rule_inventory_growth_exceeds_sales(
    cur: PeriodMetrics,
    pri: PeriodMetrics,
    thresholds: dict[str, Decimal],
) -> list[DetectionResult]:
    code = "INVENTORY_GROWTH_EXCEEDS_SALES"
    threshold = thresholds.get(code, Decimal("10"))

    if cur.inventory <= 0 and pri.inventory <= 0:
        return []

    inv_chg = _pct_change(cur.inventory, pri.inventory)
    rev_chg = _pct_change(cur.revenue, pri.revenue)

    if inv_chg is None or rev_chg is None:
        return []

    spread = inv_chg - rev_chg
    if spread <= threshold:
        return []

    return [DetectionResult(
        issue_code=code,
        category="inventory",
        severity="moderate",
        title="Inventory Growth Exceeds Revenue Growth",
        description=(
            f"Inventory grew {_fmt_pct(inv_chg)} while revenue grew {_fmt_pct(rev_chg)}, "
            f"a spread of {spread:.1f}pp. Inventory accumulating faster than sales may "
            "indicate slow-moving stock, obsolescence, or over-purchasing."
        ),
        detection_trigger=(
            f"Inventory change ({_fmt_pct(inv_chg)}) exceeded revenue change ({_fmt_pct(rev_chg)}) "
            f"by {spread:.1f}pp, threshold is {threshold}pp"
        ),
        supporting_metrics={
            "inventory_current": str(cur.inventory),
            "inventory_prior": str(pri.inventory),
            "inventory_change_pct": str(inv_chg),
            "revenue_change_pct": str(rev_chg),
            "spread_pp": str(spread),
        },
        suggested_procedures=(
            "1. Obtain inventory aging or slow-moving analysis.\n"
            "2. Inquire about any recent write-downs or obsolescence reserves.\n"
            "3. Test FIFO/LIFO/WAC costing consistency.\n"
            "4. Verify physical inventory count procedures.\n"
            "5. Review any consignment or vendor-managed inventory arrangements."
        ),
        suggested_ajes=(
            "Consider: AJE to record inventory write-down for obsolete or slow-moving items.\n"
            "Consider: AJE to adjust lower-of-cost-or-NRV if market value declined."
        ),
    )]


def _rule_cash_decline_positive_earnings(
    cur: PeriodMetrics,
    pri: PeriodMetrics,
    thresholds: dict[str, Decimal],
) -> list[DetectionResult]:
    code = "CASH_DECLINE_POSITIVE_EARNINGS"

    cash_chg = cur.cash - pri.cash
    if cash_chg >= 0:
        return []
    if cur.net_income <= 0:
        return []

    severity = "high" if abs(cash_chg) > cur.net_income else "moderate"

    return [DetectionResult(
        issue_code=code,
        category="cash",
        severity=severity,
        title="Cash Decline Despite Positive Earnings",
        description=(
            f"Cash decreased {_fmt_amt(cash_chg)} while net income was {_fmt_amt(cur.net_income)}. "
            "Cash declining with positive earnings may indicate aggressive accruals, "
            "working capital deterioration, or unrecorded cash outflows."
        ),
        detection_trigger=(
            f"Cash change {_fmt_amt(cash_chg)} is negative; net income {_fmt_amt(cur.net_income)} is positive"
        ),
        supporting_metrics={
            "cash_current": str(cur.cash),
            "cash_prior": str(pri.cash),
            "cash_change": str(cash_chg),
            "net_income": str(cur.net_income),
        },
        suggested_procedures=(
            "1. Review cash flow statement — identify uses of cash.\n"
            "2. Examine working capital changes (AR, inventory, AP) for abnormal movements.\n"
            "3. Review capital expenditures and debt repayments.\n"
            "4. Test for any unrecorded liabilities or undisclosed cash outflows.\n"
            "5. Verify bank reconciliations are current."
        ),
        suggested_ajes=(
            "Consider: AJE to record accrued liabilities if expenses are understated.\n"
            "Consider: AJE to correct overstatement of accrual-basis income items."
        ),
    )]


def _rule_payroll_growth_exceeds_revenue(
    cur: PeriodMetrics,
    pri: PeriodMetrics,
    thresholds: dict[str, Decimal],
) -> list[DetectionResult]:
    code = "PAYROLL_GROWTH_EXCEEDS_REVENUE"
    threshold = thresholds.get(code, Decimal("10"))

    if cur.payroll_expense <= 0 and pri.payroll_expense <= 0:
        return []

    pay_chg = _pct_change(cur.payroll_expense, pri.payroll_expense)
    rev_chg = _pct_change(cur.revenue, pri.revenue)

    if pay_chg is None or rev_chg is None:
        return []

    spread = pay_chg - rev_chg
    if spread <= threshold:
        return []

    return [DetectionResult(
        issue_code=code,
        category="payroll",
        severity="moderate",
        title="Payroll Growth Exceeds Revenue Growth",
        description=(
            f"Payroll/compensation expense grew {_fmt_pct(pay_chg)} versus revenue growth of "
            f"{_fmt_pct(rev_chg)}, a spread of {spread:.1f}pp. "
            "Payroll growing faster than revenue creates margin pressure and may indicate "
            "improper classification, ghost employees, or unauthorized compensation."
        ),
        detection_trigger=(
            f"Payroll change ({_fmt_pct(pay_chg)}) exceeded revenue change ({_fmt_pct(rev_chg)}) "
            f"by {spread:.1f}pp"
        ),
        supporting_metrics={
            "payroll_current": str(cur.payroll_expense),
            "payroll_prior": str(pri.payroll_expense),
            "payroll_change_pct": str(pay_chg),
            "revenue_change_pct": str(rev_chg),
            "spread_pp": str(spread),
        },
        suggested_procedures=(
            "1. Obtain headcount reconciliation — compare beginning and ending headcount.\n"
            "2. Test payroll registers for unusual payments or non-recurring items.\n"
            "3. Review owner compensation for reasonableness vs. industry norms.\n"
            "4. Examine classification — ensure personal expenses not in payroll accounts.\n"
            "5. Check for accrued vacation or bonus reversals that distort prior period."
        ),
        suggested_ajes=(
            "Consider: AJE to reclassify personal or non-business expenses from payroll.\n"
            "Consider: AJE to normalize owner compensation to market rate for QoE."
        ),
    )]


def _rule_debt_increase(
    cur: PeriodMetrics,
    pri: PeriodMetrics,
    thresholds: dict[str, Decimal],
) -> list[DetectionResult]:
    code = "DEBT_INCREASE"
    threshold = thresholds.get(code, Decimal("20"))

    if pri.total_debt <= 0:
        return []

    debt_chg = _pct_change(cur.total_debt, pri.total_debt)
    if debt_chg is None or debt_chg <= threshold:
        return []

    return [DetectionResult(
        issue_code=code,
        category="debt",
        severity="moderate",
        title=f"Significant Debt Increase ({_fmt_pct(debt_chg)})",
        description=(
            f"Total long-term debt increased {_fmt_pct(debt_chg)} from {pri.period_name} to "
            f"{cur.period_name}. New debt should be evaluated for proper classification, "
            "disclosure requirements, and covenant compliance."
        ),
        detection_trigger=f"Debt change {_fmt_pct(debt_chg)} exceeded threshold {threshold}%",
        supporting_metrics={
            "debt_current": str(cur.total_debt),
            "debt_prior": str(pri.total_debt),
            "debt_change_pct": str(debt_chg),
            "equity_current": str(cur.total_equity),
        },
        suggested_procedures=(
            "1. Obtain copies of new debt agreements and review key terms.\n"
            "2. Verify proper current/non-current classification.\n"
            "3. Confirm debt covenants are disclosed and no violations exist.\n"
            "4. Test accrued interest calculations.\n"
            "5. Review for related-party debt arrangements."
        ),
        suggested_ajes=(
            "Consider: AJE to reclassify current portion of long-term debt.\n"
            "Consider: AJE to record debt issuance costs as a contra-liability."
        ),
    )]


def _rule_working_capital_deterioration(
    cur: PeriodMetrics,
    pri: PeriodMetrics,
    thresholds: dict[str, Decimal],
) -> list[DetectionResult]:
    code = "WORKING_CAPITAL_DETERIORATION"
    threshold = thresholds.get(code, Decimal("0.20"))

    if pri.current_ratio is None or cur.current_ratio is None:
        return []

    ratio_chg = cur.current_ratio - pri.current_ratio
    if ratio_chg >= -threshold:
        return []

    severity = "critical" if cur.current_ratio < Decimal("1.0") else "high"

    return [DetectionResult(
        issue_code=code,
        category="working_capital",
        severity=severity,
        title="Working Capital Deterioration",
        description=(
            f"Current ratio declined from {pri.current_ratio} to {cur.current_ratio} "
            f"({ratio_chg:+.2f}). Working capital is ${cur.working_capital:,.0f}. "
            + ("Current ratio below 1.0 indicates current liabilities exceed current assets. " if cur.current_ratio < 1 else "")
            + "Deteriorating liquidity may signal going concern risks."
        ),
        detection_trigger=(
            f"Current ratio dropped {ratio_chg:.2f} (from {pri.current_ratio} to {cur.current_ratio}), "
            f"threshold is {threshold}"
        ),
        supporting_metrics={
            "current_ratio_current": str(cur.current_ratio),
            "current_ratio_prior": str(pri.current_ratio),
            "current_ratio_change": str(ratio_chg),
            "working_capital": str(cur.working_capital),
            "current_assets": str(cur.total_current_assets),
            "current_liabilities": str(cur.total_current_liabilities),
        },
        suggested_procedures=(
            "1. Review current portion of long-term debt for proper classification.\n"
            "2. Examine accounts payable aging — identify any deferred payments.\n"
            "3. Test accrued liabilities for completeness.\n"
            "4. Review any line-of-credit utilization and available borrowing capacity.\n"
            "5. Evaluate whether going concern disclosure is required."
        ),
        suggested_ajes=(
            "Consider: AJE to reclassify long-term debt maturing within 12 months to current.\n"
            "Consider: AJE to record unrecorded current accruals."
        ),
    )]


def _rule_gross_margin_compression(
    cur: PeriodMetrics,
    pri: PeriodMetrics,
    thresholds: dict[str, Decimal],
) -> list[DetectionResult]:
    code = "GROSS_MARGIN_COMPRESSION"
    threshold = thresholds.get(code, Decimal("3"))

    if cur.gross_margin_pct is None or pri.gross_margin_pct is None:
        return []

    gm_chg = cur.gross_margin_pct - pri.gross_margin_pct
    if gm_chg >= -threshold:
        return []

    severity = "high" if abs(gm_chg) > 8 else "moderate"

    return [DetectionResult(
        issue_code=code,
        category="gross_margin",
        severity=severity,
        title=f"Gross Margin Compression ({gm_chg:+.1f}pp)",
        description=(
            f"Gross margin declined from {pri.gross_margin_pct}% to {cur.gross_margin_pct}% "
            f"({gm_chg:+.1f} percentage points). Margin compression may indicate pricing pressure, "
            "cost overruns, inventory valuation changes, or revenue/COGS mismatches."
        ),
        detection_trigger=(
            f"Gross margin dropped {gm_chg:.1f}pp, threshold is {threshold}pp"
        ),
        supporting_metrics={
            "gross_margin_current_pct": str(cur.gross_margin_pct),
            "gross_margin_prior_pct": str(pri.gross_margin_pct),
            "gm_change_pp": str(gm_chg),
            "revenue_current": str(cur.revenue),
            "cogs_current": str(cur.cogs),
        },
        suggested_procedures=(
            "1. Reconcile COGS components — materials, labor, overhead.\n"
            "2. Test for misclassified expenses in COGS vs. operating expenses.\n"
            "3. Review inventory costing method and any write-downs.\n"
            "4. Compare pricing trends — obtain price lists from beginning and end of period.\n"
            "5. Investigate vendor rebates, discounts, or credit notes recorded in COGS."
        ),
        suggested_ajes=(
            "Consider: AJE to reclassify selling/admin expenses incorrectly booked to COGS.\n"
            "Consider: AJE to record vendor rebates earned but not yet received."
        ),
    )]


def _rule_equity_unexpected_decrease(
    cur: PeriodMetrics,
    pri: PeriodMetrics,
    thresholds: dict[str, Decimal],
) -> list[DetectionResult]:
    code = "EQUITY_UNEXPECTED_DECREASE"

    equity_chg = cur.total_equity - pri.total_equity
    if equity_chg >= 0:
        return []
    if cur.net_income < 0:
        return []

    return [DetectionResult(
        issue_code=code,
        category="equity",
        severity="high",
        title="Equity Decreased Despite Positive Earnings",
        description=(
            f"Total equity decreased {_fmt_amt(equity_chg)} while net income was "
            f"{_fmt_amt(cur.net_income)}. Equity declining despite profits may indicate "
            "owner distributions, return of capital, or accounting errors."
        ),
        detection_trigger=(
            f"Equity change {_fmt_amt(equity_chg)} is negative; net income {_fmt_amt(cur.net_income)} is positive"
        ),
        supporting_metrics={
            "equity_current": str(cur.total_equity),
            "equity_prior": str(pri.total_equity),
            "equity_change": str(equity_chg),
            "net_income": str(cur.net_income),
        },
        suggested_procedures=(
            "1. Obtain equity rollforward — beginning balance + NI - distributions = ending balance.\n"
            "2. Identify and quantify owner distributions during the period.\n"
            "3. Review other comprehensive income items that may have reduced equity.\n"
            "4. Test for any unauthorized equity transactions.\n"
            "5. Confirm retained earnings reconciles to cumulative net income less distributions."
        ),
        suggested_ajes=(
            "Consider: AJE to correct misclassified distributions recorded as expenses.\n"
            "Consider: AJE to record return of capital if assets were removed without proper recording."
        ),
    )]


def _rule_expense_fluctuation(
    cur: PeriodMetrics,
    pri: PeriodMetrics,
    thresholds: dict[str, Decimal],
) -> list[DetectionResult]:
    code = "EXPENSE_FLUCTUATION"
    threshold = thresholds.get(code, Decimal("20"))

    if pri.total_expenses == 0:
        return []

    exp_chg = _pct_change(cur.total_expenses, pri.total_expenses)
    if exp_chg is None or abs(exp_chg) <= threshold:
        return []

    direction = "increase" if exp_chg > 0 else "decrease"
    severity = "moderate"

    return [DetectionResult(
        issue_code=code,
        category="expense_fluctuation",
        severity=severity,
        title=f"Unusual Total Expense {direction.capitalize()} ({_fmt_pct(exp_chg)})",
        description=(
            f"Total operating expenses changed {_fmt_pct(exp_chg)} from "
            f"{pri.period_name} to {cur.period_name}. "
            "Large expense movements should be examined for completeness, "
            "proper period allocation, and classification."
        ),
        detection_trigger=f"Expense change {_fmt_pct(exp_chg)} exceeded threshold ±{threshold}%",
        supporting_metrics={
            "expenses_current": str(cur.total_expenses),
            "expenses_prior": str(pri.total_expenses),
            "expense_change_pct": str(exp_chg),
        },
        suggested_procedures=(
            "1. Decompose expense change by category to identify drivers.\n"
            "2. Test largest expense accounts for supporting documentation.\n"
            "3. Verify prepaid/accrual consistency across periods.\n"
            "4. Review for any large non-recurring items.\n"
            "5. Compare to budget or forecast if available."
        ),
        suggested_ajes=(
            "Consider: AJE to defer prepaid expenses recognized too early.\n"
            "Consider: AJE to accrue expenses incurred but not yet recorded."
        ),
    )]


# ---------------------------------------------------------------------------
# Single-period account-level detection (no prior period required)
# ---------------------------------------------------------------------------

@dataclass
class AccountFinding:
    issue_code: str
    category: str
    severity: str
    title: str
    description: str
    detection_trigger: str
    suggested_procedures: str
    suggested_ajes: str
    account_numbers: list[str] = field(default_factory=list)


def run_single_period_detection(
    db: Session,
    entity_id: int,
    period: AccountingPeriod,
    scenario_id: int | None = None,
) -> list[dict]:
    """
    Account-level analysis rules that require only ONE period.
    Returns findings even when no comparison period exists.
    """
    balances = _get_account_balances(db, entity_id, period.start_date, period.end_date, scenario_id)
    findings: list[AccountFinding] = []

    # Aggregate by category
    cash_accounts: list[tuple[str, Decimal]] = []
    ar_accounts: list[tuple[str, Decimal]] = []
    revenue_accounts: list[tuple[str, Decimal]] = []
    expense_accounts: list[tuple[str, Decimal]] = []
    equity_accounts: list[tuple[str, Decimal]] = []
    suspense_accounts: list[tuple[str, Decimal]] = []
    accum_dep_accounts: list[tuple[str, Decimal]] = []

    total_revenue = Decimal(0)
    total_ar = Decimal(0)
    total_assets = Decimal(0)
    total_liabilities = Decimal(0)
    total_equity = Decimal(0)

    for acct_id, (acct, signed) in balances.items():
        n = _acct_num_int(acct.account_number)
        name_lower = acct.account_name.lower()

        if _is_cash(acct):
            cash_accounts.append((acct.account_number, signed))
        if _is_ar(acct):
            ar_accounts.append((acct.account_number, signed))
            total_ar += signed
        if acct.account_type == "revenue":
            revenue_accounts.append((acct.account_number, signed))
            total_revenue += signed
        if acct.account_type in ("expense", "cogs"):
            expense_accounts.append((acct.account_number, signed))
        if acct.account_type == "equity":
            equity_accounts.append((acct.account_number, signed))
            total_equity += signed
        if acct.account_type == "asset":
            total_assets += signed
        if acct.account_type == "liability":
            total_liabilities += signed
        if any(kw in name_lower for kw in ("suspense", "clearing", "unallocated", "due to/from")):
            suspense_accounts.append((acct.account_number, signed))
        if any(kw in name_lower for kw in ("accumulated depreciation", "accum dep", "accum. dep")):
            accum_dep_accounts.append((acct.account_number, signed))

    # Rule: Negative cash balance
    negative_cash = [(num, bal) for num, bal in cash_accounts if bal < 0]
    if negative_cash:
        acct_list = ", ".join(f"{num} (${abs(bal):,.0f})" for num, bal in negative_cash)
        findings.append(AccountFinding(
            issue_code="NEGATIVE_CASH_BALANCE",
            category="cash",
            severity="critical",
            title="Negative Cash Balance",
            description=f"Cash account(s) show a credit (negative) balance: {acct_list}. This may indicate unrecorded deposits, bank overdrafts, or a sign convention error.",
            detection_trigger=f"{len(negative_cash)} cash account(s) have negative balances",
            suggested_procedures=(
                "1. Obtain bank statements and reconcile to the GL balance.\n"
                "2. Identify any unrecorded deposits or outstanding checks.\n"
                "3. Verify account sign conventions in the trial balance.\n"
                "4. Check for bank overdraft facilities that may explain negative balances.\n"
                "5. Review for any bank transfers in transit."
            ),
            suggested_ajes=(
                "Consider: AJE to record undeposited funds or in-transit items.\n"
                "Consider: AJE to reclassify overdraft to current liabilities if material."
            ),
            account_numbers=[num for num, _ in negative_cash],
        ))

    # Rule: Revenue accounts with debit (net) balance — sign error
    revenue_debit = [(num, bal) for num, bal in revenue_accounts if bal < 0]
    if revenue_debit:
        acct_list = ", ".join(f"{num}" for num, _ in revenue_debit)
        findings.append(AccountFinding(
            issue_code="REVENUE_DEBIT_BALANCE",
            category="revenue_recognition",
            severity="critical",
            title="Revenue Account Has Debit Balance",
            description=f"Revenue account(s) {acct_list} show a net debit balance, which is opposite to normal. This typically indicates returns/refunds exceeding gross revenue, a sign convention error, or misclassified entries.",
            detection_trigger=f"Revenue accounts with debit balance: {acct_list}",
            suggested_procedures=(
                "1. Review all credits and debits posted to these revenue accounts.\n"
                "2. Check whether returns/refunds are properly separated from gross revenue.\n"
                "3. Verify that the trial balance sign convention matches the import format.\n"
                "4. Investigate any large debits posted to revenue — may be misclassified expenses.\n"
                "5. Confirm revenue recognition policy and cutoff."
            ),
            suggested_ajes=(
                "Consider: AJE to reclassify debit entries from revenue to expense if misclassified.\n"
                "Consider: AJE to correct period cutoff if entries were recorded in the wrong period."
            ),
            account_numbers=[num for num, _ in revenue_debit],
        ))

    # Rule: Accounts receivable credit balance (net)
    ar_credit = [(num, bal) for num, bal in ar_accounts if bal < 0]
    if ar_credit:
        acct_list = ", ".join(f"{num} (${abs(bal):,.0f} credit)" for num, _ in ar_credit)
        findings.append(AccountFinding(
            issue_code="NEGATIVE_ACCOUNTS_RECEIVABLE",
            category="accounts_receivable",
            severity="high",
            title="Accounts Receivable Credit Balance",
            description=f"AR account(s) {acct_list} have a net credit balance. This may indicate customer overpayments, duplicate credits, or a sign convention issue.",
            detection_trigger=f"AR accounts with credit balance: {acct_list}",
            suggested_procedures=(
                "1. Obtain detailed AR aging and review each account with a credit balance.\n"
                "2. Identify overpayments and determine whether refunds are owed.\n"
                "3. Verify that credit memos are properly applied to invoices.\n"
                "4. Check for duplicate payments or misapplied cash receipts."
            ),
            suggested_ajes=(
                "Consider: AJE to reclassify credit AR balances to customer deposits (current liability).\n"
                "Consider: AJE to write off small credit balances that will not be refunded."
            ),
            account_numbers=[num for num, _ in ar_credit],
        ))

    # Rule: AR exceeds annual revenue by 3x (implies >1 year DSO) — if revenue exists
    if total_revenue > 0 and total_ar > 0:
        dso_proxy = (total_ar / total_revenue) * 365
        if dso_proxy > 180:
            findings.append(AccountFinding(
                issue_code="HIGH_AR_DSO",
                category="accounts_receivable",
                severity="high",
                title=f"Extremely High Days Sales Outstanding (~{int(dso_proxy)} days)",
                description=f"AR balance of ${total_ar:,.0f} against revenue of ${total_revenue:,.0f} implies approximately {int(dso_proxy)} days DSO. Normal DSO for most businesses is 30–90 days.",
                detection_trigger=f"AR/Revenue ratio implies {int(dso_proxy)}-day DSO vs 180-day threshold",
                suggested_procedures=(
                    "1. Obtain AR aging schedule and identify overdue accounts.\n"
                    "2. Assess collectibility of balances > 90 days and > 120 days.\n"
                    "3. Review adequacy of the allowance for doubtful accounts.\n"
                    "4. Inquire whether AR includes non-trade items (loans to officers, advances).\n"
                    "5. Test subsequent cash receipts for largest balances."
                ),
                suggested_ajes=(
                    "Consider: AJE to increase allowance for doubtful accounts based on aging analysis.\n"
                    "Consider: AJE to reclassify non-trade receivables to loans receivable."
                ),
            ))

    # Rule: Large suspense/clearing account balances
    material_suspense = [(num, bal) for num, bal in suspense_accounts if abs(bal) > Decimal("1000")]
    if material_suspense:
        acct_list = ", ".join(f"{num} (${abs(bal):,.0f})" for num, bal in material_suspense)
        findings.append(AccountFinding(
            issue_code="MATERIAL_SUSPENSE_BALANCE",
            category="completeness",
            severity="high",
            title="Material Suspense or Clearing Account Balance",
            description=f"Suspense/clearing account(s) {acct_list} carry significant balances at period end. These should clear to zero as transactions are properly classified.",
            detection_trigger=f"Suspense/clearing accounts with material balances: {acct_list}",
            suggested_procedures=(
                "1. Obtain detail of all items in the suspense/clearing accounts.\n"
                "2. Determine the proper classification for each item.\n"
                "3. Verify that all items are supported by documentation.\n"
                "4. Determine why these items have not been cleared and resolved."
            ),
            suggested_ajes=(
                "Consider: AJE to reclassify suspense items to their proper account classifications.\n"
                "Consider: AJE to expense items that cannot be supported or properly classified."
            ),
            account_numbers=[num for num, _ in material_suspense],
        ))

    # Rule: Accumulated depreciation with debit balance
    accum_dep_debit = [(num, bal) for num, bal in accum_dep_accounts if bal > 0]
    if accum_dep_debit:
        acct_list = ", ".join(f"{num}" for num, _ in accum_dep_debit)
        findings.append(AccountFinding(
            issue_code="ACCUMULATED_DEPRECIATION_SIGN_ERROR",
            category="fixed_assets",
            severity="high",
            title="Accumulated Depreciation Has Debit Balance",
            description=f"Accumulated depreciation account(s) {acct_list} show a debit balance. Accumulated depreciation is a contra-asset and should always be a credit balance.",
            detection_trigger=f"Accum. dep. accounts with debit balance: {acct_list}",
            suggested_procedures=(
                "1. Review the depreciation schedule and reconcile to the GL.\n"
                "2. Verify that the sign convention in the trial balance is consistent.\n"
                "3. Check for any reversals or write-offs that may have produced incorrect balances."
            ),
            suggested_ajes=(
                "Consider: AJE to correct the sign if a data entry or import error occurred.\n"
                "Consider: AJE to record correct depreciation if the contra account was used in reverse."
            ),
            account_numbers=[num for num, _ in accum_dep_debit],
        ))

    # Rule: No revenue (on a period-end TB) — possible incompleteness
    if total_revenue == 0 and total_assets > Decimal("10000"):
        findings.append(AccountFinding(
            issue_code="ZERO_REVENUE",
            category="revenue_recognition",
            severity="high",
            title="No Revenue Recorded",
            description=f"No revenue balances are present on this trial balance despite total assets of ${total_assets:,.0f}. Revenue may not be recorded, may be misclassified, or the chart of accounts may be incomplete.",
            detection_trigger="Revenue = $0 with total assets > $10,000",
            suggested_procedures=(
                "1. Verify that revenue accounts are properly mapped in the chart of accounts.\n"
                "2. Confirm that the trial balance covers the full period (not just a stub period).\n"
                "3. Review any deferred revenue or customer deposit accounts.\n"
                "4. Inquire whether the entity has commenced operations."
            ),
            suggested_ajes=(
                "Consider: AJE to record earned but unbilled revenue (accrual basis).\n"
                "Consider: AJE to reclassify items incorrectly recorded in equity or liability accounts."
            ),
        ))

    # Rule: Large equity deficit — potential going concern
    if total_equity < Decimal("-50000") and total_assets > 0:
        if abs(total_equity) > total_assets * Decimal("0.5"):
            findings.append(AccountFinding(
                issue_code="EQUITY_DEFICIT_GOING_CONCERN",
                category="equity",
                severity="critical",
                title="Significant Equity Deficit — Potential Going Concern",
                description=f"Total equity is ${total_equity:,.0f} (deficit). The deficit represents {abs(total_equity) / total_assets * 100:.0f}% of total assets, which may raise going concern questions.",
                detection_trigger=f"Equity deficit ${abs(total_equity):,.0f} exceeds 50% of total assets ${total_assets:,.0f}",
                suggested_procedures=(
                    "1. Obtain management's business plan and cash flow projections.\n"
                    "2. Review subsequent financing events (equity raises, new debt facilities).\n"
                    "3. Assess whether liabilities can be satisfied from current and projected cash flows.\n"
                    "4. Consider whether going concern disclosure or modification is required.\n"
                    "5. Verify retained earnings reconciliation from prior year."
                ),
                suggested_ajes=(
                    "Consider: AJE to correct any overstatement of retained earnings deficit.\n"
                    "Consider: AJE for any debt that may need to be reclassified as current (covenant violations)."
                ),
            ))

    return [
        {
            "issue_code": f.issue_code,
            "category": f.category,
            "severity": f.severity,
            "title": f.title,
            "description": f.description,
            "detection_trigger": f.detection_trigger,
            "suggested_procedures": f.suggested_procedures,
            "suggested_ajes": f.suggested_ajes,
            "supporting_metrics": {"account_numbers": ", ".join(f.account_numbers)},
        }
        for f in findings
    ]


# All detection rules in priority order
_ALL_RULES = [
    _rule_ar_growth_exceeds_revenue,
    _rule_revenue_spike,
    _rule_inventory_growth_exceeds_sales,
    _rule_cash_decline_positive_earnings,
    _rule_payroll_growth_exceeds_revenue,
    _rule_debt_increase,
    _rule_working_capital_deterioration,
    _rule_gross_margin_compression,
    _rule_equity_unexpected_decrease,
    _rule_expense_fluctuation,
]

# Issue library — all defined rules with metadata (for Issue Repository)
ISSUE_LIBRARY: list[dict] = [
    {
        "issue_code": "AR_GROWTH_EXCEEDS_REVENUE",
        "category": "accounts_receivable",
        "name": "AR Growth Exceeds Revenue Growth",
        "description": "Accounts receivable grew faster than revenue, suggesting collection issues or premature recognition.",
        "default_severity": "high",
        "threshold_type": "pp_change",
        "default_threshold": "10",
    },
    {
        "issue_code": "REVENUE_SPIKE",
        "category": "revenue_recognition",
        "name": "Unusual Revenue Movement",
        "description": "Revenue changed by more than the threshold percentage versus prior period.",
        "default_severity": "high",
        "threshold_type": "pct_change",
        "default_threshold": "25",
    },
    {
        "issue_code": "INVENTORY_GROWTH_EXCEEDS_SALES",
        "category": "inventory",
        "name": "Inventory Growth Exceeds Sales Growth",
        "description": "Inventory accumulating faster than sales, suggesting obsolescence or over-purchasing.",
        "default_severity": "moderate",
        "threshold_type": "pp_change",
        "default_threshold": "10",
    },
    {
        "issue_code": "CASH_DECLINE_POSITIVE_EARNINGS",
        "category": "cash",
        "name": "Cash Decline with Positive Earnings",
        "description": "Cash decreased despite positive net income — may indicate aggressive accruals.",
        "default_severity": "high",
        "threshold_type": "absolute",
        "default_threshold": "0",
    },
    {
        "issue_code": "PAYROLL_GROWTH_EXCEEDS_REVENUE",
        "category": "payroll",
        "name": "Payroll Growth Exceeds Revenue Growth",
        "description": "Payroll growing faster than revenue creates margin pressure.",
        "default_severity": "moderate",
        "threshold_type": "pp_change",
        "default_threshold": "10",
    },
    {
        "issue_code": "DEBT_INCREASE",
        "category": "debt",
        "name": "Significant Debt Increase",
        "description": "Total debt increased beyond threshold, requiring classification and covenant review.",
        "default_severity": "moderate",
        "threshold_type": "pct_change",
        "default_threshold": "20",
    },
    {
        "issue_code": "WORKING_CAPITAL_DETERIORATION",
        "category": "working_capital",
        "name": "Working Capital Deterioration",
        "description": "Current ratio declined significantly; potential liquidity concern.",
        "default_severity": "high",
        "threshold_type": "ratio",
        "default_threshold": "0.20",
    },
    {
        "issue_code": "GROSS_MARGIN_COMPRESSION",
        "category": "gross_margin",
        "name": "Gross Margin Compression",
        "description": "Gross margin declined more than threshold percentage points.",
        "default_severity": "high",
        "threshold_type": "pp_change",
        "default_threshold": "3",
    },
    {
        "issue_code": "EQUITY_UNEXPECTED_DECREASE",
        "category": "equity",
        "name": "Equity Decreased Despite Positive Earnings",
        "description": "Total equity declined while the company was profitable — may indicate undisclosed distributions.",
        "default_severity": "high",
        "threshold_type": "absolute",
        "default_threshold": "0",
    },
    {
        "issue_code": "EXPENSE_FLUCTUATION",
        "category": "expense_fluctuation",
        "name": "Unusual Expense Fluctuation",
        "description": "Total operating expenses changed beyond threshold versus prior period.",
        "default_severity": "moderate",
        "threshold_type": "pct_change",
        "default_threshold": "20",
    },
]


# ---------------------------------------------------------------------------
# Diagnostics (ratios + period summary)
# ---------------------------------------------------------------------------

def compute_diagnostics(
    db: Session,
    entity_id: int,
    current_period_id: int,
    scenario_id: int | None = None,
) -> dict:
    """
    Return a flat dictionary of financial ratios and metrics for the current period.
    Used by the Financial Diagnostics page.
    """
    period = db.get(AccountingPeriod, current_period_id)
    if period is None:
        raise ValueError(f"Period {current_period_id} not found")

    m = _compute_metrics(db, entity_id, period, scenario_id)

    result: dict = {
        "period_id": m.period_id,
        "period_name": m.period_name,
        "revenue": str(m.revenue),
        "cogs": str(m.cogs),
        "gross_profit": str(m.gross_profit),
        "gross_margin_pct": str(m.gross_margin_pct) if m.gross_margin_pct is not None else None,
        "total_expenses": str(m.total_expenses),
        "net_income": str(m.net_income),
        "cash": str(m.cash),
        "accounts_receivable": str(m.accounts_receivable),
        "inventory": str(m.inventory),
        "total_current_assets": str(m.total_current_assets),
        "total_assets": str(m.total_assets),
        "total_current_liabilities": str(m.total_current_liabilities),
        "total_liabilities": str(m.total_liabilities),
        "total_equity": str(m.total_equity),
        "total_debt": str(m.total_debt),
        "working_capital": str(m.working_capital),
        "current_ratio": str(m.current_ratio) if m.current_ratio is not None else None,
        "debt_to_equity": str(
            (m.total_liabilities / m.total_equity).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        ) if m.total_equity > 0 else None,
        "roa": str(
            (m.net_income / m.total_assets * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        ) if m.total_assets > 0 else None,
        "balance_check": {
            "assets": str(m.total_assets),
            "liabilities_plus_equity": str(m.total_liabilities + m.total_equity),
            "balanced": abs(m.total_assets - (m.total_liabilities + m.total_equity)) < Decimal("0.01"),
        },
    }
    return result


# ---------------------------------------------------------------------------
# Metrics dict bridge — PeriodMetrics → evaluate_all_rules() format
# ---------------------------------------------------------------------------

def _build_metrics_dict(cur: PeriodMetrics, pri: PeriodMetrics) -> dict:
    """
    Convert two PeriodMetrics objects into the flat metrics dict expected by
    evaluate_all_rules().  The rule engine looks for:
      {metric}             → current-period float value
      {metric}_pct_change  → period-over-period % change
      {metric}_trend       → "declining" | "increasing" | "stable"
    Qualitative flags that require data not available in PeriodMetrics are
    omitted; existence/absent rules for those flags will not fire.
    """

    def _f(v) -> float:
        return float(v) if v is not None else 0.0

    def _pct(cur_v, pri_v) -> float | None:
        if pri_v == 0:
            return None
        return float(((cur_v - pri_v) / abs(pri_v)) * 100)

    def _trend(pct: float | None) -> str:
        if pct is None:
            return "stable"
        if pct < -2:
            return "declining"
        if pct > 2:
            return "increasing"
        return "stable"

    d: dict = {}

    # ── Quantitative metrics ──────────────────────────────────────────────────
    quantitative_fields = [
        "revenue", "cogs", "gross_profit", "gross_margin_pct",
        "total_expenses", "payroll_expense", "net_income",
        "cash", "accounts_receivable", "inventory",
        "total_current_assets", "total_assets",
        "total_current_liabilities", "total_liabilities",
        "total_debt", "total_equity",
        "current_ratio", "working_capital",
    ]

    for field in quantitative_fields:
        cv = getattr(cur, field, None)
        pv = getattr(pri, field, None)
        cv_f = _f(cv)
        pv_f = _f(pv)
        d[field] = cv_f
        pct = _pct(cv_f, pv_f) if pv_f != 0 else None
        if pct is not None:
            d[f"{field}_pct_change"] = pct
            d[f"{field}_trend"] = _trend(pct)

    # ── Derived ratios ────────────────────────────────────────────────────────
    if d.get("total_assets", 0) > 0:
        d["debt_to_equity"] = _f(cur.total_debt) / _f(cur.total_equity) if _f(cur.total_equity) > 0 else 999.0
        d["roa"] = _f(cur.net_income) / _f(cur.total_assets) * 100

    if d.get("total_liabilities", 0) > 0 and _f(cur.total_equity) > 0:
        d["debt_to_equity"] = _f(cur.total_liabilities) / _f(cur.total_equity)

    if _f(cur.revenue) > 0:
        d["ar_days"] = (_f(cur.accounts_receivable) / _f(cur.revenue)) * 365
        d["inventory_days"] = (_f(cur.inventory) / _f(cur.revenue)) * 365

    # ── Qualitative flags derived from quantitative data ──────────────────────
    if _f(cur.cash) < 0:
        d["negative_cash_balance"] = True
    if _f(cur.accounts_receivable) < 0:
        d["negative_ar_balance"] = True
    if _f(cur.inventory) < 0:
        d["negative_inventory_balance"] = True
    if _f(cur.total_equity) < 0:
        d["negative_equity"] = True
    if _f(cur.current_ratio) < 1.0 and _f(cur.current_ratio) > 0:
        d["current_ratio_below_one"] = True
    if _f(cur.net_income) < 0:
        d["net_loss"] = True

    # Cash declined while NI positive
    cash_change = _f(cur.cash) - _f(pri.cash)
    if cash_change < 0 and _f(cur.net_income) > 0:
        d["cash_declining_with_positive_ni"] = True

    # Revenue growing while cash declining
    rev_pct = d.get("revenue_pct_change")
    cash_pct = d.get("cash_pct_change")
    if rev_pct is not None and cash_pct is not None and rev_pct > 5 and cash_pct < -5:
        d["revenue_growing_cash_declining"] = True

    # AR growing faster than revenue
    ar_pct = d.get("accounts_receivable_pct_change")
    if ar_pct is not None and rev_pct is not None and ar_pct - (rev_pct or 0) > 10:
        d["ar_outpacing_revenue"] = True

    return d


def _repo_rule_to_detected_issue(
    result,          # RuleResult from rule_engine
    template: dict,
    run_id: str,
    entity_id: int,
    current_period_id: int,
    comparison_period_id: int | None,
) -> DetectedIssue:
    """Convert a triggered repository RuleResult into a DetectedIssue ORM row."""
    risk_map = {
        "critical": "critical",
        "high": "high",
        "moderate": "moderate",
        "low": "low",
        "informational": "informational",
    }
    severity = risk_map.get(result.risk_level, "moderate")

    procs = template.get("suggested_procedures", [])
    if isinstance(procs, list):
        procs = "\n".join(f"• {p}" for p in procs)

    ajes = template.get("suggested_ajes", [])
    if isinstance(ajes, list):
        ajes = "\n".join(f"• {a}" for a in ajes)

    mqs = template.get("management_questions", [])
    if isinstance(mqs, list):
        mqs = "\n".join(f"• {q}" for q in mqs)

    return DetectedIssue(
        run_id=run_id,
        entity_id=entity_id,
        current_period_id=current_period_id,
        comparison_period_id=comparison_period_id,
        issue_code=result.code,
        category=result.category,
        severity=severity,
        title=result.name,
        description=template.get("description", result.explanation or result.name),
        detection_trigger=result.explanation or f"{result.rule_type} rule triggered",
        affected_accounts_json="[]",
        supporting_metrics_json=json.dumps({"magnitude": result.magnitude, "score": result.score}),
        suggested_procedures=procs or None,
        suggested_ajes=ajes or None,
        narrative_prompt=None,
        narrative_output=None,
        ai_explanation=None,
        management_questions=mqs or None,
        status="open",
    )


# ---------------------------------------------------------------------------
# Main detection entry point
# ---------------------------------------------------------------------------

def run_detection(
    db: Session,
    entity_id: int,
    current_period_id: int,
    comparison_period_id: int | None = None,
    scenario_id: int | None = None,
    materiality_threshold: Decimal = Decimal("1000"),
    persist: bool = True,
    _warnings: list[str] | None = None,
) -> list[dict]:
    """
    Run all detection rules against the current period and optional comparison period.

    When comparison_period_id is None, skips comparison-period rules and runs
    single-period account checks + repository rules against current-period metrics.

    Returns list of serialized DetectedIssue dicts (not ORM objects).
    When persist=True, saves DetectedIssue rows to the database.
    Pass a mutable list as _warnings to collect non-fatal detection path failures.
    """
    warnings = _warnings if _warnings is not None else []
    current_period = db.get(AccountingPeriod, current_period_id)
    if current_period is None:
        raise ValueError(f"Period {current_period_id} not found")

    comparison_period = None
    if comparison_period_id is not None:
        comparison_period = db.get(AccountingPeriod, comparison_period_id)
        if comparison_period is None:
            raise ValueError(f"Period {comparison_period_id} not found")

    thresholds = _load_thresholds(db, entity_id)

    cur = _compute_metrics(db, entity_id, current_period, scenario_id)
    pri = _compute_metrics(db, entity_id, comparison_period, scenario_id) if comparison_period else cur

    run_id = str(uuid.uuid4())

    # ── Path 1: 10 hardcoded comparison-period rules (skip when no comparison) ─
    hardcoded_results: list[DetectionResult] = []
    if comparison_period is not None:
        for rule in _ALL_RULES:
            try:
                hardcoded_results.extend(rule(cur, pri, thresholds))
            except Exception as e:
                logger.warning("Path 1 rule %s failed: %s", rule.__name__, e, exc_info=True)
                warnings.append(f"Hardcoded rule '{rule.__name__}' skipped: {type(e).__name__}: {e}")

    triggered_codes = {r.issue_code for r in hardcoded_results}

    issue_rows: list[DetectedIssue] = []
    for r in hardcoded_results:
        row = DetectedIssue(
            run_id=run_id,
            entity_id=entity_id,
            current_period_id=current_period_id,
            comparison_period_id=comparison_period_id,
            issue_code=r.issue_code,
            category=r.category,
            severity=r.severity,
            title=r.title,
            description=r.description,
            detection_trigger=r.detection_trigger,
            affected_accounts_json=json.dumps(r.affected_account_ids),
            supporting_metrics_json=json.dumps(r.supporting_metrics),
            suggested_procedures=r.suggested_procedures,
            suggested_ajes=r.suggested_ajes,
            narrative_prompt=None,
            narrative_output=None,
            ai_explanation=None,
            management_questions=None,
            status="open",
        )
        issue_rows.append(row)

    # ── Path 2: 200-rule repository evaluated against computed metrics dict ──
    try:
        from app.services.rule_engine import evaluate_all_rules
        from app.data.issue_repository_data import ISSUE_REPOSITORY

        metrics_dict = _build_metrics_dict(cur, pri)
        repo_results = evaluate_all_rules(metrics_dict)
        template_by_code = {t["code"]: t for t in ISSUE_REPOSITORY}

        for rr in repo_results:
            if not rr.triggered:
                continue
            if rr.code in triggered_codes:
                continue  # already surfaced by hardcoded rule
            tmpl = template_by_code.get(rr.code, {})
            row = _repo_rule_to_detected_issue(
                rr, tmpl, run_id, entity_id, current_period_id, comparison_period_id
            )
            issue_rows.append(row)
            triggered_codes.add(rr.code)
    except Exception as e:
        logger.warning("Path 2 (repository rules) failed: %s", e, exc_info=True)
        warnings.append(f"Repository rule evaluation skipped: {type(e).__name__}: {e}")

    # ── Path 3: Single-period account-level checks ────────────────────────────
    try:
        sp_findings = run_single_period_detection(db, entity_id, current_period, scenario_id)
        for f in sp_findings:
            if f["issue_code"] in triggered_codes:
                continue
            row = DetectedIssue(
                run_id=run_id,
                entity_id=entity_id,
                current_period_id=current_period_id,
                comparison_period_id=comparison_period_id,
                issue_code=f["issue_code"],
                category=f["category"],
                severity=f["severity"],
                title=f["title"],
                description=f["description"],
                detection_trigger=f["detection_trigger"],
                affected_accounts_json=json.dumps(
                    list(f.get("supporting_metrics", {}).get("account_numbers", "").split(", "))
                    if f.get("supporting_metrics", {}).get("account_numbers") else []
                ),
                supporting_metrics_json=json.dumps(f.get("supporting_metrics", {})),
                suggested_procedures=f.get("suggested_procedures"),
                suggested_ajes=f.get("suggested_ajes"),
                narrative_prompt=None,
                narrative_output=None,
                ai_explanation=None,
                management_questions=None,
                status="open",
            )
            issue_rows.append(row)
            triggered_codes.add(f["issue_code"])
    except Exception as e:
        logger.warning("Path 3 (single-period checks) failed: %s", e, exc_info=True)
        warnings.append(f"Single-period account checks skipped: {type(e).__name__}: {e}")

    # ── Persist ───────────────────────────────────────────────────────────────
    if persist and issue_rows:
        for row in issue_rows:
            db.add(row)
        db.commit()

    if persist:
        rows = (
            db.query(DetectedIssue)
            .filter(DetectedIssue.run_id == run_id)
            .all()
        )
        return [_serialize_issue(r) for r in rows]

    return [_serialize_result(r, run_id, entity_id, current_period_id, comparison_period_id) for r in hardcoded_results]


def _serialize_result(
    r: DetectionResult,
    run_id: str,
    entity_id: int,
    current_period_id: int,
    comparison_period_id: int | None,
) -> dict:
    return {
        "run_id": run_id,
        "entity_id": entity_id,
        "current_period_id": current_period_id,
        "comparison_period_id": comparison_period_id,
        "issue_code": r.issue_code,
        "category": r.category,
        "severity": r.severity,
        "title": r.title,
        "description": r.description,
        "detection_trigger": r.detection_trigger,
        "affected_account_ids": r.affected_account_ids,
        "supporting_metrics": r.supporting_metrics,
        "suggested_procedures": r.suggested_procedures,
        "suggested_ajes": r.suggested_ajes,
        "management_questions": None,
        "status": "open",
    }


def _serialize_issue(row: DetectedIssue) -> dict:
    return {
        "id": row.id,
        "run_id": row.run_id,
        "entity_id": row.entity_id,
        "current_period_id": row.current_period_id,
        "comparison_period_id": row.comparison_period_id,
        "issue_code": row.issue_code,
        "category": row.category,
        "severity": row.severity,
        "title": row.title,
        "description": row.description,
        "detection_trigger": row.detection_trigger,
        "affected_account_ids": json.loads(row.affected_accounts_json or "[]"),
        "supporting_metrics": json.loads(row.supporting_metrics_json or "{}"),
        "suggested_procedures": row.suggested_procedures,
        "suggested_ajes": row.suggested_ajes,
        "management_questions": row.management_questions,
        "status": row.status,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "acknowledged_at": row.acknowledged_at.isoformat() if row.acknowledged_at else None,
        "resolved_at": row.resolved_at.isoformat() if row.resolved_at else None,
    }


def list_detected_issues(
    db: Session,
    entity_id: int,
    current_period_id: int | None = None,
    severity: str | None = None,
    category: str | None = None,
    status: str | None = None,
    latest_only: bool = True,
    run_id: str | None = None,
) -> list[dict]:
    """
    List detected issues for an entity/period.

    By default (latest_only=True) returns only the most recent detection run for
    the given entity/period, preventing rerun accumulation. Pass latest_only=False
    or a specific run_id to access historical runs.
    """
    q = db.query(DetectedIssue).filter(DetectedIssue.entity_id == entity_id)
    if current_period_id:
        q = q.filter(DetectedIssue.current_period_id == current_period_id)

    if run_id:
        q = q.filter(DetectedIssue.run_id == run_id)
    elif latest_only:
        # Subquery: find the most recent run_id for this entity/period combination
        latest_subq = (
            db.query(DetectedIssue.run_id)
            .filter(DetectedIssue.entity_id == entity_id)
        )
        if current_period_id:
            latest_subq = latest_subq.filter(DetectedIssue.current_period_id == current_period_id)
        latest_subq = (
            latest_subq
            .order_by(DetectedIssue.created_at.desc())
            .limit(1)
            .scalar_subquery()
        )
        q = q.filter(DetectedIssue.run_id == latest_subq)

    if severity:
        q = q.filter(DetectedIssue.severity == severity)
    if category:
        q = q.filter(DetectedIssue.category == category)
    if status:
        q = q.filter(DetectedIssue.status == status)

    return [_serialize_issue(r) for r in q.order_by(DetectedIssue.created_at.desc()).all()]


def update_issue_status(
    db: Session,
    issue_id: int,
    new_status: str,
) -> dict:
    row = db.get(DetectedIssue, issue_id)
    if row is None:
        raise ValueError(f"Issue {issue_id} not found")

    row.status = new_status
    if new_status == "acknowledged" and row.acknowledged_at is None:
        row.acknowledged_at = datetime.datetime.now(datetime.timezone.utc)
    if new_status == "resolved" and row.resolved_at is None:
        row.resolved_at = datetime.datetime.now(datetime.timezone.utc)

    db.commit()
    db.refresh(row)
    return _serialize_issue(row)


def list_thresholds(db: Session, entity_id: int) -> list[dict]:
    rows = (
        db.query(IssueDetectionThreshold)
        .filter(
            IssueDetectionThreshold.entity_id == entity_id,
            IssueDetectionThreshold.is_active == True,
        )
        .all()
    )
    return [
        {
            "id": r.id,
            "entity_id": r.entity_id,
            "issue_code": r.issue_code,
            "threshold_type": r.threshold_type,
            "threshold_value": r.threshold_value,
            "is_active": r.is_active,
        }
        for r in rows
    ]


def upsert_threshold(
    db: Session,
    entity_id: int,
    issue_code: str,
    threshold_type: str,
    threshold_value: str,
) -> dict:
    existing = (
        db.query(IssueDetectionThreshold)
        .filter(
            IssueDetectionThreshold.entity_id == entity_id,
            IssueDetectionThreshold.issue_code == issue_code,
        )
        .first()
    )
    if existing:
        existing.threshold_type = threshold_type
        existing.threshold_value = threshold_value
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        return {
            "id": existing.id,
            "entity_id": entity_id,
            "issue_code": issue_code,
            "threshold_type": threshold_type,
            "threshold_value": threshold_value,
        }
    else:
        row = IssueDetectionThreshold(
            entity_id=entity_id,
            issue_code=issue_code,
            threshold_type=threshold_type,
            threshold_value=threshold_value,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return {
            "id": row.id,
            "entity_id": entity_id,
            "issue_code": issue_code,
            "threshold_type": threshold_type,
            "threshold_value": threshold_value,
        }
