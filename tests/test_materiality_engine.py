"""Tests for MaterialityEngine."""
import pytest
from app.services.materiality_engine import MaterialityEngine, MaterialityProfile


class TestMaterialityEngineCompute:
    def test_all_bases_blended(self):
        profile = MaterialityEngine.compute(
            revenue=10_000_000,
            total_assets=5_000_000,
            equity=3_000_000,
            ebitda=1_500_000,
            net_income=500_000,
        )
        assert profile.overall > 0
        assert "revenue" in profile.basis_used
        assert "assets" in profile.basis_used
        assert "equity" in profile.basis_used
        assert "ebitda" in profile.basis_used
        assert "net_income" in profile.basis_used

    def test_performance_is_75_pct_of_overall(self):
        profile = MaterialityEngine.compute(revenue=10_000_000, total_assets=5_000_000)
        assert abs(profile.performance - profile.overall * 0.75) < 0.01

    def test_trivial_is_3_pct_of_overall(self):
        profile = MaterialityEngine.compute(revenue=10_000_000, total_assets=5_000_000)
        assert abs(profile.trivial - profile.overall * 0.03) < 0.01

    def test_floor_applied_when_no_bases(self):
        profile = MaterialityEngine.compute()
        assert profile.overall == MaterialityEngine.FLOOR
        assert profile.basis_used == "floor"

    def test_floor_applied_when_bases_below_floor(self):
        profile = MaterialityEngine.compute(revenue=100, total_assets=100)
        assert profile.overall == MaterialityEngine.FLOOR

    def test_negative_equity_excluded(self):
        profile = MaterialityEngine.compute(revenue=10_000_000, equity=-500_000)
        assert "equity" not in profile.basis_used

    def test_negative_ebitda_excluded(self):
        profile = MaterialityEngine.compute(revenue=10_000_000, ebitda=-200_000)
        assert "ebitda" not in profile.basis_used

    def test_zero_net_income_excluded(self):
        profile = MaterialityEngine.compute(revenue=10_000_000, net_income=0)
        assert "net_income" not in profile.basis_used

    def test_revenue_basis_calculation(self):
        profile = MaterialityEngine.compute(revenue=10_000_000)
        expected = 10_000_000 * MaterialityEngine.REVENUE_PCT
        assert abs(profile.revenue_basis - expected) < 0.01

    def test_thresholds_all_positive(self):
        profile = MaterialityEngine.compute(revenue=10_000_000, total_assets=5_000_000)
        assert profile.critical_threshold > 0
        assert profile.high_threshold > 0
        assert profile.moderate_threshold > 0
        assert profile.low_threshold > 0
        assert profile.critical_threshold > profile.low_threshold


class TestMaterialityClassify:
    def setup_method(self):
        self.profile = MaterialityEngine.compute(
            revenue=10_000_000,
            total_assets=5_000_000,
            equity=3_000_000,
        )

    def test_amount_at_overall_is_critical(self):
        assert MaterialityEngine.classify_amount(self.profile.overall, self.profile) == "critical"

    def test_amount_above_overall_is_critical(self):
        assert MaterialityEngine.classify_amount(self.profile.overall * 2, self.profile) == "critical"

    def test_amount_at_high_threshold(self):
        result = MaterialityEngine.classify_amount(self.profile.high_threshold, self.profile)
        assert result == "high"

    def test_amount_at_trivial_is_low(self):
        result = MaterialityEngine.classify_amount(self.profile.low_threshold, self.profile)
        assert result == "low"

    def test_tiny_amount_is_trivial(self):
        assert MaterialityEngine.classify_amount(1.0, self.profile) == "trivial"

    def test_negative_amount_uses_abs_value(self):
        positive_result = MaterialityEngine.classify_amount(self.profile.overall, self.profile)
        negative_result = MaterialityEngine.classify_amount(-self.profile.overall, self.profile)
        assert positive_result == negative_result
