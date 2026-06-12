"""Operating Expenses — 8 issue templates (OPEX_001–OPEX_008)"""

OPERATING_EXPENSES = [
    {
        "code": "OPEX_001",
        "category": "operating_expenses",
        "subcategory": "classification",
        "issue_type": "financial_analytics",
        "name": "Operating Expense Classification Inconsistency",
        "description": (
            "Operating expenses are classified inconsistently between periods or "
            "reclassified between COGS, R&D, sales, general & administrative, or "
            "other categories without disclosure. Inconsistent classification distorts "
            "period-over-period comparison and key margin metrics."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when any expense category changes by more than 10% of total revenue without clear business justification.",
        "detection_logic": "Expense categories shifting significantly between periods without corresponding operational change; large reclassification journal entries.",
        "potential_causes": [
            "ERP account code changes mid-year",
            "Management reclassification to improve SG&A or EBITDA metric",
            "Inconsistent application of cost allocation methodology",
        ],
        "suggested_procedures": [
            "Review all operating expense accounts for year-over-year comparability",
            "Identify significant classification changes; assess accounting basis",
            "Test material reclassification entries for proper authorization and rationale",
        ],
        "suggested_ajes": [
            "Reclassification entries as appropriate to restore consistency",
        ],
        "management_questions": [
            "Have there been any changes in how expenses are classified between periods?",
            "Were there any ERP chart of accounts changes affecting expense coding?",
            "What was the reason for any significant reclassifications?",
        ],
        "affected_account_types": ["cogs"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["classification", "consistency", "accuracy"],
        "references": ["ASC 250-10-45", "QoE best practices"],
        "sort_order": 10,
    },
    {
        "code": "OPEX_002",
        "category": "operating_expenses",
        "subcategory": "one_time",
        "issue_type": "qoe",
        "name": "One-Time and Non-Recurring Expenses Not Identified",
        "description": (
            "Operating expenses include significant one-time or non-recurring items "
            "(litigation settlements, transaction costs, restructuring, disaster losses) "
            "that are commingled with recurring operating expenses. In QoE and EBITDA "
            "analysis, these must be separately identified as potential add-backs."
        ),
        "risk_level": "moderate",
        "materiality_note": "Any expense exceeding $25K that is non-recurring should be flagged for QoE analysis.",
        "detection_logic": "Unusual or large expense items in operating accounts without recurring nature; G&A expense significantly above prior periods.",
        "potential_causes": [
            "Professional fees for M&A, litigation, or restructuring in recurring SG&A",
            "Disaster or casualty losses in operating expenses",
            "Write-off of previously capitalized costs in OPEX",
        ],
        "suggested_procedures": [
            "Review G&A and other expense detail for non-recurring items",
            "Identify and quantify all potential EBITDA add-backs",
            "Assess probability of recurrence for each identified item",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Are there any expense items this period that you would not expect to recur?",
            "Were there any transaction, legal, or restructuring costs included in operating expenses?",
            "Were there any one-time write-offs or losses in operating expenses?",
        ],
        "affected_account_types": ["cogs"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["presentation", "occurrence"],
        "references": ["QoE best practices", "SBA SOP 50-10"],
        "sort_order": 20,
    },
    {
        "code": "OPEX_003",
        "category": "operating_expenses",
        "subcategory": "travel_entertainment",
        "issue_type": "audit",
        "name": "Excessive Travel and Entertainment Without Business Purpose",
        "description": (
            "Travel and entertainment expenses are above industry norms, lack documented "
            "business purpose, or include personal expenses. T&E is a high-risk expense "
            "category for fraud and personal expense misappropriation."
        ),
        "risk_level": "moderate",
        "materiality_note": "Aggregate T&E add-backs can be material in QoE and SBA contexts.",
        "detection_logic": "T&E as % of revenue significantly above industry norms; large individual T&E charges; T&E growth outpacing revenue.",
        "potential_causes": [
            "Personal meals and entertainment charged to company",
            "Spouse/family travel included in business travel",
            "Luxury travel and entertainment beyond reasonable business purpose",
        ],
        "suggested_procedures": [
            "Review T&E expense detail for largest charges",
            "Verify business purpose documentation for sample of charges",
            "Compare T&E as % of revenue to prior periods and industry benchmarks",
            "Identify charges that appear personal in nature",
        ],
        "suggested_ajes": [
            "Dr Owner Distribution / Cr T&E Expense — to reclassify personal T&E",
        ],
        "management_questions": [
            "Are there documented business purposes for all T&E charges?",
            "Is personal travel separated from business travel?",
            "What is the policy for T&E expense approval?",
        ],
        "affected_account_types": ["cogs"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["occurrence", "accuracy"],
        "references": ["IRC Section 274", "QoE best practices"],
        "sort_order": 30,
    },
    {
        "code": "OPEX_004",
        "category": "operating_expenses",
        "subcategory": "related_party_expenses",
        "issue_type": "audit",
        "name": "Related Party Expense Transactions at Non-Arm's-Length Rates",
        "description": (
            "Expenses paid to related parties (owner-controlled entities, family members, "
            "affiliates) are at rates above or below market, distorting reported "
            "operating expenses. Common examples include above-market rent to owner "
            "real estate, management fees to affiliates, and consulting to family members."
        ),
        "risk_level": "high",
        "materiality_note": "Always qualitatively material; requires disclosure; key QoE and SBA adjustment.",
        "detection_logic": "Rent, consulting, or management fee expenses paid to entities with ownership overlap.",
        "potential_causes": [
            "Rent paid to owner entity at above-market rates",
            "Management fees to affiliate without services rendered",
            "Consulting fees to family members at above-market rates",
        ],
        "suggested_procedures": [
            "Identify all payments to related parties in operating expenses",
            "Compare rates to market (benchmarked rent, market consulting rates)",
            "Quantify above/below-market amounts as QoE adjustments",
        ],
        "suggested_ajes": [
            "Dr/Cr Operating Expense / Cr/Dr Owner Distribution — to normalize to market rate",
        ],
        "management_questions": [
            "Are any operating facilities leased from related parties? At what rate?",
            "Are any consultants or service providers related to owners or officers?",
            "Are management fees paid to any related entities?",
        ],
        "affected_account_types": ["cogs"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["occurrence", "accuracy"],
        "references": ["ASC 850-10", "QoE best practices"],
        "sort_order": 40,
    },
    {
        "code": "OPEX_005",
        "category": "operating_expenses",
        "subcategory": "expense_shifting",
        "issue_type": "fraud",
        "name": "Expense Shifting to Affiliated Entities",
        "description": (
            "Operating expenses of one entity are being improperly charged to an "
            "affiliated entity without economic substance, reducing the reporting "
            "entity's costs while inflating expenses of the affiliate. This is a "
            "form of financial statement manipulation."
        ),
        "risk_level": "high",
        "materiality_note": "Any confirmed expense shifting is qualitatively material.",
        "detection_logic": "Expenses allocated from or to affiliates without documented cost-sharing agreement or economic basis; expenses declining while operational activity is stable.",
        "potential_causes": [
            "Management fees from parent used to extract cash from operating entity",
            "Shared services charged without actual services rendered",
            "Costs shifted to minimize reported profitability in SBA or M&A context",
        ],
        "suggested_procedures": [
            "Review all intercompany allocations and management fees",
            "Obtain documentation of services received for any charges from affiliates",
            "Assess whether expense allocations have economic substance",
        ],
        "suggested_ajes": [
            "Dr Intercompany Expense / Cr Due to Affiliate — to reclassify non-substantive charges",
        ],
        "management_questions": [
            "Are any expenses charged from affiliated entities? What services were received?",
            "Is there a documented intercompany service agreement?",
            "Are intercompany charges at arm's length?",
        ],
        "affected_account_types": ["cogs"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["occurrence", "completeness"],
        "references": ["ASC 850-10", "AU-C 240"],
        "sort_order": 50,
    },
    {
        "code": "OPEX_006",
        "category": "operating_expenses",
        "subcategory": "prepaid_amortization",
        "issue_type": "financial_analytics",
        "name": "Deferred Transaction Costs Accelerated Into Expense",
        "description": (
            "Transaction costs or deferred costs that should be amortized over the "
            "contract period are being expensed immediately, overstating current period "
            "expenses and understating deferred cost assets. Under ASC 340-40, costs "
            "to obtain and fulfill contracts must be capitalized when certain criteria "
            "are met."
        ),
        "risk_level": "low",
        "materiality_note": "Evaluate for SaaS and subscription businesses where contract acquisition costs are material.",
        "detection_logic": "Sales commission or contract fulfillment cost expensed immediately rather than deferred; commission expense growing faster than new customer revenue.",
        "potential_causes": [
            "ASC 340-40 not adopted or applied incorrectly",
            "Sales commissions expensed as incurred rather than capitalized",
            "Contract fulfillment costs expensed immediately",
        ],
        "suggested_procedures": [
            "Identify contract acquisition costs (commissions) and fulfillment costs",
            "Assess if costs meet capitalization criteria under ASC 340-40",
            "Calculate deferred cost asset and amortization schedule",
        ],
        "suggested_ajes": [
            "Dr Deferred Contract Cost / Cr Commission Expense — to defer qualifying contract costs",
        ],
        "management_questions": [
            "How are sales commissions recognized — immediately or amortized?",
            "Has ASC 340-40 contract cost guidance been evaluated?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["valuation", "accuracy"],
        "references": ["ASC 340-40-25-1", "ASC 340-40-35-1"],
        "sort_order": 60,
    },
    {
        "code": "OPEX_007",
        "category": "operating_expenses",
        "subcategory": "advertising",
        "issue_type": "financial_analytics",
        "name": "Advertising Costs Incorrectly Deferred",
        "description": (
            "Advertising and marketing costs are being deferred as intangible assets "
            "or prepaid expenses when they do not meet the criteria for deferral under "
            "ASC 720-35. With limited exceptions (direct-response advertising), "
            "advertising costs must be expensed as incurred or when the advertising "
            "occurs."
        ),
        "risk_level": "low",
        "materiality_note": "Flag when advertising amounts capitalized exceed 5% of total marketing spend.",
        "detection_logic": "Prepaid or intangible assets include advertising costs that are not direct-response; advertising expense unusually low in periods with high marketing activity.",
        "potential_causes": [
            "Brand development costs deferred as intangibles",
            "Advertising production costs deferred and amortized",
            "Digital marketing costs capitalized without qualifying criteria",
        ],
        "suggested_procedures": [
            "Review prepaid and intangible assets for advertising costs",
            "Confirm deferral criteria under ASC 720-35",
            "Expense non-qualifying advertising costs",
        ],
        "suggested_ajes": [
            "Dr Advertising Expense / Cr Prepaid/Intangible — to expense improperly deferred advertising",
        ],
        "management_questions": [
            "Are any advertising costs being deferred? What is the basis?",
            "Are there any direct-response advertising programs with measurable future benefit?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["valuation", "accuracy"],
        "references": ["ASC 720-35-25", "ASC 720-35-35"],
        "sort_order": 70,
    },
    {
        "code": "OPEX_008",
        "category": "operating_expenses",
        "subcategory": "opex_leverage",
        "issue_type": "financial_analytics",
        "name": "Operating Expense Leverage Not Materializing as Expected",
        "description": (
            "Operating expenses are growing at a rate equal to or faster than revenue, "
            "preventing operating leverage from materializing. This may indicate "
            "structural cost issues, unsustainable investments, or that the business "
            "model does not have inherent operating leverage."
        ),
        "risk_level": "low",
        "materiality_note": "Relevant for growth-stage entities where operating leverage is a key investor thesis.",
        "detection_logic": "OPEX/Revenue ratio flat or increasing despite revenue growth; headcount growing at revenue rate without productivity improvements.",
        "potential_causes": [
            "Headcount additions matching revenue growth without productivity improvement",
            "Infrastructure costs scaling with revenue rather than showing leverage",
            "Investment in growth ahead of revenue realization",
        ],
        "suggested_procedures": [
            "Calculate OPEX as % of revenue for trailing 4 quarters",
            "Decompose OPEX growth by category: people, technology, facilities",
            "Assess management's path to operating leverage",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "At what revenue level do you expect operating expenses to grow slower than revenue?",
            "Are there any infrastructure investments creating temporary cost elevation?",
            "What is the headcount plan for the next 12 months relative to revenue expectations?",
        ],
        "affected_account_types": ["cogs"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["completeness"],
        "references": ["QoE best practices"],
        "sort_order": 80,
    },
]
