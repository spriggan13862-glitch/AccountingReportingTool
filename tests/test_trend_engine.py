"""Tests for TrendEngine."""
import pytest
from dataclasses import dataclass
from app.services.trend_engine import TrendEngine, TrendReport, TrendResult


@dataclass
class FakePeriodMetrics:
    revenue: float = 0.0
    gross_profit: float = 0.0
    gross_margin_pct: float = 0.0
    total_expenses: float = 0.0
    net_income: float = 0.0
    cash: float = 0.0
    accounts_receivable: float = 0.0
    inventory: float = 0.0
    total_assets: float = 0.0
    total_liabilities: float = 0.0
    total_equity: float = 0.0
    total_debt: float = 0.0
    current_ratio: float = 0.0
    working_capital: float = 0.0


class TestTrendEngineInsufficientData:
    def test_single_period_returns_no_sufficient_data(self):
        pm = FakePeriodMetrics(revenue=1_000_000)
        report = TrendEngine.compute([pm], [1], ["Q1 2024"], entity_id=1)
        assert not report.has_sufficient_data
        assert report.periods_analyzed == 1
        assert len(report.trends) == 0

    def test_empty_periods_returns_no_sufficient_data(self):
        report = TrendEngine.compute([], [], [], entity_id=1)
        assert not report.has_sufficient_data

    def test_no_sufficient_data_includes_advisory(self):
        pm = FakePeriodMetrics(revenue=1_000_000)
        report = TrendEngine.compute([pm], [1], ["Q1 2024"], entity_id=1)
        assert any("Insufficient" in c for c in report.key_concerns)


class TestTrendEngineCompute:
    def _two_period_report(self, **kwargs_p1):
        pm1 = FakePeriodMetrics(**kwargs_p1)
        pm2 = FakePeriodMetrics(**kwargs_p1)
        return TrendEngine.compute([pm1, pm2], [1, 2], ["2023", "2024"], entity_id=1)

    def test_two_periods_is_sufficient(self):
        pm1 = FakePeriodMetrics(revenue=1_000_000)
        pm2 = FakePeriodMetrics(revenue=1_100_000)
        report = TrendEngine.compute([pm1, pm2], [1, 2], ["2023", "2024"], entity_id=1)
        assert report.has_sufficient_data
        assert report.periods_analyzed == 2

    def test_revenue_trend_captured(self):
        pm1 = FakePeriodMetrics(revenue=1_000_000)
        pm2 = FakePeriodMetrics(revenue=1_100_000)
        report = TrendEngine.compute([pm1, pm2], [1, 2], ["2023", "2024"], entity_id=1)
        revenue_trend = next((t for t in report.trends if t.metric == "revenue"), None)
        assert revenue_trend is not None
        assert len(revenue_trend.points) == 2

    def test_increasing_direction_detected(self):
        pm1 = FakePeriodMetrics(revenue=1_000_000)
        pm2 = FakePeriodMetrics(revenue=1_200_000)
        pm3 = FakePeriodMetrics(revenue=1_400_000)
        report = TrendEngine.compute([pm1, pm2, pm3], [1, 2, 3], ["2022", "2023", "2024"], entity_id=1)
        t = next(t for t in report.trends if t.metric == "revenue")
        assert t.direction == "increasing"

    def test_decreasing_direction_detected(self):
        pm1 = FakePeriodMetrics(revenue=1_400_000)
        pm2 = FakePeriodMetrics(revenue=1_200_000)
        pm3 = FakePeriodMetrics(revenue=1_000_000)
        report = TrendEngine.compute([pm1, pm2, pm3], [1, 2, 3], ["2022", "2023", "2024"], entity_id=1)
        t = next(t for t in report.trends if t.metric == "revenue")
        assert t.direction == "decreasing"

    def test_revenue_decline_triggers_concern(self):
        pm1 = FakePeriodMetrics(revenue=1_000_000)
        pm2 = FakePeriodMetrics(revenue=850_000)  # -15% decline
        report = TrendEngine.compute([pm1, pm2], [1, 2], ["2023", "2024"], entity_id=1)
        t = next((t for t in report.trends if t.metric == "revenue"), None)
        assert t is not None and t.is_concerning

    def test_small_revenue_change_not_concerning(self):
        pm1 = FakePeriodMetrics(revenue=1_000_000)
        pm2 = FakePeriodMetrics(revenue=980_000)  # -2% decline, within threshold
        report = TrendEngine.compute([pm1, pm2], [1, 2], ["2023", "2024"], entity_id=1)
        t = next((t for t in report.trends if t.metric == "revenue"), None)
        if t:
            assert not t.is_concerning

    def test_high_ar_growth_triggers_concern(self):
        pm1 = FakePeriodMetrics(accounts_receivable=500_000)
        pm2 = FakePeriodMetrics(accounts_receivable=700_000)  # +40% growth
        report = TrendEngine.compute([pm1, pm2], [1, 2], ["2023", "2024"], entity_id=1)
        t = next((t for t in report.trends if t.metric == "accounts_receivable"), None)
        assert t is not None and t.is_concerning

    def test_key_concerns_capped_at_10(self):
        pm1 = FakePeriodMetrics(
            revenue=1_000_000, cash=200_000, accounts_receivable=300_000,
            inventory=100_000, total_debt=500_000, net_income=100_000,
            gross_margin_pct=40.0, current_ratio=2.0, working_capital=400_000,
            total_expenses=900_000,
        )
        pm2 = FakePeriodMetrics(
            revenue=850_000, cash=100_000, accounts_receivable=500_000,
            inventory=200_000, total_debt=700_000, net_income=50_000,
            gross_margin_pct=30.0, current_ratio=1.4, working_capital=200_000,
            total_expenses=1_200_000,
        )
        report = TrendEngine.compute([pm1, pm2], [1, 2], ["2023", "2024"], entity_id=1)
        assert len(report.key_concerns) <= 10

    def test_entity_id_preserved(self):
        pm1 = FakePeriodMetrics(revenue=1_000_000)
        pm2 = FakePeriodMetrics(revenue=1_100_000)
        report = TrendEngine.compute([pm1, pm2], [1, 2], ["2023", "2024"], entity_id=42)
        assert report.entity_id == 42

    def test_yoy_pct_change_computed(self):
        pm1 = FakePeriodMetrics(revenue=1_000_000)
        pm2 = FakePeriodMetrics(revenue=1_100_000)
        report = TrendEngine.compute([pm1, pm2], [1, 2], ["2023", "2024"], entity_id=1)
        t = next(t for t in report.trends if t.metric == "revenue")
        assert t.pct_change_yoy is not None
        assert abs(t.pct_change_yoy - 10.0) < 0.01
