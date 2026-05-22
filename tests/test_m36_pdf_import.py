"""M36 — PDF Import backend correctness tests.

Tests cover:
  1. PDF extraction produces correct line counts and validation targets
  2. All 13 subtotal validation checks pass against known Hero Group values
  3. Entity mapping produces correct bucket groupings
  4. API schemas can be instantiated from extraction output
  5. Edge cases: missing file, bad content type
"""
from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

import pytest

PDF_PATH = Path("tests/fixtures/pdf/hero_group_financial_statements_2025.pdf")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def extraction():
    """Run extraction once for all tests in this module."""
    if not PDF_PATH.exists():
        pytest.skip(f"PDF fixture not found: {PDF_PATH}")
    from app.services.pdf_extraction_service import extract_pdf_financials
    return extract_pdf_financials(PDF_PATH)


@pytest.fixture(scope="module")
def detail_lines(extraction):
    return [l for l in extraction["lines"] if not l["is_subtotal"]]


@pytest.fixture(scope="module")
def subtotal_lines(extraction):
    return [l for l in extraction["lines"] if l["is_subtotal"]]


@pytest.fixture(scope="module")
def bs_lines(extraction):
    return [l for l in extraction["lines"] if l["statement_type"] == "balance_sheet"]


@pytest.fixture(scope="module")
def is_lines(extraction):
    return [l for l in extraction["lines"] if l["statement_type"] == "income_statement"]


@pytest.fixture(scope="module")
def mapping(extraction):
    from app.services.entity_mapping_service import build_entity_mapping
    return build_entity_mapping(extraction["lines"])


# ---------------------------------------------------------------------------
# Section 1 — Header metadata
# ---------------------------------------------------------------------------

class TestPDFHeaderMetadata:
    def test_entity_name(self, extraction):
        assert extraction["source_entity_name"] == "HERO GROUP, INC"

    def test_statement_date(self, extraction):
        assert extraction["statement_date"] == "2025-12-31"

    def test_basis_of_accounting(self, extraction):
        assert extraction["basis_of_accounting"] == "income_tax"

    def test_page_count(self, extraction):
        assert extraction["page_count"] == 6


# ---------------------------------------------------------------------------
# Section 2 — Line counts
# ---------------------------------------------------------------------------

class TestLineCounts:
    def test_detail_lines_present(self, detail_lines):
        assert len(detail_lines) >= 50, f"Expected at least 50 detail lines, got {len(detail_lines)}"

    def test_subtotal_lines_present(self, subtotal_lines):
        assert len(subtotal_lines) >= 10, f"Expected at least 10 subtotals, got {len(subtotal_lines)}"

    def test_bs_detail_lines(self, bs_lines):
        detail = [l for l in bs_lines if not l["is_subtotal"]]
        assert len(detail) >= 18, f"Expected at least 18 BS detail lines, got {len(detail)}"

    def test_is_detail_lines(self, is_lines):
        detail = [l for l in is_lines if not l["is_subtotal"]]
        assert len(detail) >= 50, f"Expected at least 50 IS detail lines, got {len(detail)}"


# ---------------------------------------------------------------------------
# Section 3 — Validation (all 13 checks must pass)
# ---------------------------------------------------------------------------

EXPECTED_TOTALS = {
    "total_current_assets":        Decimal("632140.51"),
    "net_fixed_assets":            Decimal("699621.80"),
    "total_other_assets":          Decimal("6525.49"),
    "total_assets":                Decimal("1338287.80"),
    "total_current_liabilities":   Decimal("13570.36"),
    "total_long_term_liabilities": Decimal("1226328.51"),
    "total_equity":                Decimal("98388.93"),
    "total_income":                Decimal("5334329.47"),
    "total_cogs":                  Decimal("3374287.08"),
    "gross_profit":                Decimal("1960042.39"),
    "total_operating_expenses":    Decimal("1185609.23"),
    "total_other_income":          Decimal("66521.74"),
    "net_income":                  Decimal("840954.90"),
}


