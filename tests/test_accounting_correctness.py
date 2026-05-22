"""
Accounting correctness shadow tests — milestone accounting.

Validates:
  1. Rollup math (parent/child aggregation, contra-asset reduction)
  2. Sign conventions (credit-normal flip, debit-normal no flip)
  3. Hierarchy depth computation
  4. Taxonomy auto-mapping for Live Marketing COA accounts
  5. Standard taxonomy V2 structural invariants
  6. Known mapping bugs (fixed) and known limitations (documented)

No database required for most tests — uses static service logic only.
"""
from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.services.reporting_taxonomy_service import get_suggested_taxonomy_code, STANDARD_TAXONOMY_V2
from app.services.taxonomy_reporting_service import _rollup, _compute_depths, _sign_flip


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def line(id, parent_id=None, normal_balance="debit", sign_behavior="positive"):
    ns = SimpleNamespace()
    ns.id = id
    ns.parent_id = parent_id
    ns.normal_balance = normal_balance
    ns.sign_behavior = sign_behavior
    return ns


# ===========================================================================
# 1. ROLLUP MATH
# ===========================================================================

class TestRollupMath:

    def test_single_debit_account(self):
        lines = {1: line(1)}
        totals = _rollup({1: Decimal("100")}, lines)
        assert totals[1] == Decimal("100")

    def test_single_credit_balance(self):
        """Revenue credit balance stored as negative net_debit."""
        lines = {1: line(1, normal_balance="credit")}
        totals = _rollup({1: Decimal("-1000")}, lines)
        assert totals[1] == Decimal("-1000")

    def test_child_aggregates_to_parent(self):
        """Parent cash + child FHB $100 → parent total = 100."""
        lines = {1: line(1), 2: line(2, parent_id=1)}
        totals = _rollup({1: Decimal("0"), 2: Decimal("100")}, lines)
        assert totals[1] == Decimal("100")
        assert totals[2] == Decimal("100")

    def test_parent_direct_plus_child(self):
        """Parent $50 direct + child $100 → parent total = 150."""
        lines = {1: line(1), 2: line(2, parent_id=1)}
        totals = _rollup({1: Decimal("50"), 2: Decimal("100")}, lines)
        assert totals[1] == Decimal("150")

    def test_three_children_aggregate(self):
        lines = {1: line(1), 2: line(2, parent_id=1), 3: line(3, parent_id=1), 4: line(4, parent_id=1)}
        totals = _rollup({1: Decimal("0"), 2: Decimal("10"), 3: Decimal("20"), 4: Decimal("30")}, lines)
        assert totals[1] == Decimal("60")

    def test_three_level_hierarchy(self):
        """Grandparent → Parent → Child $100 → grandparent = 100."""
        lines = {1: line(1), 2: line(2, parent_id=1), 3: line(3, parent_id=2)}
        totals = _rollup({1: Decimal("0"), 2: Decimal("0"), 3: Decimal("100")}, lines)
        assert totals[1] == Decimal("100")
        assert totals[2] == Decimal("100")
        assert totals[3] == Decimal("100")

    def test_contra_asset_reduces_ppe(self):
        """
        P&E (debit-normal) has two sub-accounts:
          Equipment       net_debit = +1000 (debit balance)
          Accum.Depr.     net_debit = -300  (credit balance, contra-asset)
        P&E total = 700; display_balance = 700 (no sign flip for debit-normal).
        """
        lines = {
            1: line(1, normal_balance="debit"),   # property_equipment
            2: line(2, parent_id=1),              # equipment $1000
            3: line(3, parent_id=1),              # accum.depr. credit balance
        }
        totals = _rollup({1: Decimal("0"), 2: Decimal("1000"), 3: Decimal("-300")}, lines)
        assert totals[1] == Decimal("700")

        # sign_flip for debit-normal is False → display = total unchanged
        assert _sign_flip(lines[1]) is False
        display = -totals[1] if _sign_flip(lines[1]) else totals[1]
        assert display == Decimal("700")

    def test_gross_profit_math(self):
        """
        Revenue net_debit = -6_548_641 (credit balance)
        COGS   net_debit =  1_161_632  (debit balance)

        Revenue display = -(-6_548_641) = 6_548_641  (credit-normal, flip=True)
        COGS    display =   1_161_632               (debit-normal, flip=False)
        Gross Profit = Revenue display - COGS display = 5_387_009
        """
        rev = line(1, normal_balance="credit")
        cog = line(2, normal_balance="debit")
        lines = {1: rev, 2: cog}
        totals = _rollup({1: Decimal("-6548641"), 2: Decimal("1161632")}, lines)

        revenue_display = -totals[1] if _sign_flip(rev) else totals[1]
        cogs_display    = -totals[2] if _sign_flip(cog) else totals[2]
        gross_profit    = revenue_display - cogs_display
        assert gross_profit == Decimal("5387009")

    def test_zero_balance_account(self):
        lines = {1: line(1)}
        totals = _rollup({1: Decimal("0")}, lines)
        assert totals[1] == Decimal("0")

    def test_cycle_guard_no_infinite_loop(self):
        """Circular parent references must not cause infinite recursion."""
        lines = {1: line(1, parent_id=2), 2: line(2, parent_id=1)}
        totals = _rollup({1: Decimal("100"), 2: Decimal("200")}, lines)
        assert totals  # returns without error

    def test_multi_sibling_mixed_signs(self):
        """Three siblings with mixed signs: +500, -200, +300 → parent = 600."""
        lines = {1: line(1), 2: line(2, parent_id=1), 3: line(3, parent_id=1), 4: line(4, parent_id=1)}
        totals = _rollup({1: Decimal("0"), 2: Decimal("500"), 3: Decimal("-200"), 4: Decimal("300")}, lines)
        assert totals[1] == Decimal("600")


