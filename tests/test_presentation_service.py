"""Tests for presentation_service (Sprint P3)."""
import pytest
from decimal import Decimal
from app.services import presentation_service as ps


# ---------------------------------------------------------------------------
# Sign behavior
# ---------------------------------------------------------------------------

class TestSignFlip:
    def test_credit_normal_flips(self):
        assert ps.should_sign_flip("credit") is True

    def test_debit_normal_does_not_flip(self):
        assert ps.should_sign_flip("debit") is False

    def test_explicit_negative_behavior_flips_even_for_debit(self):
        assert ps.should_sign_flip("debit", "negative") is True

    def test_apply_flips_credit_normal(self):
        assert ps.apply_sign_for_display(Decimal("-500"), "credit") == Decimal("500")

    def test_apply_does_not_flip_debit_normal(self):
        assert ps.apply_sign_for_display(Decimal("100"), "debit") == Decimal("100")

    def test_apply_absolute_takes_abs(self):
        assert ps.apply_sign_for_display(Decimal("-300"), "debit", "absolute") == Decimal("300")
        assert ps.apply_sign_for_display(Decimal("-300"), "credit", "absolute") == Decimal("300")


# ---------------------------------------------------------------------------
# Scaling
# ---------------------------------------------------------------------------

class TestScaling:
    def test_actual_no_change(self):
        assert ps.apply_scaling(Decimal("1234.56"), "actual") == Decimal("1234.56")

    def test_thousands(self):
        assert ps.apply_scaling(Decimal("12500"), "thousands") == Decimal("12.5")

    def test_millions(self):
        assert ps.apply_scaling(Decimal("2500000"), "millions") == Decimal("2.5")

    def test_unknown_scaling_treated_as_actual(self):
        assert ps.apply_scaling(Decimal("500"), "bogus") == Decimal("500")


# ---------------------------------------------------------------------------
# Formatting
# ---------------------------------------------------------------------------

class TestFormat:
    def test_positive_no_currency(self):
        assert ps.format_amount(Decimal("1234.5"), decimals=0) == "1,234"

    def test_negative_parentheses(self):
        assert ps.format_amount(Decimal("-1234"), negative_format="parentheses") == "(1,234)"

    def test_negative_minus(self):
        assert ps.format_amount(Decimal("-1234"), negative_format="minus") == "-1,234"

    def test_currency_symbol(self):
        assert ps.format_amount(Decimal("500"), currency_symbol="$") == "$500"

    def test_currency_with_parens_negative(self):
        assert ps.format_amount(Decimal("-500"), currency_symbol="$", negative_format="parentheses") == "($500)"

    def test_thousands_scaling_in_format(self):
        assert ps.format_amount(Decimal("12500"), scaling="thousands", decimals=1) == "12.5"

    def test_two_decimal_places(self):
        assert ps.format_amount(Decimal("99.999"), decimals=2) == "100.00"


# ---------------------------------------------------------------------------
# Subtotals / calculations
# ---------------------------------------------------------------------------

class TestSubtotal:
    def test_sum_decimals(self):
        assert ps.compute_subtotal([Decimal("10"), Decimal("20"), Decimal("-5")]) == Decimal("25")

    def test_mixed_types(self):
        assert ps.compute_subtotal([10, 20.5, Decimal("-5")]) == Decimal("25.5")

    def test_empty_list_zero(self):
        assert ps.compute_subtotal([]) == Decimal("0")


class TestCalculation:
    def test_ebitda_formula(self):
        values = {"OPERATING_INCOME": Decimal("100"), "D_AND_A": Decimal("15")}
        assert ps.compute_calculation("{OPERATING_INCOME} + {D_AND_A}", values) == Decimal("115")

    def test_variance_formula(self):
        values = {"current": Decimal("110"), "prior": Decimal("100")}
        assert ps.compute_calculation("{current} - {prior}", values) == Decimal("10")

    def test_subtraction_chain(self):
        values = {"REVENUE": Decimal("1000"), "COGS": Decimal("400"), "OPEX": Decimal("300")}
        assert ps.compute_calculation("{REVENUE} - {COGS} - {OPEX}", values) == Decimal("300")

    def test_parentheses(self):
        values = {"a": Decimal("10"), "b": Decimal("2"), "c": Decimal("3")}
        assert ps.compute_calculation("{a} * ({b} + {c})", values) == Decimal("50")

    def test_unknown_name_raises(self):
        with pytest.raises(ValueError, match="unknown name"):
            ps.compute_calculation("{MISSING} + 1", {})

    def test_unsafe_chars_rejected(self):
        with pytest.raises(ValueError, match="unsafe"):
            ps.compute_calculation("__import__('os').system('rm')", {})

    def test_div_zero_returns_error(self):
        with pytest.raises(ValueError):
            ps.compute_calculation("{a} / 0", {"a": Decimal("1")})


# ---------------------------------------------------------------------------
# Variance
# ---------------------------------------------------------------------------

class TestVariance:
    def test_absolute_variance(self):
        assert ps.compute_variance(Decimal("110"), Decimal("100")) == Decimal("10")

    def test_pct_variance(self):
        assert ps.compute_variance_pct(Decimal("110"), Decimal("100")) == Decimal("0.1")

    def test_pct_variance_zero_prior_returns_none(self):
        assert ps.compute_variance_pct(Decimal("100"), Decimal("0")) is None

    def test_pct_variance_negative_prior_uses_abs(self):
        # current=80, prior=-100 → (80 - -100) / |−100| = 180/100 = 1.8
        assert ps.compute_variance_pct(Decimal("80"), Decimal("-100")) == Decimal("1.8")


# ---------------------------------------------------------------------------
# Delegation: legacy service still works
# ---------------------------------------------------------------------------

def test_legacy_taxonomy_service_delegates_sign_flip():
    """The legacy _sign_flip wrapper in taxonomy_reporting_service must
    still return correct results after the P3 refactor — it just delegates
    to presentation_service now."""
    from app.services.taxonomy_reporting_service import _sign_flip

    class FakeLine:
        def __init__(self, nb, sb=None):
            self.normal_balance = nb
            self.sign_behavior = sb

    assert _sign_flip(FakeLine("credit")) is True
    assert _sign_flip(FakeLine("debit")) is False
    assert _sign_flip(FakeLine("debit", "negative")) is True