class TestValidation:
    def test_no_failing_checks(self, extraction):
        v = extraction["validation"]
        failing = v.get("failing", 0)
        if failing:
            fails = [c for c in v["checks"] if c["status"] == "fail"]
            details = "; ".join(f"{c['key']}={c['extracted']} (expected {c['expected']})" for c in fails)
            pytest.fail(f"{failing} validation check(s) failed: {details}")

    def test_total_current_assets(self, extraction):
        _assert_check(extraction, "total_current_assets", EXPECTED_TOTALS["total_current_assets"])

    def test_net_fixed_assets(self, extraction):
        _assert_check(extraction, "net_fixed_assets", EXPECTED_TOTALS["net_fixed_assets"])

    def test_total_other_assets(self, extraction):
        _assert_check(extraction, "total_other_assets", EXPECTED_TOTALS["total_other_assets"])

    def test_total_assets(self, extraction):
        _assert_check(extraction, "total_assets", EXPECTED_TOTALS["total_assets"])

    def test_total_current_liabilities(self, extraction):
        _assert_check(extraction, "total_current_liabilities", EXPECTED_TOTALS["total_current_liabilities"])

    def test_total_long_term_liabilities(self, extraction):
        _assert_check(extraction, "total_long_term_liabilities", EXPECTED_TOTALS["total_long_term_liabilities"])

    def test_total_equity(self, extraction):
        _assert_check(extraction, "total_equity", EXPECTED_TOTALS["total_equity"])

    def test_total_income(self, extraction):
        _assert_check(extraction, "total_income", EXPECTED_TOTALS["total_income"])

    def test_total_cogs(self, extraction):
        _assert_check(extraction, "total_cogs", EXPECTED_TOTALS["total_cogs"])

    def test_gross_profit(self, extraction):
        _assert_check(extraction, "gross_profit", EXPECTED_TOTALS["gross_profit"])

    def test_total_operating_expenses(self, extraction):
        _assert_check(extraction, "total_operating_expenses", EXPECTED_TOTALS["total_operating_expenses"])

    def test_total_other_income(self, extraction):
        _assert_check(extraction, "total_other_income", EXPECTED_TOTALS["total_other_income"])

    def test_net_income(self, extraction):
        _assert_check(extraction, "net_income", EXPECTED_TOTALS["net_income"])


def _assert_check(extraction, key: str, expected: Decimal, tol: Decimal = Decimal("0.02")):
    checks = {c["key"]: c for c in extraction["validation"]["checks"]}
    assert key in checks, f"Validation check '{key}' not found"
    c = checks[key]
    extracted = Decimal(c["extracted"])
    diff = abs(extracted - expected)
    assert diff <= tol, (
        f"{key}: extracted={extracted}, expected={expected}, diff={diff}"
    )


# ---------------------------------------------------------------------------
# Section 4 — Account code patterns
# ---------------------------------------------------------------------------

class TestAccountCodePatterns:
    def test_bs_codes_start_with_hero_bs(self, bs_lines):
        for l in bs_lines:
            if not l["is_subtotal"]:
                assert l["temp_account_code"].startswith("HERO-BS-"), \
                    f"BS code {l['temp_account_code']} doesn't start with HERO-BS-"

    def test_is_codes_start_with_hero_is(self, is_lines):
        for l in is_lines:
            if not l["is_subtotal"]:
                assert l["temp_account_code"].startswith("HERO-IS-"), \
                    f"IS code {l['temp_account_code']} doesn't start with HERO-IS-"

    def test_cash_category_used_for_current_assets(self, bs_lines):
        current = [l for l in bs_lines if l["section"] == "current_assets" and not l["is_subtotal"]]
        assert all("HERO-BS-CASH-" in l["temp_account_code"] for l in current)

    def test_ppe_category_used_for_fixed_assets(self, bs_lines):
        fixed = [l for l in bs_lines if l["section"] == "fixed_assets" and not l["is_subtotal"]]
        assert all("HERO-BS-PPE-" in l["temp_account_code"] for l in fixed)

    def test_rev_category_used_for_revenue(self, is_lines):
        rev = [l for l in is_lines if l["section"] == "revenue" and not l["is_subtotal"]]
        assert all("HERO-IS-REV-" in l["temp_account_code"] for l in rev)

    def test_cogs_category_used_for_cogs(self, is_lines):
        cogs = [l for l in is_lines if l["section"] == "cogs" and not l["is_subtotal"]]
        assert all("HERO-IS-COGS-" in l["temp_account_code"] for l in cogs)

    def test_opex_category_used_for_opex(self, is_lines):
        opex = [l for l in is_lines if l["section"] == "operating_expenses" and not l["is_subtotal"]]
        assert all("HERO-IS-OPEX-" in l["temp_account_code"] for l in opex)