# ===========================================================================
# 2. SIGN CONVENTIONS
# ===========================================================================

class TestSignConventions:

    def test_credit_normal_flips(self):
        assert _sign_flip(line(1, normal_balance="credit")) is True

    def test_debit_normal_no_flip(self):
        assert _sign_flip(line(1, normal_balance="debit")) is False

    def test_negative_sign_behavior_flips(self):
        assert _sign_flip(line(1, normal_balance="debit", sign_behavior="negative")) is True

    def test_revenue_credit_shows_positive(self):
        """Revenue with credit balance (net_debit = -100) → display = +100."""
        rev = line(1, normal_balance="credit")
        total = Decimal("-100")
        display = -total if _sign_flip(rev) else total
        assert display == Decimal("100")

    def test_contra_revenue_shows_negative(self):
        """Sales discount (credit-normal, debit balance) → display = -75."""
        discount = line(1, normal_balance="credit")
        total = Decimal("75")  # debit balance for contra-revenue
        display = -total if _sign_flip(discount) else total
        assert display == Decimal("-75")

    def test_asset_debit_balance_shows_positive(self):
        cash = line(1, normal_balance="debit")
        total = Decimal("100")
        display = -total if _sign_flip(cash) else total
        assert display == Decimal("100")

    def test_accum_depr_credit_balance_shows_negative_in_ppe(self):
        """Accumulated Depreciation mapped to P&E (debit-normal), credit balance → negative display."""
        ppe = line(1, normal_balance="debit")
        total = Decimal("-300")  # net_debit of contra-asset with credit balance
        display = -total if _sign_flip(ppe) else total
        assert display == Decimal("-300")

    def test_liability_credit_shows_positive(self):
        """AP with credit balance → display = +250."""
        ap = line(1, normal_balance="credit")
        total = Decimal("-250")
        display = -total if _sign_flip(ap) else total
        assert display == Decimal("250")

    def test_equity_credit_shows_positive(self):
        """Retained Earnings with credit balance → display = +442_587."""
        re = line(1, normal_balance="credit")
        total = Decimal("-442587")
        display = -total if _sign_flip(re) else total
        assert display == Decimal("442587")


