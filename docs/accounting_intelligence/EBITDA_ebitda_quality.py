"""EBITDA Quality — 8 issue templates (EBITDA_001–EBITDA_008)"""

EBITDA_QUALITY = [
    {
        "code": "EBITDA_001",
        "category": "ebitda_quality",
        "subcategory": "add_backs",
        "issue_type": "qoe",
        "name": "Aggressive or Unsupported EBITDA Add-Backs",
        "description": (
            "EBITDA add-backs include items that are not genuinely non-recurring, "
            "non-cash, or below-the-line. Aggressive add-backs inflate normalized "
            "EBITDA and are a primary area of scrutiny in QoE engagements. Common "
            "unsupported add-backs include recurring professional fees, normal maintenance "
            "capex, and owner compensation adjustments without market-rate replacement."
        ),
        "risk_level": "high",
        "materiality_note": "Always material in transaction context; each add-back should be scrutinized individually.",
        "detection_logic": "EBITDA add-backs represent > 20% of reported EBITDA; add-backs include items present in multiple prior periods.",
        "potential_causes": [
            "Recurring professional fees labeled as transaction costs",
            "Maintenance capex classified as non-recurring",
            "Owner compensation add-back without documented market-rate replacement assumption",
            "Add-backs for items expected to recur (systems implementations, marketing initiatives)",
        ],
        "suggested_procedures": [
            "Obtain complete add-back schedule from management; evaluate each item",
            "Test recurrence: was the same or similar item present in prior periods?",
            "For owner compensation add-backs, verify market-rate replacement cost",
            "Assess whether all add-backs are defensible to a buyer or lender",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "For each add-back, why is this item expected to not recur?",
            "Were any items in the add-back schedule also present in the prior year?",
            "What is the market-rate cost to replace owner compensation functions?",
        ],
        "affected_account_types": ["cogs"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["occurrence", "accuracy"],
        "references": ["QoE best practices", "AICPA PE/VC Guide"],
        "sort_order": 10,
    },
    {
        "code": "EBITDA_002",
        "category": "ebitda_quality",
        "subcategory": "run_rate",
        "issue_type": "qoe",
        "name": "Annualized EBITDA Includes Unsustainable Revenue Projections",
        "description": (
            "Run-rate or forward EBITDA projections assume revenue growth rates or "
            "margin improvement that is not supported by historical performance or "
            "signed contracts. Overstated forward EBITDA inflates transaction values "
            "and misrepresents business performance."
        ),
        "risk_level": "high",
        "materiality_note": "Always relevant in transaction context.",
        "detection_logic": "Forward EBITDA assumes revenue growth > historical CAGR without contracted revenue backlog to support it.",
        "potential_causes": [
            "Hockey stick revenue projections not supported by pipeline data",
            "Annualizing a particularly strong recent quarter",
            "Including synergies or cost reductions not yet implemented",
        ],
        "suggested_procedures": [
            "Compare forward assumptions to historical growth rates",
            "Test revenue pipeline for signed contracts vs. projected",
            "Assess whether cost reduction assumptions have been implemented",
            "Sensitize EBITDA to multiple revenue scenarios",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What is the signed contract backlog supporting the revenue projections?",
            "How does the projected growth rate compare to historical performance?",
            "What cost reductions are included in the projections and at what stage of implementation?",
        ],
        "affected_account_types": ["revenue", "cogs"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["accuracy", "occurrence"],
        "references": ["QoE best practices"],
        "sort_order": 20,
    },
    {
        "code": "EBITDA_003",
        "category": "ebitda_quality",
        "subcategory": "pro_forma",
        "issue_type": "qoe",
        "name": "Pro Forma Adjustments Not Properly Documented or Validated",
        "description": (
            "Pro forma EBITDA adjustments for acquisitions, disposals, or cost "
            "savings have not been properly documented or validated with evidence. "
            "Pro forma adjustments must reflect actual changes, not projections, and "
            "must be supported by detailed documentation."
        ),
        "risk_level": "high",
        "materiality_note": "Material in any M&A, LBO, or SBA transaction context.",
        "detection_logic": "Pro forma adjustments without supporting documentation; synergy add-backs included without implementation plan.",
        "potential_causes": [
            "Revenue synergies included without executed contracts",
            "Cost savings included for head count reductions not yet taken",
            "Acquisition contribution included at projected rather than actual run-rate",
        ],
        "suggested_procedures": [
            "Obtain documentation for each pro forma adjustment",
            "Verify acquired business contribution based on actual operating results",
            "Assess cost savings: have terminations occurred? Are savings realized?",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What evidence supports each pro forma adjustment?",
            "Have the cost savings in the pro forma been implemented?",
            "Are revenue synergies based on signed contracts or assumptions?",
        ],
        "affected_account_types": ["revenue", "cogs"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["accuracy", "occurrence"],
        "references": ["QoE best practices", "SEC Regulation S-X Rule 11-02"],
        "sort_order": 30,
    },
    {
        "code": "EBITDA_004",
        "category": "ebitda_quality",
        "subcategory": "normalized",
        "issue_type": "qoe",
        "name": "Normalized EBITDA Excludes Below-the-Line Recurring Costs",
        "description": (
            "Costs that appear below EBITDA (interest, certain restructuring, asset "
            "write-offs) but recur regularly are excluded from normalized EBITDA "
            "calculations. This produces a normalized EBITDA that overstates recurring "
            "profitability."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when below-the-line recurring costs are material relative to EBITDA.",
        "detection_logic": "Recurring write-offs, restructuring charges, or other items consistently appear below EBITDA line; normalized EBITDA persistently above net income by unusual margin.",
        "potential_causes": [
            "Annual inventory write-offs excluded from normalized EBITDA",
            "Regular restructuring cycles treated as non-recurring each year",
            "Recurring litigation settlements excluded from each year's EBITDA",
        ],
        "suggested_procedures": [
            "Review 3-year history of below-the-line items; identify recurring patterns",
            "Include annually recurring items in normalized EBITDA",
            "Assess whether any 'non-recurring' items appear in all periods reviewed",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Are there any costs excluded from EBITDA that have occurred in prior years?",
            "What is the company's annual average for restructuring or write-off activity?",
        ],
        "affected_account_types": ["cogs"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["completeness", "accuracy"],
        "references": ["QoE best practices"],
        "sort_order": 40,
    },
    {
        "code": "EBITDA_005",
        "category": "ebitda_quality",
        "subcategory": "maintenance_capex",
        "issue_type": "qoe",
        "name": "Maintenance CapEx Not Deducted in EBITDA-to-Cash Conversion",
        "description": (
            "EBITDA is presented without deducting maintenance capital expenditures, "
            "overstating true economic earnings. Maintenance CapEx is necessary to "
            "sustain current operations and should be deducted from EBITDA to arrive "
            "at 'Owner Earnings' or sustainable free cash flow."
        ),
        "risk_level": "moderate",
        "materiality_note": "Relevant for capital-intensive businesses where CapEx is significant.",
        "detection_logic": "EBITDA to OCF bridge does not account for maintenance CapEx; total CapEx presented without growth/maintenance bifurcation.",
        "potential_causes": [
            "CapEx not bifurcated into maintenance and growth components",
            "All CapEx treated as growth investment in EBITDA bridge",
            "EBITDA used as proxy for cash flow without CapEx consideration",
        ],
        "suggested_procedures": [
            "Bifurcate CapEx into maintenance (sustain current capacity) and growth (expand capacity)",
            "Deduct maintenance CapEx from EBITDA to show true economic earnings",
            "Compare maintenance CapEx estimate to depreciation as a reasonableness check",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What portion of annual CapEx is required to maintain current operations?",
            "How is maintenance CapEx distinguished from growth CapEx?",
            "Is the business CapEx-intensive? What is the relationship between CapEx and depreciation?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["CashFlowStatement"],
        "audit_assertions": ["completeness", "accuracy"],
        "references": ["QoE best practices", "Warren Buffett 'Owner Earnings' concept"],
        "sort_order": 50,
    },
    {
        "code": "EBITDA_006",
        "category": "ebitda_quality",
        "subcategory": "deferred_revenue_haircut",
        "issue_type": "qoe",
        "name": "Deferred Revenue Write-Down in Acquisition Understates Post-Close Revenue",
        "description": (
            "In acquisition accounting (ASC 805), acquired deferred revenue is written "
            "down to fair value (typically cost to fulfill plus a normal profit margin). "
            "This creates a post-close revenue reduction that inflates pre-close EBITDA "
            "relative to post-close EBITDA and must be considered in deal modeling."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material for SaaS and subscription businesses with significant deferred revenue.",
        "detection_logic": "Acquired entity has significant deferred revenue; no purchase accounting haircut applied.",
        "potential_causes": [
            "PPA does not reflect ASC 805 fair value measurement of deferred revenue",
            "Impact of deferred revenue haircut not disclosed or modeled",
        ],
        "suggested_procedures": [
            "Identify acquired deferred revenue balance",
            "Calculate ASC 805 fair value step-down",
            "Model post-close revenue impact for buyer",
        ],
        "suggested_ajes": [
            "Dr Deferred Revenue / Cr Goodwill — to record deferred revenue fair value step-down in PPA",
        ],
        "management_questions": [
            "What is the deferred revenue balance that will be subject to purchase accounting adjustment?",
            "Has the buyer been informed of the expected deferred revenue haircut?",
        ],
        "affected_account_types": ["liability", "revenue"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["valuation", "accuracy"],
        "references": ["ASC 805-20-30", "QoE best practices"],
        "sort_order": 60,
    },
    {
        "code": "EBITDA_007",
        "category": "ebitda_quality",
        "subcategory": "customer_churn",
        "issue_type": "qoe",
        "name": "Revenue Churn Rate Not Disclosed in Recurring Revenue Businesses",
        "description": (
            "For subscription or recurring revenue businesses, customer and revenue "
            "churn rates are not calculated or disclosed. Churn significantly affects "
            "the sustainability of recurring revenue and is a critical QoE metric for "
            "SaaS, insurance, and subscription models."
        ),
        "risk_level": "high",
        "materiality_note": "Always relevant for subscription revenue models; material when annual churn exceeds 10%.",
        "detection_logic": "Recurring revenue business without disclosed churn metrics; customer count stable while revenue declining.",
        "potential_causes": [
            "Churn not tracked at the cohort level",
            "Gross churn obscured by new customer additions",
            "Net revenue retention not calculated",
        ],
        "suggested_procedures": [
            "Obtain cohort analysis: beginning customers, additions, churned customers, ending customers",
            "Calculate gross and net revenue retention",
            "Compare churn to industry benchmarks",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What is the annual customer churn rate?",
            "What is net revenue retention (including expansion)?",
            "Are churn trends improving or worsening?",
        ],
        "affected_account_types": ["revenue"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["completeness", "accuracy"],
        "references": ["QoE best practices", "SaaS metrics benchmarks"],
        "sort_order": 70,
    },
    {
        "code": "EBITDA_008",
        "category": "ebitda_quality",
        "subcategory": "ebitda_bridge",
        "issue_type": "qoe",
        "name": "EBITDA Bridge Analysis Missing — Changes Not Explained",
        "description": (
            "Year-over-year EBITDA changes have not been explained via a bridge analysis "
            "decomposing the change into volume, price, mix, and cost components. "
            "Without a bridge, it is impossible to assess the quality and sustainability "
            "of earnings improvements or deteriorations."
        ),
        "risk_level": "moderate",
        "materiality_note": "Relevant for any significant period-over-period EBITDA change.",
        "detection_logic": "EBITDA changed more than 10% without documented bridge analysis.",
        "potential_causes": [
            "No internal EBITDA bridge prepared",
            "Revenue growth explaining EBITDA improvement without cost leverage assessment",
        ],
        "suggested_procedures": [
            "Prepare EBITDA bridge: prior EBITDA + volume impact + price/mix impact + cost savings/headwinds = current EBITDA",
            "Identify and quantify each driver",
            "Assess sustainability of each positive driver",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What are the primary drivers of the change in EBITDA this period?",
            "How much of the EBITDA improvement is from volume growth vs. margin improvement?",
        ],
        "affected_account_types": ["revenue", "cogs"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["accuracy", "completeness"],
        "references": ["QoE best practices"],
        "sort_order": 80,
    },
]
