"""Intelligent accounting-standard account number generator.

Maps PDF-extracted lines to standard chart-of-accounts numbering ranges:
  1000–1999  Assets
  2000–2999  Liabilities
  3000–3999  Equity
  4000–4999  Revenue
  5000–5999  Cost of Goods Sold
  6000–6999  Operating Expenses
  7000–7999  Other Income / Expense
  9000–9999  Tax / Extraordinary

Sub-accounts increment by 10 within each range, preserving gaps for
manual insertions. The same (taxonomy_code, normalized_name) always
produces the same number for a given batch — numbers are deterministic
within a single apply call but not guaranteed stable across batches
(use temp_account_code + name_hash for cross-batch identity).
"""

from __future__ import annotations

from typing import Any

# ---------------------------------------------------------------------------
# Range definitions
# ---------------------------------------------------------------------------

TAXONOMY_RANGES: dict[str, tuple[int, int]] = {
    # --- Assets ---
    "cash_equivalents":           (1010, 1099),
    "accounts_receivable":        (1110, 1199),
    "inventory":                  (1210, 1299),
    "prepaid_expenses":           (1310, 1399),
    "other_current_assets":       (1410, 1499),
    "property_equipment":         (1510, 1699),
    "accumulated_depreciation":   (1710, 1799),
    "intangible_assets":          (1810, 1899),
    "other_noncurrent_assets":    (1900, 1990),
    # --- Liabilities ---
    "accounts_payable":           (2010, 2099),
    "accrued_liabilities":        (2110, 2199),
    "short_term_debt":            (2210, 2299),
    "deferred_revenue":           (2310, 2399),
    "sales_tax_payable":          (2410, 2499),
    "other_current_liabilities":  (2510, 2599),
    "long_term_debt":             (2610, 2699),
    "other_long_term_liabilities":(2710, 2799),
    # --- Equity ---
    "common_stock":               (3010, 3099),
    "retained_earnings":          (3110, 3299),
    "equity":                     (3310, 3499),
    # --- Revenue ---
    "revenue":                    (4010, 4399),
    "other_income":               (4410, 4499),
    # --- COGS ---
    "cogs":                       (5010, 5499),
    # --- Expenses ---
    "salaries_wages":             (6010, 6099),
    "operating_expenses":         (6110, 6799),
    "depreciation_amort":         (6810, 6899),
    "interest_expense":           (6910, 6999),
    # --- Other income/expense ---
    "other_expense":              (7010, 7099),
    "tax_expense":                (7910, 7999),
}

# Default range for taxonomy codes not explicitly listed
_FALLBACK_RANGE = (9010, 9999)

# Section → taxonomy fallback (used when suggested_taxonomy_code is absent)
_SECTION_FALLBACK: dict[str, str] = {
    "current_assets":         "other_current_assets",
    "fixed_assets":           "property_equipment",
    "other_assets":           "other_noncurrent_assets",
    "current_liabilities":    "other_current_liabilities",
    "long_term_liabilities":  "long_term_debt",
    "equity":                 "retained_earnings",
    "revenue":                "revenue",
    "cogs":                   "cogs",
    "operating_expenses":     "operating_expenses",
    "other_income":           "other_income",
}


# ---------------------------------------------------------------------------
# Generator
# ---------------------------------------------------------------------------

def generate_account_numbers(
    lines: list[dict[str, Any]],
    step: int = 10,
) -> dict[str, str]:
    """Assign standard account numbers to a list of extracted PDF lines.

    Args:
        lines: List of line dicts from pdf_extraction_service (must include
               temp_account_code, suggested_taxonomy_code, section, is_subtotal).
        step: Increment between sequential accounts (default 10).

    Returns:
        Dict mapping temp_account_code → assigned account number (str).
        Subtotal lines receive no number (they map to empty string "").

    Guarantees uniqueness across the entire batch using a global used-number set.
    """
    range_counters: dict[str, int] = {}
    used: set[int] = set()
    result: dict[str, str] = {}

    for line in lines:
        code = line.get("temp_account_code", "")
        if line.get("is_subtotal"):
            result[code] = ""
            continue

        taxonomy = line.get("suggested_taxonomy_code") or _SECTION_FALLBACK.get(
            line.get("section", ""), ""
        )
        range_start, range_end = TAXONOMY_RANGES.get(taxonomy, _FALLBACK_RANGE)

        if taxonomy not in range_counters:
            range_counters[taxonomy] = range_start

        candidate = range_counters[taxonomy]

        # Skip already-used numbers (collision avoidance across taxonomy groups)
        while candidate in used:
            candidate += step

        # If we've overrun this taxonomy's designated range, overflow to the next
        # round hundred past range_end, still avoiding collisions
        if candidate > range_end:
            candidate = ((range_end // 100) + 1) * 100 + (range_start % 100)
            while candidate in used:
                candidate += step

        result[code] = str(candidate)
        used.add(candidate)
        range_counters[taxonomy] = candidate + step

    return result


def get_range_for_taxonomy(taxonomy_code: str) -> tuple[int, int]:
    """Return the (start, end) range for a given taxonomy code."""
    return TAXONOMY_RANGES.get(taxonomy_code, _FALLBACK_RANGE)


def get_account_series(taxonomy_code: str) -> str:
    """Return the account series label (e.g. '1000 series — Assets')."""
    start, _ = TAXONOMY_RANGES.get(taxonomy_code, _FALLBACK_RANGE)
    series = start // 1000
    labels = {
        1: "1000 series — Assets",
        2: "2000 series — Liabilities",
        3: "3000 series — Equity",
        4: "4000 series — Revenue",
        5: "5000 series — Cost of Goods Sold",
        6: "6000 series — Expenses",
        7: "7000 series — Other Income/Expense",
        9: "9000 series — Tax/Extraordinary",
    }
    return labels.get(series, f"{series}000 series")
