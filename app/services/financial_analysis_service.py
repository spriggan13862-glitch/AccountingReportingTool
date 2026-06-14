"""
Financial ratio analysis service.
Computes standard accounting ratios and advisory flags from trial balance data.
Uses account type and account number ranges consistent with accounting_intelligence_service.py.
"""
import datetime
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Sequence

from sqlalchemy.orm import Session
from app.services.reporting_service import get_trial_balance, TrialBalanceRow


@dataclass
class RatioMetric:
    name: str
    value: float | None
    unit: str
    status: str
    description: str
    interpretation: str
    benchmark_low: float | None
    benchmark_ok: float | None


@dataclass
class AnalysisFlag:
    code: str
    severity: str
    title: str
    detail: str
    suggested_procedures: str


@dataclass
class RatioAnalysisResult:
    as_of_date: str
    entity_id: int
    liquidity: list[RatioMetric]
    leverage: list[RatioMetric]
    profitability: list[RatioMetric]
    flags: list[AnalysisFlag]
    summary: str
    has_data: bool


# ---------------------------------------------------------------------------
# Account range helpers (mirrors accounting_intelligence_service.py)
# ---------------------------------------------------------------------------

def _acct_num_int(num: str) -> int:
    try:
        return int(num.replace("-", "").split(".")[0][:6])
    except (ValueError, IndexError):
        return 0


def _is_cash(r: TrialBalanceRow) -> bool:
    n = _acct_num_int(r.account_number)
    return r.account_type == "asset" and 1000 <= n <= 1099


def _is_ar(r: TrialBalanceRow) -> bool:
    n = _acct_num_int(r.account_number)
    return r.account_type == "asset" and 1100 <= n <= 1199


def _is_current_asset(r: TrialBalanceRow) -> bool:
    n = _acct_num_int(r.account_number)
    return r.account_type == "asset" and 1000 <= n <= 1499


def _is_current_liability(r: TrialBalanceRow) -> bool:
    n = _acct_num_int(r.account_number)
    return r.account_type == "liability" and 2000 <= n <= 2499


def _is_cogs(r: TrialBalanceRow) -> bool:
    return r.account_type == "cogs" or (
        r.account_type == "expense" and "cost of" in r.account_name.lower()
    )


# ---------------------------------------------------------------------------
# Status helper
# ---------------------------------------------------------------------------

def _status(val: float | None, low: float | None, ok: float | None) -> str:
    if val is None:
        return "na"
    if ok is not None and val >= ok:
        return "good"
    if low is not None and val < low:
        return "critical"
    return "warning"


# ---------------------------------------------------------------------------
# Main computation
# ---------------------------------------------------------------------------