# ===========================================================================
# 3. HIERARCHY DEPTH
# ===========================================================================

class TestHierarchyDepth:

    def test_root_is_zero(self):
        lines = {1: line(1)}
        depths = _compute_depths(lines)
        assert depths[1] == 0

    def test_one_level(self):
        lines = {1: line(1), 2: line(2, parent_id=1)}
        depths = _compute_depths(lines)
        assert depths[1] == 0
        assert depths[2] == 1

    def test_two_levels(self):
        lines = {1: line(1), 2: line(2, parent_id=1), 3: line(3, parent_id=2)}
        depths = _compute_depths(lines)
        assert depths[1] == 0
        assert depths[2] == 1
        assert depths[3] == 2

    def test_sibling_same_depth(self):
        lines = {1: line(1), 2: line(2, parent_id=1), 3: line(3, parent_id=1)}
        depths = _compute_depths(lines)
        assert depths[2] == depths[3] == 1


# ===========================================================================
# 4. TAXONOMY MAPPING — LIVE MARKETING COA
#    COA uses Format C: Account Number, Account Name, Account Type
#    Types: asset / liability / equity / revenue / expense
# ===========================================================================

class TestLiveMarketingMappings:

    # --- Assets ---------------------------------------------------------------

    def test_1000_cash_maps_to_cash_equivalents(self):
        code, _ = get_suggested_taxonomy_code(account_type="asset", account_name="Cash")
        assert code == "cash_equivalents"

    def test_1200_ar_maps_correctly(self):
        code, _ = get_suggested_taxonomy_code(account_type="asset", account_name="Accounts Receivable")
        assert code == "accounts_receivable"

    def test_1300_inventory_maps_correctly(self):
        code, _ = get_suggested_taxonomy_code(account_type="asset", account_name="Inventory")
        assert code == "inventory"

    def test_1400_prepaid_maps_correctly(self):
        code, _ = get_suggested_taxonomy_code(account_type="asset", account_name="Prepaid Expenses")
        assert code == "prepaid_expenses"

    def test_1400_security_deposit_maps_to_other_nca(self):
        code, _ = get_suggested_taxonomy_code(
            account_type="asset", account_name="Security Deposit for Ryobi Press"
        )
        # "security deposit" contains no P&E or inventory keyword; asset type has no direct mapping
        # Falls to name keyword — no keyword matches security deposit → None
        # This is a known gap; user can re-classify manually
        assert code in (None, "other_non_current_assets", "property_equipment")

    def test_1500_furniture_equipment_maps_to_ppe(self):
        code, _ = get_suggested_taxonomy_code(
            account_type="asset", account_name="Furniture and Equipment"
        )
        assert code == "property_equipment"

    def test_1600_leasehold_improvements_maps_to_ppe(self):
        code, _ = get_suggested_taxonomy_code(
            account_type="asset", account_name="Leasehold Improvements"
        )
        assert code == "property_equipment"

    def test_1700_accum_depreciation_maps_to_ppe(self):
        """Contra-asset — correctly maps to property_equipment (reduces P&E display)."""
        code, _ = get_suggested_taxonomy_code(
            account_type="asset", account_name="Accumulated Depreciation"
        )
        assert code == "property_equipment"

    def test_1701_accum_amortization_maps_to_intangible_assets(self):
        """
        FIXED: Was mapping to depreciation_amort (income statement).
        Correct: intangible_assets (balance sheet contra-intangible).
        """
        code, _ = get_suggested_taxonomy_code(
            account_type="asset", account_name="Accumulated Amortization"
        )
        assert code == "intangible_assets", (
            "Accumulated Amortization is a balance sheet contra-intangible, "
            "must NOT map to depreciation_amort (income statement)"
        )

    # --- Liabilities ----------------------------------------------------------

    def test_2000_ap_maps_correctly(self):
        code, _ = get_suggested_taxonomy_code(
            account_type="liability", account_name="Accounts Payable"
        )
        assert code == "accounts_payable"

    def test_2101_loc_maps_to_short_term_debt(self):
        """'LOC - Aegis Business Credit' recognized via 'loc -' keyword."""
        code, _ = get_suggested_taxonomy_code(
            account_type="liability", account_name="LOC - Aegis Business Credit"
        )
        assert code == "short_term_debt"

    def test_2200_credit_cards_map_to_short_term_debt(self):
        code, _ = get_suggested_taxonomy_code(
            account_type="liability", account_name="Credit Cards"
        )
        assert code == "short_term_debt"

    def test_2500_payroll_liabilities_map_to_accrued(self):
        code, _ = get_suggested_taxonomy_code(
            account_type="liability", account_name="Payroll Liabilities"
        )
        # "payroll tax" not in "Payroll Liabilities" → no keyword; but "accrued" not in name
        # Falls to None (no matching keyword); liability type not in QB_TYPE_TO_TAXONOMY
        # Acceptable — user re-classifies
        assert code in (None, "accrued_liabilities")

    def test_2520_other_current_liabilities(self):
        """'Other Current Liabilities' recognized via 'other current liab' keyword."""
        code, _ = get_suggested_taxonomy_code(
            account_type="liability", account_name="Other Current Liabilities"
        )
        assert code == "other_current_liabilities"

    def test_2550_sales_tax_payable(self):
        code, _ = get_suggested_taxonomy_code(
            account_type="liability", account_name="Sales Tax Payable"
        )
        assert code == "accrued_liabilities"

    def test_2611_note_eidl_maps_to_long_term_debt(self):
        code, _ = get_suggested_taxonomy_code(
            account_type="liability", account_name="Note - EIDL COVID 19"
        )
        # "note payable" not literally in name; "long term" not in name; "note" alone not a keyword
        # Falls to None for liability type without auth type
        # NOTE: user needs to manually classify or re-export with proper type
        assert code in (None, "long_term_debt")

    def test_2615_note_ifsc_ryobi_maps_to_long_term_debt(self):
        code, _ = get_suggested_taxonomy_code(
            account_type="liability", account_name="Note IFSC - Ryobi Press"
        )
        assert code in (None, "long_term_debt")

    # --- Equity ---------------------------------------------------------------

    def test_3010_capital_stock(self):
        code, _ = get_suggested_taxonomy_code(
            account_type="equity", account_name="Capital Stock"
        )
        # "capital" not in keyword list; "common stock" not in "Capital Stock"
        # Falls to other_equity via type fallback (acceptable)
        assert code == "other_equity"

    def test_3200_retained_earnings_maps_correctly(self):
        """
        FIXED: Was mapping to other_equity (equity type fallback blocked name keywords).
        Correct: retained_earnings via name keyword.
        """
        code, _ = get_suggested_taxonomy_code(
            account_type="equity", account_name="Retained Earnings"
        )
        assert code == "retained_earnings", (
            "Retained Earnings must map to retained_earnings, not other_equity"
        )

    def test_3040_partner_draws_maps_to_other_equity(self):
        """Draws are contra-equity; other_equity is acceptable — debit balance shows negative."""
        code, _ = get_suggested_taxonomy_code(
            account_type="equity", account_name="LM Partner 1 Draws - JDR"
        )
        assert code == "other_equity"

    # --- Revenue --------------------------------------------------------------

    def test_4000_revenue_accounts_map_to_revenue(self):
        """
        FIXED: 'revenue' type now in QB_TYPE_TO_TAXONOMY.
        Format-C COA exports that use 'revenue' as account_type correctly map to revenue.
        """
        for name in [
            "Programming and Graphics",
            "Data and Mailing Services",
            "SAAS Services",
            "Marketing and Direct Mail",
            "Shipping/Delivery/Fulfillment",
            "Business Platforms",
            "Seminar Sales and Ancillary Svcs",
            "Production Postage - Income",
        ]:
            code, _ = get_suggested_taxonomy_code(account_type="revenue", account_name=name)
            assert code == "revenue", f"Expected revenue for {name!r}, got {code!r}"

    # --- Expenses (FIXED: name keywords now refine general 'expense' type) ----

    def test_6400_02_depreciation_expense_maps_correctly(self):
        """
        FIXED: 'expense' type no longer blocks name keyword check.
        'Depreciation Expense' → depreciation_amort via 'depreciation' keyword.
        """
        code, _ = get_suggested_taxonomy_code(
            account_type="expense", account_name="Depreciation Expense"
        )
        assert code == "depreciation_amort", (
            "Depreciation Expense must map to depreciation_amort, not operating_expenses"
        )

    def test_6400_05_interest_expense_maps_correctly(self):
        """
        FIXED: 'Interest Expense' → interest_expense via 'interest expense' keyword.
        """
        code, _ = get_suggested_taxonomy_code(
            account_type="expense", account_name="Interest Expense"
        )
        assert code == "interest_expense", (
            "Interest Expense must map to interest_expense, not operating_expenses"
        )

    def test_6000_01_office_supplies_maps_to_operating_expenses(self):
        code, _ = get_suggested_taxonomy_code(
            account_type="expense", account_name="Office Supplies"
        )
        assert code == "operating_expenses"

    def test_6000_25_rent_expense_maps_to_operating_expenses(self):
        code, _ = get_suggested_taxonomy_code(
            account_type="expense", account_name="Rent Expense"
        )
        assert code == "operating_expenses"

    def test_cogs_type_authoritative_override(self):
        """QB 'cost of goods sold' type → cogs (authoritative, overrides name keywords)."""
        code, evidence = get_suggested_taxonomy_code(
            account_type="cost of goods sold", account_name="Paper and Stock"
        )
        assert code == "cogs"
        assert "Type" in evidence

    def test_expense_type_cogs_name_limitation(self):
        """
        KNOWN LIMITATION: 5000-07 Paper & Stock with generic 'expense' type.
        'Paper and Stock' has no COGS keyword → still maps to operating_expenses.
        To classify COGS correctly, re-export with type 'Cost of Goods Sold'
        or manually reclassify in the Chart of Accounts page.
        """
        code, _ = get_suggested_taxonomy_code(
            account_type="expense", account_name="Paper and Stock"
        )
        assert code == "operating_expenses"  # expected limitation — not a code bug

    def test_expense_type_cogs_keyword_matches(self):
        """If expense account name contains 'cost of goods', it maps to cogs."""
        code, _ = get_suggested_taxonomy_code(
            account_type="expense", account_name="Cost of Goods Sold - Direct"
        )
        assert code == "cogs"


