"""Materiality computation — AICPA blended benchmark approach."""
from __future__ import annotations
from dataclasses import dataclass


@dataclass
class MaterialityProfile:
    overall: float
    performance: float      # 75% of overall
    trivial: float          # 3% of overall
    basis_used: str         # comma-separated: "revenue,assets,equity"
    rationale: str
    # Per-basis candidates
    revenue_basis: float
    asset_basis: float
    equity_basis: float
    ebitda_basis: float
    ni_basis: float | None
    # Severity thresholds (for classifying issue amounts)
    critical_threshold: float    # >= overall
    high_threshold: float        # >= 50% of overall
    moderate_threshold: float    # >= performance (75% of overall * 0.75 = 56%)
    low_threshold: float         # >= trivial


class MaterialityEngine:
    """
    Computes blended materiality based on multiple financial benchmarks.

    Bases and percentages (per AICPA SAS guidance):
      Revenue:    0.5% (for high-revenue companies)
      Assets:     0.5% of total assets
      Equity:     3% of equity (when positive)
      EBITDA:     7% of EBITDA (when positive)
      Net Income: 5% of net income (when positive)

    Overall = weighted average of all applicable candidates.
    Performance materiality = 75% of overall.
    Trivial = 3% of overall.
    """

    REVENUE_PCT = 0.005
    ASSET_PCT = 0.005
    EQUITY_PCT = 0.03
    EBITDA_PCT = 0.07
    NI_PCT = 0.05
    FLOOR = 10_000.0  # minimum materiality

    @classmethod
    def compute(
        cls,
        revenue: float = 0.0,
        total_assets: float = 0.0,
        equity: float = 0.0,
        ebitda: float = 0.0,
        net_income: float | None = None,
    ) -> MaterialityProfile:
        candidates: dict[str, float] = {}

        if abs(revenue) > 0:
            candidates["revenue"] = abs(revenue) * cls.REVENUE_PCT
        if abs(total_assets) > 0:
            candidates["assets"] = abs(total_assets) * cls.ASSET_PCT
        if equity > 0:
            candidates["equity"] = equity * cls.EQUITY_PCT
        if ebitda > 0:
            candidates["ebitda"] = ebitda * cls.EBITDA_PCT
        if net_income is not None and net_income > 0:
            candidates["net_income"] = net_income * cls.NI_PCT

        if not candidates:
            overall = cls.FLOOR
            basis_used = "floor"
            rationale = f"No positive financial base available; floor materiality of ${cls.FLOOR:,.0f} applied."
        else:
            overall = sum(candidates.values()) / len(candidates)
            overall = max(overall, cls.FLOOR)
            basis_used = ",".join(candidates.keys())
            rationale = "; ".join(
                f"{k} basis = ${v:,.0f}" for k, v in candidates.items()
            ) + f" → blended overall = ${overall:,.0f}"

        performance = overall * 0.75
        trivial = overall * 0.03

        return MaterialityProfile(
            overall=overall,
            performance=performance,
            trivial=trivial,
            basis_used=basis_used,
            rationale=rationale,
            revenue_basis=abs(revenue) * cls.REVENUE_PCT if revenue else 0.0,
            asset_basis=abs(total_assets) * cls.ASSET_PCT if total_assets else 0.0,
            equity_basis=equity * cls.EQUITY_PCT if equity > 0 else 0.0,
            ebitda_basis=ebitda * cls.EBITDA_PCT if ebitda > 0 else 0.0,
            ni_basis=net_income * cls.NI_PCT if net_income and net_income > 0 else None,
            critical_threshold=overall,
            high_threshold=overall * 0.50,
            moderate_threshold=performance,
            low_threshold=trivial,
        )

    @staticmethod
    def classify_amount(amount: float, profile: MaterialityProfile) -> str:
        """Classify an absolute dollar amount against materiality thresholds."""
        abs_amt = abs(amount)
        if abs_amt >= profile.critical_threshold:
            return "critical"
        if abs_amt >= profile.high_threshold:
            return "high"
        if abs_amt >= profile.moderate_threshold:
            return "moderate"
        if abs_amt >= profile.low_threshold:
            return "low"
        return "trivial"