def compute_ratio_analysis(
    db: Session,
    entity_id: int,
    as_of_date: datetime.date,
    scenario_ids: Sequence[int],
    source_filter: list[str] | None = None,
) -> RatioAnalysisResult:
    rows = get_trial_balance(
        db, entity_id, as_of_date, list(scenario_ids), source_filter=source_filter
    )

    date_str = as_of_date.isoformat() if isinstance(as_of_date, datetime.date) else str(as_of_date)

    if not rows:
        return RatioAnalysisResult(
            as_of_date=date_str,
            entity_id=entity_id,
            liquidity=[],
            leverage=[],
            profitability=[],
            flags=[],
            summary="No posted data found for this entity and date.",
            has_data=False,
        )

    # Accumulate balances — sign convention:
    # debit-normal (asset, expense): use net_debit directly
    # credit-normal (liability, equity, revenue): use -net_debit
    cash = Decimal(0)
    current_assets = Decimal(0)
    total_assets = Decimal(0)
    current_liabilities = Decimal(0)
    total_liabilities = Decimal(0)
    total_equity = Decimal(0)
    revenue = Decimal(0)
    cogs = Decimal(0)
    total_expenses = Decimal(0)

    for r in rows:
        if r.account_type == "asset":
            bal = r.net_debit
            total_assets += bal
            if _is_cash(r):
                cash += bal
            if _is_current_asset(r):
                current_assets += bal
        elif r.account_type == "liability":
            bal = -r.net_debit
            total_liabilities += bal
            if _is_current_liability(r):
                current_liabilities += bal
        elif r.account_type == "equity":
            total_equity += -r.net_debit
        elif r.account_type == "revenue":
            revenue += -r.net_debit
        elif r.account_type == "expense":
            if _is_cogs(r):
                cogs += r.net_debit
            else:
                total_expenses += r.net_debit
        elif r.account_type == "cogs":
            cogs += r.net_debit

    gross_profit = revenue - cogs
    net_income = gross_profit - total_expenses

    # -----------------------------------------------------------------------
    # Liquidity ratios
    # -----------------------------------------------------------------------
    liquidity: list[RatioMetric] = []

    if current_liabilities > 0:
        cr_val = float(current_assets / current_liabilities)
        liquidity.append(RatioMetric(
            name="Current Ratio",
            value=cr_val,
            unit="x",
            status=_status(cr_val, 1.0, 2.0),
            description="Current assets divided by current liabilities.",
            interpretation="≥2.0x healthy · 1.0–2.0x monitor · <1.0x liquidity risk",
            benchmark_low=1.0,
            benchmark_ok=2.0,
        ))
        cash_ratio_val = float(cash / current_liabilities)
        liquidity.append(RatioMetric(
            name="Cash Ratio",
            value=cash_ratio_val,
            unit="x",
            status=_status(cash_ratio_val, 0.2, 0.5),
            description="Cash and equivalents divided by current liabilities.",
            interpretation="≥0.5x strong · 0.2–0.5x adequate · <0.2x tight",
            benchmark_low=0.2,
            benchmark_ok=0.5,
        ))
    else:
        liquidity.append(RatioMetric(
            name="Current Ratio",
            value=None,
            unit="x",
            status="na",
            description="Current assets divided by current liabilities.",
            interpretation="No current liabilities on record.",
            benchmark_low=1.0,
            benchmark_ok=2.0,
        ))
        liquidity.append(RatioMetric(
            name="Cash Ratio",
            value=None,
            unit="x",
            status="na",
            description="Cash and equivalents divided by current liabilities.",
            interpretation="No current liabilities on record.",
            benchmark_low=0.2,
            benchmark_ok=0.5,
        ))

    wc_val = float(current_assets - current_liabilities)
    liquidity.append(RatioMetric(
        name="Working Capital",
        value=wc_val,
        unit="$",
        status="good" if wc_val > 0 else "critical",
        description="Current assets minus current liabilities.",
        interpretation="Positive = short-term buffer · Negative = near-term funding gap",
        benchmark_low=None,
        benchmark_ok=None,
    ))

    # -----------------------------------------------------------------------
    # Leverage ratios
    # -----------------------------------------------------------------------
    leverage: list[RatioMetric] = []

    if total_equity > 0:
        de_val = float(total_liabilities / total_equity)
        if de_val < 2:
            de_status = "good"
        elif de_val <= 4:
            de_status = "warning"
        else:
            de_status = "critical"
        leverage.append(RatioMetric(
            name="Debt-to-Equity",
            value=de_val,
            unit="x",
            status=de_status,
            description="Total liabilities divided by total equity.",
            interpretation="<2.0x low leverage · 2–4x moderate · >4x high leverage",
            benchmark_low=None,
            benchmark_ok=None,
        ))
    else:
        leverage.append(RatioMetric(
            name="Debt-to-Equity",
            value=None,
            unit="x",
            status="na",
            description="Total liabilities divided by total equity.",
            interpretation="Cannot compute — equity is zero or negative.",
            benchmark_low=None,
            benchmark_ok=None,
        ))

    if total_assets > 0:
        tdr_val = float(total_liabilities / total_assets * 100)
        leverage.append(RatioMetric(
            name="Total Debt Ratio",
            value=tdr_val,
            unit="%",
            status=_status(tdr_val, None, 50.0),
            description="Total liabilities as a percentage of total assets.",
            interpretation="<50% conservative · ≥50% asset-financed by debt",
            benchmark_low=None,
            benchmark_ok=50.0,
        ))
    else:
        leverage.append(RatioMetric(
            name="Total Debt Ratio",
            value=None,
            unit="%",
            status="na",
            description="Total liabilities as a percentage of total assets.",
            interpretation="No asset balances on record.",
            benchmark_low=None,
            benchmark_ok=50.0,
        ))

    # -----------------------------------------------------------------------
    # Profitability ratios
    # -----------------------------------------------------------------------
    profitability: list[RatioMetric] = []

    if revenue > 0:
        gm_val = float(gross_profit / revenue * 100)
        profitability.append(RatioMetric(
            name="Gross Margin",
            value=gm_val,
            unit="%",
            status=_status(gm_val, 20.0, 40.0),
            description="Gross profit as a percentage of revenue.",
            interpretation="≥40% strong · 20–40% typical · <20% thin",
            benchmark_low=20.0,
            benchmark_ok=40.0,
        ))

        nm_val = float(net_income / revenue * 100)
        profitability.append(RatioMetric(
            name="Net Margin",
            value=nm_val,
            unit="%",
            status=_status(nm_val, 5.0, 15.0),
            description="Net income as a percentage of revenue.",
            interpretation="≥15% excellent · 5–15% acceptable · <5% thin",
            benchmark_low=5.0,
            benchmark_ok=15.0,
        ))

    if total_assets > 0:
        roa_val = float(net_income / total_assets * 100)
        profitability.append(RatioMetric(
            name="Return on Assets",
            value=roa_val,
            unit="%",
            status=_status(roa_val, 2.0, 8.0),
            description="Net income as a percentage of total assets.",
            interpretation="≥8% efficient · 2–8% acceptable · <2% underperforming",
            benchmark_low=2.0,
            benchmark_ok=8.0,
        ))

    if total_equity > 0:
        roe_val = float(net_income / total_equity * 100)
        profitability.append(RatioMetric(
            name="Return on Equity",
            value=roe_val,
            unit="%",
            status=_status(roe_val, 8.0, 15.0),
            description="Net income as a percentage of total equity.",
            interpretation="≥15% strong · 8–15% adequate · <8% weak",
            benchmark_low=8.0,
            benchmark_ok=15.0,
        ))

    # -----------------------------------------------------------------------
    # Advisory flags
    # -----------------------------------------------------------------------
    flags: list[AnalysisFlag] = []

    if total_equity < 0:
        flags.append(AnalysisFlag(
            code="NEGATIVE_EQUITY",
            severity="critical",
            title="Negative Equity",
            detail=f"Total equity is ${float(total_equity):,.0f}. Liabilities exceed assets.",
            suggested_procedures=(
                "Review equity accounts for recording errors. Assess going concern implications."
            ),
        ))

    if current_liabilities > 0 and current_assets < current_liabilities:
        flags.append(AnalysisFlag(
            code="LIQUIDITY_CRISIS",
            severity="critical",
            title="Liquidity Crisis — Current Ratio Below 1.0",
            detail=(
                f"Current assets (${float(current_assets):,.0f}) are less than "
                f"current liabilities (${float(current_liabilities):,.0f})."
            ),
            suggested_procedures=(
                "Evaluate near-term cash needs. Review upcoming maturities and credit facilities."
            ),
        ))

    bs_diff = abs(float(total_assets - total_liabilities - total_equity))
    if bs_diff > 1.0:
        flags.append(AnalysisFlag(
            code="BS_IMBALANCE",
            severity="critical",
            title="Balance Sheet Does Not Balance",
            detail=f"Assets − (Liabilities + Equity) = ${bs_diff:,.2f}. Possible missing accounts or posting errors.",
            suggested_procedures=(
                "Reconcile trial balance totals. Check for unposted journal entries or unmapped accounts."
            ),
        ))

    if revenue > 0 and float(gross_profit / revenue * 100) < 5.0:
        flags.append(AnalysisFlag(
            code="NEAR_ZERO_GROSS_MARGIN",
            severity="warning",
            title="Near-Zero Gross Margin",
            detail=(
                f"Gross margin is {float(gross_profit / revenue * 100):.1f}%. "
                "COGS is nearly equal to revenue."
            ),
            suggested_procedures=(
                "Verify COGS account classification. Review pricing and cost structure."
            ),
        ))

    if net_income < 0:
        flags.append(AnalysisFlag(
            code="NET_LOSS",
            severity="warning",
            title="Net Loss",
            detail=f"Net loss of ${abs(float(net_income)):,.0f} recorded for this period.",
            suggested_procedures=(
                "Review expense accounts for unusual items. Compare to prior period."
            ),
        ))

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------
    critical_count = sum(1 for f in flags if f.severity == "critical")
    warning_count = sum(1 for f in flags if f.severity == "warning")

    if critical_count > 0:
        summary = f"{critical_count} critical issue(s) flagged — immediate review recommended."
    elif warning_count > 0:
        summary = f"{warning_count} item(s) to monitor. Overall position is functional."
    else:
        summary = "Financial position appears stable based on available data."

    return RatioAnalysisResult(
        as_of_date=date_str,
        entity_id=entity_id,
        liquidity=liquidity,
        leverage=leverage,
        profitability=profitability,
        flags=flags,
        summary=summary,
        has_data=True,
    )
