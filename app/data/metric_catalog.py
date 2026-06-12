"""
Metric Catalog — Sprint 3.13A

Defines all quantitative metrics and qualitative flags used by DetectionRule
JSON entries. The catalog is the authoritative source for metric names;
validate_metrics() checks caller-provided dicts against it.

Metric key conventions
----------------------
{metric}              current-period value (e.g. "revenue")
{metric}_pct_change   period-over-period % change (e.g. "revenue_pct_change")
{metric}_prior        prior-period value — rarely needed directly
{metric}_trend        string "declining" | "increasing" | "stable"
"""
from __future__ import annotations

METRIC_CATALOG: dict[str, dict] = {
    # ── Income Statement ──────────────────────────────────────────────────────
    "revenue": {
        "description": "Total net revenue", "unit": "amount",
    },
    "cogs": {
        "description": "Cost of goods sold", "unit": "amount",
    },
    "gross_profit": {
        "description": "Revenue minus COGS", "unit": "amount",
    },
    "gross_margin_pct": {
        "description": "Gross profit as % of revenue", "unit": "percent",
    },
    "total_expenses": {
        "description": "Total operating expenses", "unit": "amount",
    },
    "general_administrative_expense": {
        "description": "General & administrative expense", "unit": "amount",
    },
    "net_income": {
        "description": "Net income / (loss)", "unit": "amount",
    },
    "ebitda": {
        "description": "Earnings before interest, taxes, D&A", "unit": "amount",
    },
    "deferred_revenue": {
        "description": "Deferred / unearned revenue balance", "unit": "amount",
    },
    "bonus_pct_of_revenue": {
        "description": "Total bonus expense / revenue", "unit": "percent",
    },
    "capitalized_labor": {
        "description": "Labor costs capitalized into fixed or intangible assets", "unit": "amount",
    },
    "addbacks_pct_of_ebitda": {
        "description": "Total EBITDA add-backs / reported EBITDA", "unit": "percent",
    },
    "recurring_revenue_pct": {
        "description": "Recurring revenue / total revenue", "unit": "percent",
    },
    "deferred_costs": {
        "description": "Deferred contract acquisition / fulfillment costs", "unit": "amount",
    },
    "management_fee_pct_of_revenue": {
        "description": "Management fee paid to related parties / revenue", "unit": "percent",
    },
    "commission_expense": {
        "description": "Sales commission expense", "unit": "amount",
    },
    "travel_entertainment_pct_of_revenue": {
        "description": "Travel & entertainment expense / revenue", "unit": "percent",
    },

    # ── Balance Sheet — Assets ────────────────────────────────────────────────
    "cash": {
        "description": "Cash and cash equivalents", "unit": "amount",
    },
    "cash_single_institution_amount": {
        "description": "Cash held at a single depository institution", "unit": "amount",
    },
    "accounts_receivable": {
        "description": "Gross accounts receivable (before AFDA)", "unit": "amount",
    },
    "allowance_rate_pct": {
        "description": "Allowance for doubtful accounts / gross AR", "unit": "percent",
    },
    "ar_aging_over_90d_pct": {
        "description": "AR > 90 days past due / total AR", "unit": "percent",
    },
    "ar_aging_over_180d_pct": {
        "description": "AR > 180 days past due / total AR", "unit": "percent",
    },
    "customer_ar_concentration_pct": {
        "description": "Largest single-customer AR / gross AR", "unit": "percent",
    },
    "credit_memo_pct_of_revenue": {
        "description": "Credit memos issued / revenue", "unit": "percent",
    },
    "inventory": {
        "description": "Total inventory (raw + WIP + finished goods)", "unit": "amount",
    },
    "wip_inventory": {
        "description": "Work-in-progress inventory balance", "unit": "amount",
    },
    "overhead_variance_pct": {
        "description": "Manufacturing overhead variance / COGS", "unit": "percent",
    },
    "inventory_adjustment_pct": {
        "description": "Inventory adjustment entries / gross inventory", "unit": "percent",
    },
    "contract_assets": {
        "description": "Contract assets / unbilled receivables", "unit": "amount",
    },
    "contract_assets_pct_of_revenue": {
        "description": "Contract assets / revenue", "unit": "percent",
    },
    "total_current_assets": {
        "description": "Total current assets", "unit": "amount",
    },
    "total_assets": {
        "description": "Total assets", "unit": "amount",
    },
    "capex": {
        "description": "Capital expenditures (investing)", "unit": "amount",
    },
    "depreciation": {
        "description": "Depreciation expense", "unit": "amount",
    },
    "depreciation_pct_of_gross_assets": {
        "description": "Depreciation expense / gross fixed assets", "unit": "percent",
    },
    "intangible_amortization_pct": {
        "description": "Intangible amortization / gross intangibles", "unit": "percent",
    },

    # ── Balance Sheet — Liabilities & Equity ─────────────────────────────────
    "total_current_liabilities": {
        "description": "Total current liabilities", "unit": "amount",
    },
    "total_liabilities": {
        "description": "Total liabilities", "unit": "amount",
    },
    "total_debt": {
        "description": "Total long-term + current portion of debt", "unit": "amount",
    },
    "total_equity": {
        "description": "Total shareholders' equity", "unit": "amount",
    },
    "effective_tax_rate": {
        "description": "Income tax expense / pre-tax income", "unit": "percent",
    },

    # ── Ratios & Derived Metrics ──────────────────────────────────────────────
    "current_ratio": {
        "description": "Current assets / current liabilities", "unit": "ratio",
    },
    "debt_to_equity": {
        "description": "Total debt / total equity", "unit": "ratio",
    },
    "dso": {
        "description": "Days sales outstanding = AR / (revenue / days)", "unit": "days",
    },
    "dpo": {
        "description": "Days payable outstanding = AP / (COGS / days)", "unit": "days",
    },
    "ccc": {
        "description": "Cash conversion cycle = DSO + DIO − DPO", "unit": "days",
    },
    "dscr": {
        "description": "Debt service coverage ratio (SBA: NOI + addbacks / annual debt service)",
        "unit": "ratio",
    },
    "operating_cash_flow": {
        "description": "Net cash provided by operating activities", "unit": "amount",
    },
    "free_cash_flow": {
        "description": "Operating cash flow minus capital expenditures", "unit": "amount",
    },
    "accrual_ratio": {
        "description": "Sloan Accrual Ratio = (NI − CFO − CFI) / total assets", "unit": "ratio",
    },
    "wip_realization_rate": {
        "description": "Professional services: WIP billed / WIP incurred", "unit": "ratio",
    },
    "net_collection_rate": {
        "description": "Healthcare: net collections / net revenue", "unit": "percent",
    },

    # ── Revenue Concentration / Quality ──────────────────────────────────────
    "customer_concentration_pct": {
        "description": "Largest customer revenue / total revenue", "unit": "percent",
    },
    "period_end_revenue_concentration_pct": {
        "description": "Last 5 business days revenue / total period revenue", "unit": "percent",
    },
    "arr": {
        "description": "Annual recurring revenue (SaaS / subscription)", "unit": "amount",
    },

    # ── QoE / Adjustments ────────────────────────────────────────────────────
    "financial_tax_income_variance_pct": {
        "description": "Financial-statement income vs. tax-return income variance %",
        "unit": "percent",
    },

    # ── Fraud Scoring ─────────────────────────────────────────────────────────
    "beneish_m_score": {
        "description": "Beneish M-Score earnings manipulation index (> −1.78 = risk)",
        "unit": "score",
    },
}

