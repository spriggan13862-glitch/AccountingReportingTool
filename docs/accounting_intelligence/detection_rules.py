"""
Structured Detection Rules — Sprint 3.14

Maps every issue template code to a machine-parseable DetectionRule dict.
Each entry is validated by app.schemas.detection_rule.DetectionRule at
seed time (see issue_template_service.seed_issue_templates).

Frozen alongside the repository content; add new codes here when new
templates are introduced.

Rule-type reference
-------------------
threshold   metric op value
pct_change  metric pct_change_op value%   (vs prior period)
spread      pct_change(metric) − pct_change(comparison_metric) op value pp
ratio       metric / comparison_metric op value
existence   qualitative flag (metric = condition key, no value required)
compound    AND/OR list of DetectionCondition dicts
"""

_T = "threshold"
_P = "pct_change"
_SP = "spread"
_R = "ratio"
_E = "existence"
_C = "compound"
V = "1.0"


def _t(metric, op, value, unit, comparison_metric=None, notes=None):
    d = {"version": V, "rule_type": _T, "metric": metric,
         "operator": op, "value": value, "unit": unit}
    if comparison_metric:
        d["comparison_metric"] = comparison_metric
    if notes:
        d["notes"] = notes
    return d


def _p(metric, op, value, notes=None):
    d = {"version": V, "rule_type": _P, "metric": metric,
         "operator": op, "value": value, "unit": "percent"}
    if notes:
        d["notes"] = notes
    return d


def _sp(metric, comparison_metric, op, value, notes=None):
    d = {"version": V, "rule_type": _SP,
         "metric": metric, "comparison_metric": comparison_metric,
         "operator": op, "value": value, "unit": "pp"}
    if notes:
        d["notes"] = notes
    return d


def _r(metric, comparison_metric, op, value, notes=None):
    d = {"version": V, "rule_type": _R,
         "metric": metric, "comparison_metric": comparison_metric,
         "operator": op, "value": value, "unit": "ratio"}
    if notes:
        d["notes"] = notes
    return d


def _e(condition_key, notes=None):
    d = {"version": V, "rule_type": _E,
         "metric": condition_key, "operator": "exists", "unit": "flag"}
    if notes:
        d["notes"] = notes
    return d


def _c(conditions, logic="AND", notes=None):
    d = {"version": V, "rule_type": _C, "logic": logic, "conditions": conditions}
    if notes:
        d["notes"] = notes
    return d


def _cond(metric, op, value, unit, comparison_metric=None, description=None):
    d = {"metric": metric, "operator": op, "value": value, "unit": unit}
    if comparison_metric:
        d["comparison_metric"] = comparison_metric
    if description:
        d["description"] = description
    return d


# ── Revenue Recognition ───────────────────────────────────────────────────────