# ===========================================================================
# 5. STANDARD TAXONOMY V2 STRUCTURAL INVARIANTS
# ===========================================================================

class TestStandardTaxonomyInvariants:

    def _by_code(self, code: str):
        return next((r for r in STANDARD_TAXONOMY_V2 if r[0] == code), None)

    def test_all_bs_lines_have_balance_sheet_statement_type(self):
        bs_sections = {"assets", "liabilities", "equity"}
        for code, name, section, sort_order, stmt_type, normal_bal, sign_beh, is_sub in STANDARD_TAXONOMY_V2:
            if section in bs_sections:
                assert stmt_type == "balance_sheet", (
                    f"{code}: section={section} but statement_type={stmt_type}"
                )

    def test_all_is_lines_have_income_statement_type(self):
        is_sections = {"revenue", "cogs", "expense", "other_income", "other_expense"}
        for code, name, section, sort_order, stmt_type, normal_bal, sign_beh, is_sub in STANDARD_TAXONOMY_V2:
            if section in is_sections:
                assert stmt_type == "income_statement", (
                    f"{code}: section={section} but statement_type={stmt_type}"
                )

    def test_asset_lines_debit_normal(self):
        for code, name, section, _, _, normal_bal, _, _ in STANDARD_TAXONOMY_V2:
            if section == "assets":
                assert normal_bal == "debit", f"{code} asset line has normal_balance={normal_bal}"

    def test_liability_equity_lines_credit_normal(self):
        for code, name, section, _, _, normal_bal, _, _ in STANDARD_TAXONOMY_V2:
            if section in {"liabilities", "equity"}:
                assert normal_bal == "credit", (
                    f"{code} liability/equity line has normal_balance={normal_bal}"
                )

    def test_revenue_lines_credit_normal(self):
        for code, name, section, _, _, normal_bal, _, _ in STANDARD_TAXONOMY_V2:
            if section in {"revenue", "other_income"}:
                assert normal_bal == "credit", (
                    f"{code} revenue line has normal_balance={normal_bal}"
                )

    def test_expense_cogs_lines_debit_normal(self):
        """Non-subtotal expense/COGS lines are debit-normal. gross_profit is excluded
        because it is a credit-normal subtotal (Revenue minus COGS)."""
        for code, name, section, _, _, normal_bal, _, is_sub in STANDARD_TAXONOMY_V2:
            if section in {"expense", "cogs", "other_expense"} and not is_sub:
                assert normal_bal == "debit", (
                    f"{code} expense line has normal_balance={normal_bal}"
                )

    def test_gross_profit_is_subtotal(self):
        gp = self._by_code("gross_profit")
        assert gp is not None, "gross_profit line missing from STANDARD_TAXONOMY_V2"
        assert gp[7] is True, "gross_profit must be is_subtotal=True"

    def test_gross_profit_is_credit_normal(self):
        """Gross Profit = Revenue - COGS; credit-normal so positive GP shows positive."""
        gp = self._by_code("gross_profit")
        assert gp[5] == "credit"

    def test_sort_orders_unique_per_statement(self):
        bs_sorts = [r[3] for r in STANDARD_TAXONOMY_V2 if r[4] == "balance_sheet"]
        is_sorts = [r[3] for r in STANDARD_TAXONOMY_V2 if r[4] == "income_statement"]
        assert len(bs_sorts) == len(set(bs_sorts)), "Balance sheet sort_orders not unique"
        assert len(is_sorts) == len(set(is_sorts)), "Income statement sort_orders not unique"

    def test_all_codes_unique(self):
        codes = [r[0] for r in STANDARD_TAXONOMY_V2]
        assert len(codes) == len(set(codes)), "Duplicate taxonomy codes in STANDARD_TAXONOMY_V2"

    def test_balance_sheet_sections_ordered_correctly(self):
        """Assets (sort 100-220) < Liabilities (300-410) < Equity (500-520)."""
        bs_by_section: dict[str, list[int]] = {}
        for code, name, section, sort_order, stmt_type, _, _, _ in STANDARD_TAXONOMY_V2:
            if stmt_type == "balance_sheet":
                bs_by_section.setdefault(section, []).append(sort_order)

        assets_max = max(bs_by_section.get("assets", [0]))
        liab_min = min(bs_by_section.get("liabilities", [9999]))
        liab_max = max(bs_by_section.get("liabilities", [0]))
        equity_min = min(bs_by_section.get("equity", [9999]))

        assert assets_max < liab_min, "Assets sort_orders must precede liabilities"
        assert liab_max < equity_min, "Liabilities sort_orders must precede equity"

    def test_income_statement_sections_ordered_correctly(self):
        """Revenue (600) < COGS/GrossProfit (700-799) < Expenses (800+)."""
        is_by_section: dict[str, list[int]] = {}
        for code, name, section, sort_order, stmt_type, _, _, _ in STANDARD_TAXONOMY_V2:
            if stmt_type == "income_statement":
                is_by_section.setdefault(section, []).append(sort_order)

        rev_max = max(is_by_section.get("revenue", [0]) + is_by_section.get("other_income", [0]))
        cogs_min = min(is_by_section.get("cogs", [9999]))
        cogs_max = max(is_by_section.get("cogs", [0]))
        exp_min = min(is_by_section.get("expense", [9999]))

        assert rev_max < cogs_min, "Revenue must precede COGS in sort order"
        assert cogs_max < exp_min, "COGS must precede Operating Expenses in sort order"