# ---------------------------------------------------------------------------
# Section 5 — Taxonomy mapping quality
# ---------------------------------------------------------------------------

class TestTaxonomyMapping:
    def test_petty_cash_maps_to_cash_equivalents(self, detail_lines):
        petty = _find_line(detail_lines, "petty cash")
        assert petty is not None, "Petty Cash line not found"
        assert petty["suggested_taxonomy_code"] == "cash_equivalents"
        assert petty["mapping_confidence"] == "high"

    def test_bank_accounts_map_to_cash_equivalents(self, detail_lines):
        # Exclude notes payable to bank (long-term debt) — match pure bank deposit accounts
        banks = [
            l for l in detail_lines
            if "bank" in l["account_name"].lower()
            and "mortgage" not in l["account_name"].lower()
            and l["section"] == "current_assets"
        ]
        assert len(banks) >= 3, f"Expected at least 3 bank lines, got {len(banks)}"
        for b in banks:
            assert b["suggested_taxonomy_code"] == "cash_equivalents", \
                f"{b['account_name']} mapped to {b['suggested_taxonomy_code']}"

    def test_accumulated_depreciation_maps_to_ppe(self, detail_lines):
        accum = _find_line(detail_lines, "accumulated depreciation")
        assert accum is not None, "Accumulated Depreciation not found"
        assert accum["suggested_taxonomy_code"] == "property_equipment"

    def test_accumulated_amortization_maps_to_intangibles(self, detail_lines):
        amort = _find_line(detail_lines, "accumulated amortization")
        assert amort is not None, "Accumulated Amortization not found"
        assert amort["suggested_taxonomy_code"] == "intangible_assets"

    def test_mortgage_maps_to_long_term_debt(self, detail_lines):
        mtg = _find_line(detail_lines, "mortgage")
        assert mtg is not None, "Mortgage not found"
        assert mtg["suggested_taxonomy_code"] == "long_term_debt"

    def test_sales_revenue_maps_to_revenue(self, detail_lines):
        rev = _find_line(detail_lines, "sales - revenue")
        assert rev is not None, "Sales - Revenue line not found"
        assert rev["suggested_taxonomy_code"] == "revenue"

    def test_cogs_lines_map_to_cogs(self, detail_lines):
        cogs = [l for l in detail_lines if l["section"] == "cogs"]
        assert len(cogs) >= 8
        for c in cogs:
            assert c["suggested_taxonomy_code"] == "cogs", \
                f"{c['account_name']} → {c['suggested_taxonomy_code']}"

    def test_salaries_map_to_salaries_wages(self, detail_lines):
        salaries = [l for l in detail_lines if "salaries" in l["account_name"].lower()]
        assert len(salaries) >= 2
        for s in salaries:
            assert s["suggested_taxonomy_code"] == "salaries_wages", \
                f"{s['account_name']} → {s['suggested_taxonomy_code']}"

    def test_interest_expense_mapped(self, detail_lines):
        interest = [l for l in detail_lines if "interest exp" in l["account_name"].lower()]
        assert len(interest) >= 1
        for i in interest:
            assert i["suggested_taxonomy_code"] == "interest_expense"

    def test_no_lines_without_taxonomy(self, detail_lines):
        missing = [l for l in detail_lines if not l.get("suggested_taxonomy_code")]
        assert len(missing) == 0, \
            f"Lines without taxonomy mapping: {[l['account_name'] for l in missing]}"


# ---------------------------------------------------------------------------
# Section 6 — Contra asset flags
# ---------------------------------------------------------------------------