# ---------------------------------------------------------------------------
# Qualitative flags — boolean/truthy values in the metrics dict.
# An "existence" rule fires when metrics[flag_name] is truthy.
# ---------------------------------------------------------------------------

QUALITATIVE_FLAGS: frozenset[str] = frozenset({
    # Revenue
    "returns_and_allowances_declining_vs_complaints",
    "unusual_revenue_account_codes",
    "contract_amendments_without_accounting_review",
    "variable_consideration_recognized_at_maximum",
    "related_party_revenue_transactions",
    "unbilled_services_at_period_end",
    # AR
    "long_term_ar_classified_current",
    "payment_application_discrepancies",
    "ar_factoring_not_derecognized",
    "related_party_ar_in_trade",
    # Inventory
    "physical_count_not_documented",
    "inventory_prices_below_cost",
    "ap_inventory_receipt_cutoff_gap",
    "consignment_inventory_included_in_count",
    # Cash
    "stale_reconciling_items",
    "restricted_cash_misclassified",
    "petty_cash_anomalies",
    "interbank_transfers_outstanding",
    "personal_payees_in_disbursements",
    # AP
    "ap_cutoff_items",
    "duplicate_payments",
    "ghost_vendor_indicators",
    "goods_received_not_invoiced_gap",
    "related_party_payables",
    "ap_debit_balances",
    "loss_contracts_uncommitted",
    # Accruals
    "accrued_liabilities_declining_vs_revenue",
    "warranty_reserve_growth_lag",
    "payroll_accrual_insufficient",
    "legal_contingency_without_accrual",
    "restructuring_liability_unused",
    "advance_payments_prematurely_recognized",
    "ibnr_reserve_inadequate",
    # Fixed Assets
    "items_capitalized_below_threshold",
    "impairment_indicators_without_analysis",
    "fully_depreciated_assets_in_active_use",
    "held_for_sale_not_reclassified",
    "software_costs_inconsistent_stage_analysis",
    "aro_obligation_not_recorded",
    # Intangibles
    "rd_costs_capitalized_pre_feasibility",
    "acquisition_goodwill_no_intangibles",
    "indefinite_lived_intangible_no_impairment_test",
    "noncompete_agreement_not_capitalized",
    # Leases
    "lease_commitments_exceed_balance_sheet",
    "finance_lease_misclassified_operating",
    "incremental_borrowing_rate_below_market",
    "lease_renewal_options_not_considered",
    "sale_leaseback_gain_premature_recognition",
    "lease_amendment_without_remeasurement",
    # Debt
    "current_ltd_does_not_match_schedule",
    "debt_issuance_costs_in_other_assets",
    "interest_expense_below_stated_rate",
    "related_party_debt",
    "ppp_balance_eliminated_without_forgiveness",
    "convertible_notes_no_equity_bifurcation",
    # Equity
    "retained_earnings_reconciliation_gap",
    "owner_distributions_undocumented",
    "stock_awards_outstanding_no_expense",
    "oci_items_flowing_through_income",
    "mezzanine_equity_in_stockholders_equity",
    "treasury_stock_gains_in_income",
    "equity_method_not_applied",
    # Tax
    "dta_valuation_allowance_not_assessed",
    "uncertain_tax_position_reserve_absent",
    "tax_nexus_without_filing",
    "tax_distributions_not_accrued",
    "payroll_tax_deposits_insufficient",
    # Payroll
    "ghost_employee_indicators",
    "contractor_employee_misclassification",
    "flsa_exempt_classification_error",
    "benefits_accrual_gap",
    "time_entry_manipulation_indicators",
    "garnishment_without_withholding",
    # Working Capital
    "prepaid_assets_without_amortization",
    "window_dressing_indicators",
    "current_portion_ltd_not_reclassified",
    "ar_ap_improperly_netted",
    "credit_line_low_at_period_end",
    # Gross Margin
    "gross_margin_improvement_without_explanation",
    "product_mix_shift_not_disclosed",
    "vendor_rebates_not_in_cogs",
    "intercompany_profit_not_eliminated",
    "inventory_writedowns_not_in_cogs",
    # OPEX
    "expense_reclassification_journal_entries",
    "related_party_operating_expenses",
    "affiliate_allocations_without_documentation",
    "commission_expense_not_deferred_asc340",
    "advertising_costs_improperly_capitalized",
    # EBITDA
    "projected_revenue_above_historical_cagr",
    "proforma_adjustments_undocumented",
    "recurring_charges_below_ebitda",
    "acquired_deferred_revenue_no_haircut",
    "recurring_revenue_without_churn_disclosure",
    # QoE
    "period_end_accrual_entries",
    "reserve_releases_offsetting_bad_news",
    "working_capital_target_single_period",
    "revenue_recognition_more_aggressive_than_peers",
    "acquisitions_without_proforma",
    # SBA
    "equity_injection_without_source_docs",
    "size_standard_affiliation_borderline",
    "loan_proceeds_passive_investment",
    "management_experience_insufficient",
    "collateral_appraisal_non_independent",
    "prior_federal_debt_not_disclosed",
    # Related Party
    "related_party_payments_not_disclosed",
    "related_party_pricing_not_arms_length",
    "related_party_guarantees_not_disclosed",
    "circular_related_party_cash_flows",
    "officer_receivables_in_trade_ar",
    "key_person_dependency_risk",
    # Cash Flow
    "operating_activities_misclassified",
    "balance_sheet_changes_not_in_cash_flow",
    "working_capital_changes_in_cf_mismatch",
    "capex_understated_investing_activities",
    "fx_effect_on_cash_not_presented",
    "owner_distributions_not_in_financing",
    "cash_equivalents_misclassified",
    # Financial Reporting
    "hybrid_accounting_basis",
    "single_year_no_comparative_period",
    "no_internal_controls",
    "subsequent_events_not_evaluated",
    "segment_reporting_absent",
    "engagement_level_understated",
    # Disclosures
    "accounting_policies_note_absent",
    "debt_disclosure_incomplete",
    "going_concern_not_disclosed",
    "commitments_and_obligations_incomplete",
    "fair_value_hierarchy_not_presented",
    # Presentation
    "income_statement_line_misclassification",
    "balance_sheet_not_classified",
    "equity_section_incomplete",
    "eps_calculation_methodology_error",
    # Fraud
    "journal_entries_outside_business_hours",
    "expense_report_fraud_indicators",
    "asset_misappropriation_indicators",
    "check_fraud_indicators",
    "revenue_skimming_indicators",
    "related_party_asset_diversion",
    # Industry
    "capitalized_costs_post_development_completion",
    "gift_card_breakage_not_recognized_proportionally",
})

ALL_KNOWN_METRICS: frozenset[str] = frozenset(METRIC_CATALOG.keys()) | QUALITATIVE_FLAGS
