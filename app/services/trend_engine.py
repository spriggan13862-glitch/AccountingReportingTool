"""Multi-period trend analysis for the Accounting Intelligence Engine."""
from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class TrendPoint:
    period_id: int
    period_name: str
    value: float


@dataclass
class TrendResult:
    metric: str
    label: str
    unit: str           # "amount" | "percent" | "ratio"
    points: list[TrendPoint]
    direction: str      # "increasing" | "decreasing" | "stable" | "volatile"
    pct_change_yoy: float | None
    pct_change_recent: float | None
    is_concerning: bool
    concern_reason: str | None


@dataclass
class TrendReport:
    entity_id: int
    periods_analyzed: int
    period_names: list[str]
    trends: list[TrendResult]
    key_concerns: list[str]
    has_sufficient_data: bool


# PeriodMetrics field names must match accounting_intelligence_service.PeriodMetrics exactly.
_METRICS_CONFIG = [
    # (field, label, unit)
    ("revenue", "Revenue", "amount"),
    ("gross_profit", "Gross Profit", "amount"),
    ("gross_margin_pct", "Gross Margin %", "percent"),
    ("total_expenses", "Total Expenses", "amount"),
    ("net_income", "Net Income", "amount"),
    ("cash", "Cash", "amount"),
    ("accounts_receivable", "Accounts Receivable", "amount"),
    ("inventory", "Inventory", "amount"),
    ("total_assets", "Total Assets", "amount"),
    ("total_liabilities", "Total Liabilities", "amount"),
    ("total_equity", "Total Equity", "amount"),
    ("total_debt", "Total Debt", "amount"),
    ("current_ratio", "Current Ratio", "ratio"),
    ("working_capital", "Working Capital", "amount"),
]

_CONCERN_RULES = [
    # (metric_field, direction, threshold_pct, concern_message)
    ("gross_margin_pct", "decreasing", -3.0, "Gross margin compression — review pricing pressure and COGS"),
    ("revenue", "decreasing", -10.0, "Revenue decline — review customer attrition and pipeline"),
    ("cash", "decreasing", -20.0, "Cash deterioration — review operating and investing activities"),
    ("current_ratio", "decreasing", -15.0, "Liquidity deterioration — review working capital management"),
    ("working_capital", "decreasing", -20.0, "Working capital erosion — review current liabilities and receivables"),
    ("total_debt", "increasing", 20.0, "Debt growth — review covenant compliance and capacity"),
    ("accounts_receivable", "increasing", 30.0, "AR growth elevated — review collections and allowance adequacy"),
    ("inventory", "increasing", 30.0, "Inventory buildup — review obsolescence and demand signals"),
    ("net_income", "decreasing", -15.0, "Profitability decline — review cost structure and one-time items"),
    ("total_expenses", "increasing", 20.0, "Expense growth — review operating leverage"),
]


def _pct_change(old: float, new: float) -> float | None:
    if old == 0:
        return None
    return ((new - old) / abs(old)) * 100.0


def _direction(values: list[float]) -> str:
    if len(values) < 2:
        return "stable"
    diffs = [values[i + 1] - values[i] for i in range(len(values) - 1)]
    ups = sum(1 for d in diffs if d > 0)
    downs = sum(1 for d in diffs if d < 0)
    if ups == len(diffs):
        return "increasing"
    if downs == len(diffs):
        return "decreasing"
    total = values[-1] - values[0]
    if abs(total) < 0.01 * max(abs(v) for v in values if v != 0.0) if any(v != 0 for v in values) else 1:
        return "stable"
    return "volatile"


class TrendEngine:
    @staticmethod
    def compute(
        period_metrics_list: list,  # list[PeriodMetrics] from accounting_intelligence_service
        period_ids: list[int],
        period_names: list[str],
        entity_id: int = 0,
    ) -> TrendReport:
        n = len(period_metrics_list)
        if n < 2:
            return TrendReport(
                entity_id=entity_id,
                periods_analyzed=n,
                period_names=period_names,
                trends=[],
                key_concerns=["Insufficient periods for trend analysis — need at least 2 periods."],
                has_sufficient_data=False,
            )

        trends: list[TrendResult] = []
        key_concerns: list[str] = []

        for field_name, label, unit in _METRICS_CONFIG:
            points: list[TrendPoint] = []
            for pm, pid, pname in zip(period_metrics_list, period_ids, period_names):
                val = getattr(pm, field_name, None)
                if val is not None:
                    points.append(TrendPoint(period_id=pid, period_name=pname, value=float(val)))

            if len(points) < 2:
                continue

            vals = [p.value for p in points]
            yoy = _pct_change(vals[0], vals[-1])
            recent = _pct_change(vals[-2], vals[-1])
            direction = _direction(vals)

            is_concerning = False
            concern_reason: str | None = None

            for metric_key, concern_dir, threshold, message in _CONCERN_RULES:
                if metric_key != field_name:
                    continue
                check_val = recent if recent is not None else yoy
                if check_val is None:
                    continue
                if concern_dir == "decreasing" and check_val < threshold:
                    is_concerning = True
                    concern_reason = message
                    key_concerns.append(f"{label}: {message}")
                    break
                if concern_dir == "increasing" and check_val > threshold:
                    is_concerning = True
                    concern_reason = message
                    key_concerns.append(f"{label}: {message}")
                    break

            trends.append(TrendResult(
                metric=field_name,
                label=label,
                unit=unit,
                points=points,
                direction=direction,
                pct_change_yoy=yoy,
                pct_change_recent=recent,
                is_concerning=is_concerning,
                concern_reason=concern_reason,
            ))

        return TrendReport(
            entity_id=entity_id,
            periods_analyzed=n,
            period_names=period_names,
            trends=trends,
            key_concerns=key_concerns[:10],
            has_sufficient_data=True,
        )