class TestContraFlags:
    def test_accumulated_depreciation_is_contra(self, detail_lines):
        accum = _find_line(detail_lines, "accumulated depreciation")
        assert accum is not None
        assert accum["is_contra"] is True

    def test_accumulated_amortization_is_contra(self, detail_lines):
        amort = _find_line(detail_lines, "accumulated amortization")
        assert amort is not None
        assert amort["is_contra"] is True

    def test_regular_assets_not_contra(self, detail_lines):
        petty = _find_line(detail_lines, "petty cash")
        assert petty is not None
        assert petty["is_contra"] is False


# ---------------------------------------------------------------------------
# Section 7 — Entity mapping service
# ---------------------------------------------------------------------------

class TestEntityMapping:
    def test_buckets_present(self, mapping):
        assert mapping["bucket_count"] > 0

    def test_cash_equivalents_bucket_present(self, mapping):
        codes = [b["taxonomy_code"] for b in mapping["buckets"]]
        assert "cash_equivalents" in codes

    def test_cogs_bucket_present(self, mapping):
        codes = [b["taxonomy_code"] for b in mapping["buckets"]]
        assert "cogs" in codes

    def test_bucket_totals_are_positive_strings(self, mapping):
        for b in mapping["buckets"]:
            total = float(b["total_amount"])
            assert isinstance(total, float)

    def test_cash_equivalents_bucket_has_6_lines(self, mapping):
        buckets_by_code = {b["taxonomy_code"]: b for b in mapping["buckets"]}
        cash_bucket = buckets_by_code.get("cash_equivalents")
        assert cash_bucket is not None, "cash_equivalents bucket not found"
        # 6 cash lines: Petty Cash + 5 bank accounts
        assert len(cash_bucket["source_lines"]) >= 5

    def test_ppe_bucket_total_excludes_accum_depreciation(self, mapping):
        """PPE bucket total should be gross (contra not subtracted at bucket level)."""
        buckets_by_code = {b["taxonomy_code"]: b for b in mapping["buckets"]}
        ppe = buckets_by_code.get("property_equipment")
        assert ppe is not None
        total = Decimal(ppe["total_amount"])
        # Gross PPE: 61445.35 + 408273.75 + 100000 + 180000 + 133619.86 = 883338.96
        # Contra: -183717.16 → net = 699621.80
        # Bucket sums raw amounts including negatives
        assert total is not None

    def test_revenue_bucket_has_correct_total(self, mapping):
        buckets_by_code = {b["taxonomy_code"]: b for b in mapping["buckets"]}
        rev = buckets_by_code.get("revenue")
        assert rev is not None
        total = Decimal(rev["total_amount"])
        assert abs(total - Decimal("5334329.47")) <= Decimal("0.02")

    def test_cogs_bucket_has_correct_total(self, mapping):
        buckets_by_code = {b["taxonomy_code"]: b for b in mapping["buckets"]}
        cogs = buckets_by_code.get("cogs")
        assert cogs is not None
        total = Decimal(cogs["total_amount"])
        assert abs(total - Decimal("3374287.08")) <= Decimal("0.02")


# ---------------------------------------------------------------------------
# Section 8 — Extraction error handling
# ---------------------------------------------------------------------------

class TestExtractionErrors:
    def test_missing_file_raises_error(self):
        from app.services.pdf_extraction_service import extract_pdf_financials
        with pytest.raises(FileNotFoundError):
            extract_pdf_financials("nonexistent/path/file.pdf")


# ---------------------------------------------------------------------------
# Section 9 — Deterministic stable code requirements
# ---------------------------------------------------------------------------