DETECTION_RULES: dict[str, dict] = {

    "REV_001": _c([
        _cond("revenue", "spread_gt", 10.0, "pp", "accounts_receivable",
              "Revenue grew 10+ pp faster than AR — possible premature recognition"),
        _cond("deferred_revenue", "pct_change_lt", -5.0, "percent",
              description="Deferred revenue declining unexpectedly"),
    ], notes="ASC 606 cutoff: revenue without corresponding AR or deferred buildup"),

    "REV_002": _c([
        _cond("cash", "pct_change_gt", 0.0, "percent",
              description="Cash receipts positive"),
        _cond("deferred_revenue", "pct_change_lt", 0.0, "percent",
              description="Deferred revenue flat or declining despite subscription growth"),
    ], notes="Subscription revenue: cash collected without deferred recognition"),

    "REV_003": _e("returns_and_allowances_declining_vs_complaints",
                  notes="Returns rate declining while quality issues rising — reserve understated"),

    "REV_004": _t("gross_margin_pct", "lt", 25.0, "percent",
                  notes="Gross margin < 25% may indicate pass-through cost presentation (ASC 606-10-55-39)"),

    "REV_005": _t("customer_concentration_pct", "gte", 20.0, "percent",
                  notes="Single customer >= 20% of revenue; concentration and recognition risk"),

    "REV_006": _e("unusual_revenue_account_codes",
                  notes="Revenue coded to non-revenue accounts (settlements, grants, other income)"),

    "REV_007": _e("contract_amendments_without_accounting_review",
                  notes="ASC 606-10-25-12: contract modifications require reassessment"),

    "REV_008": _e("variable_consideration_recognized_at_maximum",
                  notes="ASC 606-10-32-11: variable consideration must be constrained"),

    "REV_009": _t("period_end_revenue_concentration_pct", "gt", 30.0, "percent",
                  notes="Last 5 business days > 30% of period revenue — cutoff risk"),

    "REV_010": _e("related_party_revenue_transactions",
                  notes="Revenue from related parties; arms-length and recognition scrutiny"),

    "REV_011": _p("revenue", "pct_change_gt", 15.0,
                  notes="Revenue deviation > 15% vs prior same period without explanation"),

    "REV_012": _e("unbilled_services_at_period_end",
                  notes="Services completed at period end with no unbilled receivable recorded"),

    # ── Accounts Receivable ───────────────────────────────────────────────────

    "AR_001": _c([
        _cond("allowance_rate_pct", "lt", 3.0, "percent",
              description="Allowance as % of gross AR below 3%"),
        _cond("ar_aging_over_90d_pct", "gt", 10.0, "percent",
              description="Over-90-day AR exceeds 10% of total"),
    ], notes="Allowance declining while aging deteriorates — reserve inadequacy"),

    "AR_002": _t("dso", "gt", 45.0, "days",
                 notes="DSO = AR / (Revenue / period_days); > 45 days signals collection issues"),

    "AR_003": _sp("accounts_receivable", "revenue", "spread_gt", 15.0,
                  notes="AR growing 15+ pp faster than revenue — fictitious or channel-stuffed AR"),

    "AR_004": _t("ar_aging_over_180d_pct", "gt", 15.0, "percent",
                 notes="Over-180-day AR > 15% without corresponding AFDA — impairment signal"),

    "AR_005": _e("long_term_ar_classified_current",
                 notes="Installment receivables > 12 months fully in current assets (ASC 310)"),

    "AR_006": _t("customer_ar_concentration_pct", "gte", 25.0, "percent",
                 notes="Single customer >= 25% of gross AR — concentration and collectibility risk"),

    "AR_007": _e("payment_application_discrepancies",
                 notes="Misapplied payments, credits to wrong accounts, timing inconsistencies"),

    "AR_008": _t("credit_memo_pct_of_revenue", "gt", 5.0, "percent",
                 notes="Credit memo volume > 5% of revenue — unrecorded returns, channel stuffing reversal"),

    "AR_009": _e("ar_factoring_not_derecognized",
                 notes="Factoring proceeds recorded as debt not AR derecognition (ASC 860)"),

    "AR_010": _e("related_party_ar_in_trade",
                 notes="AR from officers, shareholders, or related entities in trade AR balance"),

    # ── Inventory ─────────────────────────────────────────────────────────────

    "INV_001": _sp("inventory", "cogs", "spread_gt", 15.0,
                   notes="Inventory growing 15+ pp faster than COGS — buildup, obsolescence, or capitalization"),

    "INV_002": _p("gross_margin_pct", "pct_change_gt", 3.0,
                  notes="Gross margin changed > 3 pp without price/volume explanation — cost layer anomaly"),

    "INV_003": _e("physical_count_not_documented",
                  notes="No documented physical count; perpetual records unreconciled (ASC 330)"),

    "INV_004": _e("inventory_prices_below_cost",
                  notes="Recent sales prices below inventory cost — LCM write-down required (ASC 330-10-35-1)"),

    "INV_005": _e("ap_inventory_receipt_cutoff_gap",
                  notes="AP and inventory movement not synchronized at period end — cutoff error"),

    "INV_006": _t("overhead_variance_pct", "gt", 5.0, "percent",
                  notes="Overhead variance > 5% of COGS — absorption methodology issue"),

    "INV_007": _e("consignment_inventory_included_in_count",
                  notes="Consignment items owned by third parties counted as entity inventory"),

    "INV_008": _t("inventory_adjustment_pct", "gt", 2.0, "percent",
                  notes="Inventory adjustment entries > 2% of gross inventory — shrinkage or write-down"),

    "INV_009": _sp("wip_inventory", "revenue", "spread_gt", 15.0,
                   notes="WIP growing 15+ pp faster than revenue — over-capitalization or billing lag"),

    "INV_010": _sp("inventory", "revenue", "spread_gt", 15.0,
                   notes="Total inventory growing 15+ pp faster than revenue — DIO increasing"),

    # ── Cash Management ───────────────────────────────────────────────────────

    "CASH_001": _e("stale_reconciling_items",
                   notes="Bank reconciling items outstanding > 30 days — unrecorded transactions"),

    "CASH_002": _e("restricted_cash_misclassified",
                   notes="Escrow, bond reserves, or collateral in unrestricted cash (ASC 230-10-45-4)"),

    "CASH_003": _e("petty_cash_anomalies",
                   notes="Petty cash replenishments with unusual frequency, amounts, or missing receipts"),

    "CASH_004": _t("cash", "lt", 0.0, "amount",
                   notes="Negative book cash balance — overdraft or unrecorded disbursements"),

    "CASH_005": _e("interbank_transfers_outstanding",
                   notes="Deposits in transit from internal transfers; transfers outstanding > 3 days"),

    "CASH_006": _t("cash_single_institution_amount", "gt", 250000.0, "amount",
                   notes="Cash at single institution > $250k FDIC limit without documented mitigation"),

    "CASH_007": _e("personal_payees_in_disbursements",
                   notes="Personal-sounding payees in disbursements — possible personal use of company funds"),

    "CASH_008": _r("operating_cash_flow", "net_income", "ratio_lt", 0.7,
                   notes="OCF/Net Income < 0.7 — earnings quality concern; large non-cash accruals"),

    # ── Accounts Payable ──────────────────────────────────────────────────────

    "AP_001": _e("ap_cutoff_items",
                 notes="Large vendor invoices in first 30 days of next period for prior period services"),

    "AP_002": _e("duplicate_payments",
                 notes="Same invoice number or amount paid twice to same vendor within 30 days"),

    "AP_003": _e("ghost_vendor_indicators",
                 notes="Vendors with PO box only, no web presence, new vendor paid immediately"),

    "AP_004": _e("goods_received_not_invoiced_gap",
                 notes="Receiving reports dated before period end with no corresponding AP entry"),

    "AP_005": _e("related_party_payables",
                 notes="Payables to vendors who are also related parties, shareholders, or officers"),

    "AP_006": _t("dpo", "gt", 60.0, "days",
                 notes="DPO = AP / (COGS / period_days); > 60 days signals vendor payment stress"),

    "AP_007": _e("ap_debit_balances",
                 notes="Individual vendor accounts with debit balances — overpayments or unrecorded credits"),

    "AP_008": _e("loss_contracts_uncommitted",
                 notes="Non-cancelable purchase orders at prices above current market — onerous contract"),

    # ── Accrued Liabilities ───────────────────────────────────────────────────

    "ACL_001": _e("accrued_liabilities_declining_vs_revenue",
                  notes="Total accruals declining as % of revenue without operational explanation"),

    "ACL_002": _e("warranty_reserve_growth_lag",
                  notes="Product revenue growing without proportional warranty reserve (ASC 460)"),

    "ACL_003": _e("payroll_accrual_insufficient",
                  notes="Payroll expense low at period end; large true-up in subsequent period"),

    "ACL_004": _e("legal_contingency_without_accrual",
                  notes="Attorney letters reference pending litigation without corresponding accrual (ASC 450)"),

    "ACL_005": _e("restructuring_liability_unused",
                  notes="Large restructuring accrual near period end; liability not utilized subsequently"),

    "ACL_006": _c([
        _cond("effective_tax_rate", "lt", 10.0, "percent",
              description="ETR below 10%"),
        _cond("effective_tax_rate", "gt", 45.0, "percent",
              description="ETR above 45%"),
    ], logic="OR", notes="ETR outside 10–45% range without disclosed reconciling items"),

    "ACL_007": _e("advance_payments_prematurely_recognized",
                  notes="Cash received from customers recognized as revenue before performance obligation"),

    "ACL_008": _e("ibnr_reserve_inadequate",
                  notes="Self-insurance IBNR reserve below actual claim run rate (IBNR = incurred but not reported)"),

    # ── Fixed Assets ──────────────────────────────────────────────────────────

    "FA_001": _e("items_capitalized_below_threshold",
                 notes="Repair and maintenance items capitalized below stated policy threshold"),

    "FA_002": _p("depreciation_pct_of_gross_assets", "pct_change_gt", 10.0,
                 notes="Depreciation rate changed > 10% vs prior — useful life change not disclosed"),

    "FA_003": _e("impairment_indicators_without_analysis",
                 notes="Operational changes, facility closures, or market declines without impairment test (ASC 360)"),

    "FA_004": _e("fully_depreciated_assets_in_active_use",
                 notes="Assets with net book value zero still generating revenue — understated base"),

    "FA_005": _e("held_for_sale_not_reclassified",
                 notes="Approved disposal plan exists; assets marketed but not reclassified (ASC 360-10-45)"),

    "FA_006": _r("capex", "depreciation", "ratio_lt", 0.5,
                 notes="CapEx/Depreciation < 0.5 — underinvestment; asset base aging"),

    "FA_007": _e("software_costs_inconsistent_stage_analysis",
                 notes="Internal-use software: all costs expensed or capitalized without stage analysis (ASC 350-40)"),

    "FA_008": _e("aro_obligation_not_recorded",
                 notes="Lease or regulatory obligation requires restoration; no ARO recorded (ASC 410)"),

    # ── Intangible Assets ─────────────────────────────────────────────────────

    "IA_001": _p("revenue", "pct_change_lt", -15.0,
                 notes="Revenue decline > 15% — goodwill impairment indicator; Step 1 test required (ASC 350)"),

    "IA_002": _p("intangible_amortization_pct", "pct_change_gt", 20.0,
                 notes="Amortization rate changed > 20% — useful life revision not disclosed"),

    "IA_003": _e("rd_costs_capitalized_pre_feasibility",
                 notes="Software development costs capitalized in preliminary project stage (ASC 350-40)"),

    "IA_004": _e("acquisition_goodwill_no_intangibles",
                 notes="Acquisition goodwill > 80% of purchase price with no identifiable intangibles (ASC 805)"),

    "IA_005": _e("indefinite_lived_intangible_no_impairment_test",
                 notes="Indefinite-lived intangible balance without annual impairment test documentation"),

    "IA_006": _e("noncompete_agreement_not_capitalized",
                 notes="Acquisition or key departure agreement includes non-compete not recorded as intangible"),

    # ── Leases ────────────────────────────────────────────────────────────────

    "LEASE_001": _e("lease_commitments_exceed_balance_sheet",
                    notes="Footnote lease commitments materially exceed recorded ROU asset/liability (ASC 842)"),

    "LEASE_002": _e("finance_lease_misclassified_operating",
                    notes="Specialized or full-life assets meeting finance lease criteria classified as operating"),

    "LEASE_003": _e("incremental_borrowing_rate_below_market",
                    notes="IBR used materially below entity credit quality and term benchmark"),

    "LEASE_004": _e("lease_renewal_options_not_considered",
                    notes="Reasonably certain renewal periods excluded from lease term (ASC 842-20-30-1)"),

    "LEASE_005": _e("sale_leaseback_gain_premature_recognition",
                    notes="Sale-leaseback gain recognized when leaseback covers substantially all useful life"),

    "LEASE_006": _e("lease_amendment_without_remeasurement",
                    notes="Lease modification in contract files without corresponding liability remeasurement"),

    # ── Debt Obligations ──────────────────────────────────────────────────────

    "DEBT_001": _t("debt_to_equity", "gt", 3.0, "ratio",
                   notes="D/E > 3.0x — approaching typical covenant threshold; waiver or refinancing risk"),

    "DEBT_002": _e("current_ltd_does_not_match_schedule",
                   notes="Current portion of long-term debt does not match next 12 months per amortization schedule"),

    "DEBT_003": _e("debt_issuance_costs_in_other_assets",
                   notes="Debt issuance costs in other assets rather than contra to related debt (ASC 835-30)"),

    "DEBT_004": _e("interest_expense_below_stated_rate",
                   notes="Effective interest rate materially below stated rate — PIK, amortization, or error"),

    "DEBT_005": _e("related_party_debt",
                   notes="Liabilities to owners or affiliates without disclosed terms; below-market rates"),

    "DEBT_006": _e("ppp_balance_eliminated_without_forgiveness",
                   notes="PPP loan balance removed without formal forgiveness application approval"),

    "DEBT_007": _e("convertible_notes_no_equity_bifurcation",
                   notes="Convertible instruments outstanding without equity component bifurcation (ASC 470-20)"),

    "DEBT_008": _c([
        _cond("total_debt", "pct_change_gt", 0.0, "percent",
              description="Total debt outstanding"),
        _cond("current_ratio", "lt", 1.2, "ratio",
              description="Current ratio near 1.0 — liquidity tight"),
    ], notes="Maturing debt within 12 months without liquidity to cover"),

    # ── Equity ────────────────────────────────────────────────────────────────

    "EQ_001": _e("retained_earnings_reconciliation_gap",
                 notes="Beginning RE + Net Income − Dividends ≠ Ending RE — unexplained equity change"),

    "EQ_002": _e("owner_distributions_undocumented",
                 notes="Cash outflows to owners without distribution documentation; excessive officer comp"),

    "EQ_003": _e("stock_awards_outstanding_no_expense",
                 notes="Equity awards outstanding without corresponding SBC expense (ASC 718)"),

    "EQ_004": _e("oci_items_flowing_through_income",
                 notes="Unrealized gains/losses or FX translation through P&L instead of OCI (ASC 220)"),

    "EQ_005": _e("mezzanine_equity_in_stockholders_equity",
                 notes="Preferred stock with put options or mandatory redemption inside permanent equity (ASC 480)"),

    "EQ_006": _e("treasury_stock_gains_in_income",
                 notes="Gain or loss on treasury stock transactions in income statement (ASC 505-30)"),

    "EQ_007": _e("equity_method_not_applied",
                 notes="Investment at 20%+ ownership without equity method accounting (ASC 323)"),

    "EQ_008": _c([
        _cond("net_income", "lt", 0.0, "amount",
              description="Net loss current period"),
        _cond("current_ratio", "lt", 1.0, "ratio",
              description="Current ratio below 1.0"),
        _cond("total_debt", "ratio_gt", 1.0, "ratio", "total_equity",
              description="Debt exceeds equity"),
    ], notes="Going concern compound: recurring losses + liquidity deficit + leverage"),

    # ── Income Tax ────────────────────────────────────────────────────────────

    "TAX_001": _e("dta_valuation_allowance_not_assessed",
                  notes="Large DTA with loss history and no near-term taxable income — valuation allowance (ASC 740-10-30)"),

    "TAX_002": _c([
        _cond("effective_tax_rate", "lt", 10.0, "percent",
              description="ETR below 10% — aggressively low"),
        _cond("effective_tax_rate", "gt", 40.0, "percent",
              description="ETR above 40% — unusually high"),
    ], logic="OR", notes="ETR deviates significantly from 21% federal + state blended without disclosure"),

    "TAX_003": _e("uncertain_tax_position_reserve_absent",
                  notes="Aggressive tax positions, intercompany pricing, or open exam years without UTP reserve (ASC 740-10-25)"),

    "TAX_004": _e("tax_nexus_without_filing",
                  notes="Remote employees or significant sales in states without corresponding tax filings"),

    "TAX_005": _e("tax_distributions_not_accrued",
                  notes="Pass-through entity with taxable income but no accrued tax distributions to partners/members"),

    "TAX_006": _e("payroll_tax_deposits_insufficient",
                  notes="Payroll tax deposits not matching payroll register; IRS/state delinquency notices"),

    # ── Payroll ───────────────────────────────────────────────────────────────

    "PAY_001": _e("ghost_employee_indicators",
                  notes="Employees with no performance reviews, PTO, or benefits; shared addresses or bank accounts"),

    "PAY_002": _e("contractor_employee_misclassification",
                  notes="1099 workers with employee characteristics — exclusive service, company direction (IRS 20-factor)"),

    "PAY_003": _e("flsa_exempt_classification_error",
                  notes="Exempt employees below FLSA salary threshold or duties test not met"),

    "PAY_004": _t("bonus_pct_of_revenue", "gt", 10.0, "percent",
                  notes="Bonus expense > 10% of revenue — concentration in acquisition period or owner distributions"),

    "PAY_005": _e("benefits_accrual_gap",
                  notes="Benefits expense as % of payroll declining; 401(k) match or premiums not accrued"),

    "PAY_006": _e("time_entry_manipulation_indicators",
                  notes="High manual time entries; overtime concentration; entries edited frequently"),

    "PAY_007": _e("garnishment_without_withholding",
                  notes="Active garnishment orders on file without matching payroll withholding"),

    "PAY_008": _sp("capitalized_labor", "revenue", "spread_gt", 15.0,
                   notes="Capitalized labor growing 15+ pp faster than revenue — cost avoidance via capitalization"),

    # ── Working Capital ───────────────────────────────────────────────────────

    "WC_001": _t("current_ratio", "lt", 1.0, "ratio",
                 notes="Current Assets / Current Liabilities < 1.0 — technical liquidity default"),

    "WC_002": _e("prepaid_assets_without_amortization",
                 notes="Prepaid balance growing without documented amortization schedule"),

    "WC_003": _e("window_dressing_indicators",
                 notes="DSO unusually low AND DPO unusually high at period end — balance sheet timing management"),

    "WC_004": _p("contract_assets_pct_of_revenue", "pct_change_gt", 10.0,
                 notes="Contract assets growing > 10 pp of revenue — possible overbilling or aggressive recognition"),

    "WC_005": _e("current_portion_ltd_not_reclassified",
                 notes="Debt amortization in next 12 months not reflected in current liabilities"),

    "WC_006": _e("ar_ap_improperly_netted",
                 notes="Same counterparty AR and AP presented net without right of offset (ASC 210-20)"),

    "WC_007": _t("ccc", "gt", 90.0, "days",
                 notes="Cash Conversion Cycle = DSO + DIO − DPO > 90 days — liquidity efficiency concern"),

    "WC_008": _e("credit_line_low_at_period_end",
                 notes="Line of credit near zero at fiscal year end with high peak balances — window dressing"),

    # ── Gross Margin ──────────────────────────────────────────────────────────

    "GM_001": _e("gross_margin_improvement_without_explanation",
                 notes="GM improving while operations stable — COGS understated or rebates not in COGS"),

    "GM_002": _e("product_mix_shift_not_disclosed",
                 notes="Total GM changing with stable volume; segment mix shift not disclosed"),

    "GM_003": _e("vendor_rebates_not_in_cogs",
                 notes="Vendor rebates credited to other income rather than reducing COGS (ASC 705-20)"),

    "GM_004": _t("overhead_variance_pct", "gt", 5.0, "percent",
                 notes="Overhead variance > 5% at period end — absorption methodology or estimation error"),

    "GM_005": _e("intercompany_profit_not_eliminated",
                 notes="Intercompany elimination schedule missing inventory profit component"),

    "GM_006": _e("inventory_writedowns_not_in_cogs",
                 notes="Inventory write-downs or shrinkage recorded in other expense rather than COGS"),

    "GM_007": _sp("cogs", "revenue", "spread_gt", 3.0,
                  notes="COGS growing 3+ pp faster than revenue — gross margin compression signal"),

    "GM_008": _p("gross_margin_pct", "pct_change_gt", 5.0,
                 notes="Gross margin changed > 5 pp without product mix or pricing explanation"),

    # ── Operating Expenses ────────────────────────────────────────────────────

    "OPEX_001": _e("expense_reclassification_journal_entries",
                   notes="Significant expense reclassification JEs between periods — possible categorization manipulation"),

    "OPEX_002": _p("general_administrative_expense", "pct_change_gt", 20.0,
                   notes="G&A expense grew > 20% — unusual items or overhead buildup"),

    "OPEX_003": _t("travel_entertainment_pct_of_revenue", "gt", 5.0, "percent",
                   notes="T&E > 5% of revenue or growing above revenue rate — policy adherence"),

    "OPEX_004": _e("related_party_operating_expenses",
                   notes="Rent, consulting, or management fees paid to entities with ownership overlap"),

    "OPEX_005": _e("affiliate_allocations_without_documentation",
                   notes="Expenses allocated from affiliates without documented cost-sharing agreement"),

    "OPEX_006": _e("commission_expense_not_deferred_asc340",
                   notes="Contract acquisition costs expensed immediately rather than deferred (ASC 340-40)"),

    "OPEX_007": _e("advertising_costs_improperly_capitalized",
                   notes="Advertising costs capitalized that do not qualify as direct-response (ASC 720-35)"),

    "OPEX_008": _sp("total_expenses", "revenue", "spread_gt", 5.0,
                    notes="OPEX growing 5+ pp faster than revenue — operating leverage deteriorating"),

    # ── EBITDA Quality ────────────────────────────────────────────────────────

    "EBITDA_001": _t("addbacks_pct_of_ebitda", "gt", 20.0, "percent",
                     notes="Add-backs > 20% of reported EBITDA; multi-period add-backs indicate recurring nature"),

    "EBITDA_002": _e("projected_revenue_above_historical_cagr",
                     notes="Forward EBITDA assumes revenue growth above historical CAGR without contracted backlog"),

    "EBITDA_003": _e("proforma_adjustments_undocumented",
                     notes="Pro forma synergy add-backs without supporting implementation plan or documentation"),

    "EBITDA_004": _e("recurring_charges_below_ebitda",
                     notes="Charges appearing below EBITDA line in multiple prior periods — effectively recurring"),

    "EBITDA_005": _r("operating_cash_flow", "ebitda", "ratio_lt", 0.7,
                     notes="OCF/EBITDA < 0.7 — maintenance CapEx not shown; EBITDA overstates cash generation"),

    "EBITDA_006": _e("acquired_deferred_revenue_no_haircut",
                     notes="Acquired entity deferred revenue eliminated in purchase accounting without disclosure"),

    "EBITDA_007": _e("recurring_revenue_without_churn_disclosure",
                     notes="Recurring revenue business without disclosed churn/retention metrics"),

    "EBITDA_008": _p("ebitda", "pct_change_gt", 10.0,
                     notes="EBITDA changed > 10% without documented bridge analysis"),

    # ── Quality of Earnings ───────────────────────────────────────────────────

    "QOE_001": _t("accrual_ratio", "gt", 0.08, "ratio",
                  notes="Sloan Accrual Ratio = (NI − CFO − CFI) / TA > 8% — earnings quality alert"),

    "QOE_002": _e("period_end_accrual_entries",
                  notes="Large accrual entries on last day of period consistently near key thresholds"),

    "QOE_003": _sp("accounts_receivable", "revenue", "spread_gt", 20.0,
                   notes="AR growing 20+ pp faster than revenue — channel stuffing proxy"),

    "QOE_004": _e("reserve_releases_offsetting_bad_news",
                  notes="Reserve balance declines consistently coincide with periods of adverse operational results"),

    "QOE_005": _t("recurring_revenue_pct", "gt", 80.0, "percent",
                  notes="Recurring revenue > 80% without documented contractual basis for classification"),

    "QOE_006": _e("working_capital_target_single_period",
                  notes="NWC target in purchase agreement based on single period, not trailing 12-month average"),

    "QOE_007": _e("revenue_recognition_more_aggressive_than_peers",
                  notes="ASC 606 policy elections systematically favor earlier recognition vs industry practice"),

    "QOE_008": _sp("deferred_costs", "revenue", "spread_gt", 10.0,
                   notes="Deferred costs growing 10+ pp faster than revenue — cost deferral inflating margins"),

    "QOE_009": _c([
        _cond("management_fee_pct_of_revenue", "lt", 1.0, "percent",
              description="Management fee below 1% benchmark"),
        _cond("management_fee_pct_of_revenue", "gt", 3.0, "percent",
              description="Management fee above 3% benchmark — reduces distributable earnings"),
    ], logic="OR", notes="Management fee to related party outside 1–3% of revenue market range"),

    "QOE_010": _e("acquisitions_without_proforma",
                  notes="Acquisitions in trailing 24 months without organic vs. acquired growth disclosure"),

    # ── SBA Compliance ────────────────────────────────────────────────────────

    "SBA_001": _t("dscr", "lt", 1.25, "ratio",
                  notes="DSCR = (NOI + D&A + Interest + Owner Add-backs) / Annual Debt Service < 1.25x SBA minimum"),

    "SBA_002": _e("equity_injection_without_source_docs",
                  notes="Equity injection shown in financials without source of funds documentation"),

    "SBA_003": _e("size_standard_affiliation_borderline",
                  notes="Revenue approaching SBA size standard; multiple entities under common control"),

    "SBA_004": _e("loan_proceeds_passive_investment",
                  notes="SBA loan proceeds designated for passive investment rather than active business use"),

    "SBA_005": _e("management_experience_insufficient",
                  notes="Buyer or management lacks documented industry experience for SBA guaranty"),

    "SBA_006": _t("financial_tax_income_variance_pct", "gt", 10.0, "percent",
                  notes="Financial statement income > tax return income by 10%+ without explanation"),

    "SBA_007": _e("collateral_appraisal_non_independent",
                  notes="Collateral values materially above assessed tax value; non-independent appraiser"),

    "SBA_008": _e("prior_federal_debt_not_disclosed",
                  notes="SBA application does not address prior federal debt or derogatory public records"),

    # ── Related Party ─────────────────────────────────────────────────────────

    "RP_001": _e("related_party_payments_not_disclosed",
                 notes="Payments to/from entities with ownership overlap not separately disclosed (ASC 850)"),

    "RP_002": _e("related_party_pricing_not_arms_length",
                 notes="Related party rents, goods, or services not at arms-length market rates"),

    "RP_003": _e("related_party_guarantees_not_disclosed",
                 notes="Personal guarantees or related party guarantees without corresponding financial disclosure"),

    "RP_004": _e("circular_related_party_cash_flows",
                 notes="Cash paid to related party approximately equals cash received from same party same period"),

    "RP_005": _e("officer_receivables_in_trade_ar",
                 notes="Receivables from officers, directors, or shareholders commingled in trade AR"),

    "RP_006": _e("key_person_dependency_risk",
                 notes="Single owner-operator with no management depth; customer or technical concentration in one person"),

    # ── Cash Flow Statement ───────────────────────────────────────────────────

    "CF_001": _e("operating_activities_misclassified",
                 notes="Finance lease payments, debt issuance costs, or asset sale proceeds in operating cash flows"),

    "CF_002": _e("balance_sheet_changes_not_in_cash_flow",
                 notes="New BS assets/liabilities without corresponding cash flow; non-cash transactions undisclosed"),

    "CF_003": _c([
        _cond("net_income", "gt", 0.0, "amount",
              description="Net income is positive"),
        _cond("free_cash_flow", "lt", 0.0, "amount",
              description="Free cash flow is negative — earnings not converting to cash"),
    ], notes="Positive net income with negative free cash flow — earnings quality signal (ASC 230)"),

    "CF_004": _e("working_capital_changes_in_cf_mismatch",
                 notes="Sum of BS beginning/ending changes does not agree to CF working capital section"),

    "CF_005": _e("capex_understated_investing_activities",
                 notes="Fixed asset additions on BS exceed CapEx in investing activities — capitalized items missing"),

    "CF_006": _e("fx_effect_on_cash_not_presented",
                 notes="Foreign currency accounts present without separate FX effect line on cash flow (ASC 830)"),

    "CF_007": _e("owner_distributions_not_in_financing",
                 notes="Retained earnings implies distributions not reflected in financing activities"),

    "CF_008": _e("cash_equivalents_misclassified",
                 notes="Money market funds with restrictions or short-term investments > 90 days in cash (ASC 230-10-45)"),

    # ── Financial Reporting ───────────────────────────────────────────────────

    "FR_001": _e("hybrid_accounting_basis",
                 notes="Cash basis for some periods, accrual for others without disclosure — GAAP departure"),

    "FR_002": _e("single_year_no_comparative_period",
                 notes="Single-year financials without prior period; restatement without disclosure"),

    "FR_003": _e("no_internal_controls",
                 notes="No segregation of duties, formal close process, reconciliation controls, or management review"),

    "FR_004": _e("subsequent_events_not_evaluated",
                 notes="Known post-period events (acquisitions, litigation, bankruptcies) not evaluated (ASC 855)"),

    "FR_005": _e("segment_reporting_absent",
                 notes="Multiple distinct business lines or geographies without segment-level reporting (ASC 280)"),

    "FR_006": _e("engagement_level_understated",
                 notes="Compilation-level financials used for SBA loan or acquisition requiring audit/review"),

    # ── Disclosures ───────────────────────────────────────────────────────────

    "DISC_001": _e("accounting_policies_note_absent",
                   notes="No accounting policy note; or policies described do not match actual methods"),

    "DISC_002": _e("debt_disclosure_incomplete",
                   notes="Debt note lacks maturity schedule, interest rates, or covenant information"),

    "DISC_003": _e("going_concern_not_disclosed",
                   notes="Going concern conditions present without corresponding disclosure (ASC 205-40)"),

    "DISC_004": _t("customer_concentration_pct", "gt", 10.0, "percent",
                   notes="Single customer > 10% of revenue without disclosure (ASC 280-10-50-42)"),

    "DISC_005": _e("commitments_and_obligations_incomplete",
                   notes="Known obligations (leases, contracts, litigation) absent from commitments footnote"),

    "DISC_006": _e("fair_value_hierarchy_not_presented",
                   notes="No fair value disclosure note; Level 3 instruments without sensitivity analysis (ASC 820)"),

    # ── Presentation ──────────────────────────────────────────────────────────

    "PRES_001": _e("income_statement_line_misclassification",
                   notes="Interest income in operating revenue; asset sale gains in COGS; FX gains in operating income"),

    "PRES_002": _e("balance_sheet_not_classified",
                   notes="Balance sheet does not separate current and long-term sections (ASC 210-10-45)"),

    "PRES_003": _e("equity_section_incomplete",
                   notes="Equity section combines retained earnings and APIC; NCI not separately presented"),

    "PRES_004": _e("eps_calculation_methodology_error",
                   notes="EPS uses period-end shares not weighted average; dilutive instruments excluded (ASC 260)"),

    # ── Fraud Indicators ──────────────────────────────────────────────────────

    "FRAUD_001": _e("journal_entries_outside_business_hours",
                    notes="Entries posted outside hours; unexpected preparers; round-number entries to revenue or equity"),

    "FRAUD_002": _c([
        _cond("revenue", "pct_change_gt", 10.0, "percent",
              description="Revenue growing — pressure exists"),
        _cond("gross_margin_pct", "lt", 30.0, "percent",
              description="Margin pressure compounds incentive"),
    ], notes="Fraud risk triangle proxy: revenue pressure + incentive compensation + weak controls"),

    "FRAUD_003": _e("expense_report_fraud_indicators",
                    notes="Round-number expense claims; duplicates; missing receipts; personal expenses"),

    "FRAUD_004": _e("asset_misappropriation_indicators",
                    notes="Fixed assets absent from physical; assets in personal use; vehicle/mileage fraud"),

    "FRAUD_005": _t("beneish_m_score", "gt", -1.78, "score",
                    notes="Beneish M-Score > -1.78 — statistical indicator of possible earnings manipulation"),

    "FRAUD_006": _e("check_fraud_indicators",
                    notes="Checks clearing with different payee/amount than ERP; voided checks clearing bank"),

    "FRAUD_007": _e("revenue_skimming_indicators",
                    notes="Cash sales below comparable periods; register receipts not reconciling to deposits"),

    "FRAUD_008": _e("related_party_asset_diversion",
                    notes="Payments to management-related entities; customers migrating to related parties"),

    # ── Industry Specific ─────────────────────────────────────────────────────

    "IND_001": _sp("contract_assets", "revenue", "spread_gt", 15.0,
                   notes="Construction: contract assets growing 15+ pp faster than revenue — overbilling/underbilling"),

    "IND_002": _t("net_collection_rate", "gt", 100.0, "percent",
                  notes="Healthcare: net collection rate > 100% — reversal of prior contractual adjustments"),

    "IND_003": _e("capitalized_costs_post_development_completion",
                  notes="SaaS: development costs capitalized after product launch date (ASC 350-40)"),

    "IND_004": _sp("commission_expense", "arr", "spread_gt", 10.0,
                   notes="SaaS: commission expense growing 10+ pp faster than ARR — CAC inflation signal"),

    "IND_005": _e("gift_card_breakage_not_recognized_proportionally",
                  notes="Retail: gift card breakage recognized in lump sum rather than proportionally (ASC 606-10-55-49)"),

    "IND_006": _t("wip_realization_rate", "lt", 0.90, "ratio",
                  notes="Professional services: WIP realization rate < 90% — write-down reserve insufficient"),
}

__all__ = ["DETECTION_RULES"]
