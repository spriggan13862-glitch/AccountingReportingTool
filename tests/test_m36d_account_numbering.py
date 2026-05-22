"""M36d — Account Number Generator tests."""
import pytest

from app.services.account_number_generator import (
    generate_account_numbers,
    get_account_series,
    get_range_for_taxonomy,
    TAXONOMY_RANGES,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def make_line(code: str, taxonomy: str, section: str = "current_assets", is_subtotal: bool = False):
    return {
        "temp_account_code": code,
        "suggested_taxonomy_code": taxonomy,
        "section": section,
        "is_subtotal": is_subtotal,
        "account_name": f"Test {code}",
    }


# ---------------------------------------------------------------------------
# Tests: generate_account_numbers
# ---------------------------------------------------------------------------

class TestGenerateAccountNumbers:
    def test_empty_lines_returns_empty_dict(self):
        assert generate_account_numbers([]) == {}

    def test_subtotals_get_empty_string(self):
        lines = [make_line("SUB-001", "cash_equivalents", is_subtotal=True)]
        result = generate_account_numbers(lines)
        assert result["SUB-001"] == ""

    def test_cash_equivalents_in_1000_series(self):
        lines = [make_line("HERO-BS-CASH-A1", "cash_equivalents")]
        result = generate_account_numbers(lines)
        num = int(result["HERO-BS-CASH-A1"])
        assert 1010 <= num <= 1099

    def test_revenue_in_4000_series(self):
        lines = [make_line("HERO-IS-REV-A1", "revenue", "revenue")]
        result = generate_account_numbers(lines)
        num = int(result["HERO-IS-REV-A1"])
        assert 4010 <= num <= 4399

    def test_cogs_in_5000_series(self):
        lines = [make_line("HERO-IS-COGS-A1", "cogs", "cogs")]
        result = generate_account_numbers(lines)
        num = int(result["HERO-IS-COGS-A1"])
        assert 5010 <= num <= 5499

    def test_operating_expenses_in_6000_series(self):
        lines = [make_line("HERO-IS-OE-A1", "operating_expenses", "operating_expenses")]
        result = generate_account_numbers(lines)
        num = int(result["HERO-IS-OE-A1"])
        assert 6010 <= num <= 6999

    def test_long_term_debt_in_2600_range(self):
        lines = [make_line("HERO-BS-LTD-A1", "long_term_debt", "long_term_liabilities")]
        result = generate_account_numbers(lines)
        num = int(result["HERO-BS-LTD-A1"])
        assert 2610 <= num <= 2699

    def test_retained_earnings_in_3000_series(self):
        lines = [make_line("HERO-BS-RE-A1", "retained_earnings", "equity")]
        result = generate_account_numbers(lines)
        num = int(result["HERO-BS-RE-A1"])
        assert 3110 <= num <= 3299

    def test_sequential_increments_by_10(self):
        lines = [
            make_line("LINE-1", "cash_equivalents"),
            make_line("LINE-2", "cash_equivalents"),
            make_line("LINE-3", "cash_equivalents"),
        ]
        result = generate_account_numbers(lines)
        nums = [int(result[f"LINE-{i}"]) for i in range(1, 4)]
        # Each increments by 10
        assert nums[1] - nums[0] == 10
        assert nums[2] - nums[1] == 10

    def test_different_taxonomy_groups_get_different_series(self):
        lines = [
            make_line("CASH-1", "cash_equivalents"),
            make_line("REV-1", "revenue", "revenue"),
            make_line("COGS-1", "cogs", "cogs"),
        ]
        result = generate_account_numbers(lines)
        cash_num = int(result["CASH-1"])
        rev_num = int(result["REV-1"])
        cogs_num = int(result["COGS-1"])
        assert cash_num < 2000
        assert 4000 <= rev_num < 5000
        assert 5000 <= cogs_num < 6000

    def test_all_lines_get_numbers(self):
        lines = [make_line(f"LINE-{i}", "operating_expenses", "operating_expenses") for i in range(5)]
        result = generate_account_numbers(lines)
        assert len(result) == 5
        for v in result.values():
            assert v  # Non-empty

    def test_unknown_taxonomy_falls_back_to_9000_series(self):
        lines = [make_line("MYSTERY-1", "totally_unknown_taxonomy")]
        result = generate_account_numbers(lines)
        num = int(result["MYSTERY-1"])
        assert 9000 <= num <= 9999

    def test_section_fallback_when_taxonomy_missing(self):
        line = {
            "temp_account_code": "LINE-NO-TAX",
            "suggested_taxonomy_code": None,
            "section": "current_assets",
            "is_subtotal": False,
            "account_name": "Test",
        }
        result = generate_account_numbers([line])
        num = int(result["LINE-NO-TAX"])
        # current_assets falls back to other_current_assets → 1400 range
        assert 1000 <= num <= 1999

    def test_mixed_subtotal_and_detail_lines(self):
        lines = [
            make_line("DETAIL-1", "cash_equivalents"),
            make_line("SUB-1", "cash_equivalents", is_subtotal=True),
            make_line("DETAIL-2", "cash_equivalents"),
        ]
        result = generate_account_numbers(lines)
        assert result["DETAIL-1"] != ""
        assert result["SUB-1"] == ""
        assert result["DETAIL-2"] != ""
        assert int(result["DETAIL-2"]) > int(result["DETAIL-1"])


# ---------------------------------------------------------------------------
# Tests: TAXONOMY_RANGES coverage
# ---------------------------------------------------------------------------

class TestTaxonomyRanges:
    def test_all_ranges_are_within_correct_series(self):
        series_map = {
            1: [k for k, (s, _) in TAXONOMY_RANGES.items() if 1000 <= s < 2000],
            2: [k for k, (s, _) in TAXONOMY_RANGES.items() if 2000 <= s < 3000],
            3: [k for k, (s, _) in TAXONOMY_RANGES.items() if 3000 <= s < 4000],
            4: [k for k, (s, _) in TAXONOMY_RANGES.items() if 4000 <= s < 5000],
            5: [k for k, (s, _) in TAXONOMY_RANGES.items() if 5000 <= s < 6000],
            6: [k for k, (s, _) in TAXONOMY_RANGES.items() if 6000 <= s < 7000],
            7: [k for k, (s, _) in TAXONOMY_RANGES.items() if 7000 <= s < 8000],
        }
        # Assets series must include common asset taxonomies
        assert any("cash" in k or "asset" in k or "receivable" in k or "equipment" in k
                   for k in series_map[1])
        # Revenue series must include revenue and income
        assert any("revenue" in k or "income" in k for k in series_map[4])

    def test_no_range_overlaps(self):
        ranges = sorted(TAXONOMY_RANGES.values())
        for i in range(len(ranges) - 1):
            start_a, end_a = ranges[i]
            start_b, end_b = ranges[i + 1]
            assert end_a < start_b, f"Ranges overlap: {ranges[i]} and {ranges[i+1]}"

    def test_get_range_for_known_taxonomy(self):
        start, end = get_range_for_taxonomy("cash_equivalents")
        assert 1000 <= start < 1100
        assert end < 1100

    def test_get_range_for_unknown_taxonomy_returns_fallback(self):
        start, end = get_range_for_taxonomy("xyz_nonexistent")
        assert start == 9010
        assert end == 9999

    def test_get_account_series_labels(self):
        assert "Assets" in get_account_series("cash_equivalents")
        assert "Revenue" in get_account_series("revenue")
        assert "Cost of Goods Sold" in get_account_series("cogs")
        assert "Expenses" in get_account_series("operating_expenses")
        assert "Liabilities" in get_account_series("long_term_debt")
        assert "Equity" in get_account_series("retained_earnings")


# ---------------------------------------------------------------------------
# Tests: Hero Group full extraction integration
# ---------------------------------------------------------------------------

class TestHeroGroupIntegration:
    """Verify numbering on actual Hero Group extraction output."""

    @pytest.fixture(autouse=True)
    def _extracted(self):
        from pathlib import Path
        from app.services.pdf_extraction_service import extract_pdf_financials
        pdf = Path("tests/fixtures/pdf/hero_group_financial_statements_2025.pdf")
        if not pdf.exists():
            pytest.skip("Hero Group PDF fixture not found")
        result = extract_pdf_financials(str(pdf))
        self.lines = result["lines"]

    def test_all_detail_lines_get_numbers(self):
        numbers = generate_account_numbers(self.lines)
        detail_codes = [l["temp_account_code"] for l in self.lines if not l["is_subtotal"]]
        for code in detail_codes:
            assert numbers[code], f"No number assigned to {code}"

    def test_subtotals_get_no_number(self):
        numbers = generate_account_numbers(self.lines)
        sub_codes = [l["temp_account_code"] for l in self.lines if l["is_subtotal"]]
        for code in sub_codes:
            assert numbers[code] == "", f"Subtotal {code} got number {numbers[code]}"

    def test_balance_sheet_assets_in_1000_series(self):
        numbers = generate_account_numbers(self.lines)
        asset_lines = [l for l in self.lines if l["statement_type"] == "balance_sheet"
                       and not l["is_subtotal"]
                       and l["section"] in ("current_assets", "fixed_assets")]
        for line in asset_lines:
            num = int(numbers[line["temp_account_code"]])
            assert 1000 <= num < 2000, f"{line['account_name']} got {num} (expected 1xxx)"

    def test_revenue_lines_in_4000_series(self):
        numbers = generate_account_numbers(self.lines)
        rev_lines = [l for l in self.lines if l["section"] == "revenue" and not l["is_subtotal"]]
        for line in rev_lines:
            num = int(numbers[line["temp_account_code"]])
            assert 4000 <= num < 5000, f"{line['account_name']} got {num} (expected 4xxx)"

    def test_expense_lines_in_5000_to_7000_range(self):
        from app.services.account_number_generator import TAXONOMY_RANGES
        numbers = generate_account_numbers(self.lines)
        exp_taxonomies = {k for k, (s, _) in TAXONOMY_RANGES.items() if 5000 <= s < 7000}
        exp_lines = [
            l for l in self.lines
            if not l["is_subtotal"] and l.get("suggested_taxonomy_code") in exp_taxonomies
        ]
        for line in exp_lines:
            num = int(numbers[line["temp_account_code"]])
            assert 5000 <= num < 7000, f"{line['account_name']} ({line.get('suggested_taxonomy_code')}) got {num} (expected 5-6xxx)"

    def test_no_duplicate_numbers_within_batch(self):
        numbers = generate_account_numbers(self.lines)
        assigned = [v for v in numbers.values() if v]
        assert len(assigned) == len(set(assigned)), "Duplicate account numbers generated"