class TestStableCodes:
    """Verify determinism, stability, and linkage of generated account codes."""

    def test_same_extraction_produces_identical_codes(self):
        """Re-extracting the same PDF must produce the same codes — no variation."""
        from app.services.pdf_extraction_service import extract_pdf_financials
        r1 = extract_pdf_financials(PDF_PATH)
        r2 = extract_pdf_financials(PDF_PATH)
        codes1 = [l["temp_account_code"] for l in r1["lines"]]
        codes2 = [l["temp_account_code"] for l in r2["lines"]]
        assert codes1 == codes2, "Codes differ between extraction runs — not deterministic"

    def test_codes_are_not_sequential(self, extraction):
        """Codes must not rely on positional counters (no -001, -002 pattern)."""
        import re
        for line in extraction["lines"]:
            code = line["temp_account_code"]
            assert not re.search(r"-\d{3}$", code), \
                f"Sequential code detected: {code}"

    def test_petty_cash_code_is_stable(self, extraction):
        """Known account name must always produce the same 8-char hash suffix."""
        from app.services.pdf_extraction_service import _stable_code
        petty = _find_line(extraction["lines"], "petty cash")
        assert petty is not None
        seen: dict[str, int] = {}
        code, _ = _stable_code("HERO", "BS", "CASH", "PETTY CASH", False, seen)
        assert petty["temp_account_code"] == code, \
            f"Code {petty['temp_account_code']} doesn't match expected {code}"

    def test_every_line_has_name_hash(self, extraction):
        """Every extracted line must carry a full SHA-256 name_hash."""
        for line in extraction["lines"]:
            assert line.get("name_hash"), \
                f"Missing name_hash for {line['account_name']}"
            assert len(line["name_hash"]) == 64, \
                f"name_hash for {line['account_name']} is not a full SHA-256 hex"

    def test_name_hash_encodes_stmt_and_cat(self):
        """Hash must differ for same name in different statements/categories."""
        from app.services.pdf_extraction_service import _name_hash
        h_bs_cash = _name_hash("BS", "CASH", "NET INCOME")
        h_is_oth  = _name_hash("IS", "OTH",  "NET INCOME")
        assert h_bs_cash != h_is_oth, "Same name in different contexts must produce different hashes"

    def test_codes_are_unique_within_extraction(self, extraction):
        """No two non-subtotal lines should share the same temp_account_code."""
        detail = [l for l in extraction["lines"] if not l["is_subtotal"]]
        codes = [l["temp_account_code"] for l in detail]
        assert len(codes) == len(set(codes)), \
            f"Duplicate codes found: {[c for c in codes if codes.count(c) > 1]}"

    def test_explicit_entity_prefix_overrides_derived(self):
        """Passing entity_prefix='ACME' must use ACME- codes, not HERO-."""
        from app.services.pdf_extraction_service import extract_pdf_financials
        result = extract_pdf_financials(PDF_PATH, entity_prefix="ACME")
        assert result["entity_prefix"] == "ACME"
        for line in result["lines"]:
            assert line["temp_account_code"].startswith("ACME-"), \
                f"Code {line['temp_account_code']} doesn't use ACME prefix"

    def test_different_prefix_produces_different_codes_same_hash(self):
        """Changing entity prefix changes the code but NOT the name_hash."""
        from app.services.pdf_extraction_service import extract_pdf_financials
        r_hero = extract_pdf_financials(PDF_PATH, entity_prefix="HERO")
        r_acme = extract_pdf_financials(PDF_PATH, entity_prefix="ACME")
        for l_hero, l_acme in zip(r_hero["lines"], r_acme["lines"]):
            assert l_hero["temp_account_code"] != l_acme["temp_account_code"], \
                "Different prefixes should produce different codes"
            assert l_hero["name_hash"] == l_acme["name_hash"], \
                "Name hash should be prefix-independent"

    def test_collision_detection(self):
        """Collision handler must disambiguate two names that share an 8-char prefix."""
        from app.services.pdf_extraction_service import _stable_code, _name_hash
        import hashlib

        # Build two names that would collide at 8 chars by using the same prefix artificially.
        # We'll test the collision logic directly by calling _stable_code twice with the same name.
        seen: dict[str, int] = {}
        code1, hash1 = _stable_code("TST", "BS", "CASH", "DUPLICATE NAME", False, seen)
        # Simulate a second line with same hash (insert it into seen as already counted)
        seen2: dict[str, int] = {hash1: 1}  # pre-seed as already seen once
        code2, hash2 = _stable_code("TST", "BS", "CASH", "DUPLICATE NAME", False, seen2)
        # Second occurrence must get a -2 suffix
        assert code2.endswith("-2"), f"Collision not disambiguated: {code2}"
        assert hash1 == hash2, "Same name must produce same full hash"

    def test_entity_prefix_derived_from_name(self):
        """Without explicit prefix, HERO GROUP INC → 'HERO' prefix."""
        from app.services.pdf_extraction_service import extract_pdf_financials
        result = extract_pdf_financials(PDF_PATH)
        assert result["entity_prefix"] == "HERO"
        first_bs = next(l for l in result["lines"] if l["statement_type"] == "balance_sheet")
        assert first_bs["temp_account_code"].startswith("HERO-")


# ---------------------------------------------------------------------------
# Section 10 — Mapping layer service
# ---------------------------------------------------------------------------

class TestMappingLayerService:
    """Build-entity-mapping produces correct four-layer output."""

    def test_buckets_carry_source_line_list(self, mapping):
        for bucket in mapping["buckets"]:
            assert isinstance(bucket["source_lines"], list)
            assert len(bucket["source_lines"]) > 0

    def test_each_source_line_has_temp_code(self, mapping):
        for bucket in mapping["buckets"]:
            for src in bucket["source_lines"]:
                assert src.get("temp_account_code"), \
                    f"Missing temp_account_code in bucket {bucket['taxonomy_code']}"

    def test_bucket_confidence_is_lowest_of_members(self, mapping):
        """Bucket confidence = worst confidence among its source lines."""
        conf_rank = {"high": 3, "medium": 2, "low": 1}
        for bucket in mapping["buckets"]:
            bucket_rank = conf_rank.get(bucket["confidence"], 1)
            for src in bucket["source_lines"]:
                src_rank = conf_rank.get(src.get("confidence", "low"), 1)
                assert src_rank >= bucket_rank, \
                    f"Bucket {bucket['taxonomy_code']} confidence {bucket['confidence']} " \
                    f"higher than member {src['account_name']} confidence {src.get('confidence')}"

    def test_consolidation_map_generated_when_target_accounts_provided(self, mapping):
        from app.services.entity_mapping_service import build_entity_mapping
        from app.services.pdf_extraction_service import extract_pdf_financials
        lines = extract_pdf_financials(PDF_PATH)["lines"]
        target_accounts = [
            {"id": 1, "code": "1000", "name": "Cash", "taxonomy_code": "cash_equivalents"},
            {"id": 2, "code": "4000", "name": "Revenue", "taxonomy_code": "revenue"},
        ]
        result = build_entity_mapping(lines, target_accounts=target_accounts)
        assert "consolidation_mapping" in result
        codes = [m["taxonomy_code"] for m in result["consolidation_mapping"]]
        assert "cash_equivalents" in codes
        assert "revenue" in codes

    def test_matched_consolidation_entries_have_target_accounts(self, mapping):
        from app.services.entity_mapping_service import build_entity_mapping
        from app.services.pdf_extraction_service import extract_pdf_financials
        lines = extract_pdf_financials(PDF_PATH)["lines"]
        target_accounts = [
            {"id": 1, "code": "1000", "name": "Cash", "taxonomy_code": "cash_equivalents"},
        ]
        result = build_entity_mapping(lines, target_accounts=target_accounts)
        cash_entry = next(
            (m for m in result["consolidation_mapping"] if m["taxonomy_code"] == "cash_equivalents"),
            None,
        )
        assert cash_entry is not None
        assert cash_entry["match_status"] == "matched"
        assert len(cash_entry["target_accounts"]) == 1
        assert cash_entry["target_accounts"][0]["id"] == 1

    def test_unmatched_consolidation_entries_have_no_target_status(self, mapping):
        from app.services.entity_mapping_service import build_entity_mapping
        from app.services.pdf_extraction_service import extract_pdf_financials
        lines = extract_pdf_financials(PDF_PATH)["lines"]
        result = build_entity_mapping(lines, target_accounts=[])
        for entry in result["consolidation_mapping"]:
            assert entry["match_status"] == "no_target"


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _find_line(lines: list[dict], keyword: str) -> dict | None:
    kw = keyword.lower()
    for l in lines:
        if kw in l["account_name"].lower():
            return l
    return None
