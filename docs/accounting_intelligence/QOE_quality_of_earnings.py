"""Quality of Earnings — 10 issue templates (QOE_001–QOE_010)"""

QUALITY_OF_EARNINGS = [
    {
        "code": "QOE_001",
        "category": "quality_of_earnings",
        "subcategory": "accruals",
        "issue_type": "qoe",
        "name": "Accrual-to-Cash Earnings Divergence — Earnings Persistence Concern",
        "description": (
            "Reported earnings are driven primarily by accrual estimates rather than "
            "cash realizations, reducing the persistence and quality of reported income. "
            "The Sloan accrual ratio and similar measures indicate that high accrual "
            "ratios predict future earnings disappointments."
        ),
        "risk_level": "high",
        "materiality_note": "Flag when accrual-to-assets ratio exceeds 8% (Sloan threshold).",
        "detection_logic": "Accrual Ratio = (Net Income − CFO − CFI) / Total Assets; ratio > 8%.",
        "potential_causes": [
            "Aggressive revenue recognition creating accrual income without cash",
            "Deferral of expenses creating accrual income",
            "Working capital expansion consuming cash while income appears strong",
        ],
        "suggested_procedures": [
            "Calculate Sloan accrual ratio for current and prior periods",
            "Identify specific accruals driving the divergence",
            "Assess whether accruals are supported by subsequent cash collection",
            "Review balance sheet changes: AR, inventory, payables growth",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What is the primary driver of the difference between net income and operating cash flow?",
            "Are there significant accruals expected to be collected or paid in the near term?",
        ],
        "affected_account_types": ["asset", "liability", "revenue"],
        "affected_statements": ["IncomeStatement", "CashFlowStatement"],
        "audit_assertions": ["accuracy", "completeness"],
        "references": ["Sloan (1996)", "QoE best practices"],
        "sort_order": 10,
    },
    {
        "code": "QOE_002",
        "category": "quality_of_earnings",
        "subcategory": "period_shifting",
        "issue_type": "qoe",
        "name": "Earnings Management Through Period-End Accrual Manipulation",
        "description": (
            "Accruals are being adjusted at period end to manage reported earnings "
            "to a target (meet analyst consensus, loan covenant, or bonus threshold). "
            "Discretionary accruals at period end that deviate from historical patterns "
            "without economic justification are a red flag for earnings management."
        ),
        "risk_level": "high",
        "materiality_note": "Any confirmed earnings management is qualitatively material.",
        "detection_logic": "Large accrual journal entries recorded on last day of period; accruals consistently just above or below key thresholds; reversal entries immediately after period close.",
        "potential_causes": [
            "Pressure to meet bonus or covenant targets",
            "Management adjusting accruals to smooth earnings",
            "Preparer override of accounting estimates near period end",
        ],
        "suggested_procedures": [
            "Analyze journal entries by date of entry vs. period date; flag entries dated on last day",
            "Test reversing entries: do accruals reverse in subsequent period?",
            "Compare accrual levels to historical patterns",
            "Evaluate whether key targets/thresholds would be missed without accrual adjustments",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Are there any period-end accrual adjustments that were made to achieve specific financial metrics?",
            "What controls exist over period-end adjusting entries?",
            "Who approves significant accrual journal entries?",
        ],
        "affected_account_types": ["liability", "revenue"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["accuracy", "occurrence"],
        "references": ["Jones (1991) accrual model", "AU-C 240"],
        "sort_order": 20,
    },
    {
        "code": "QOE_003",
        "category": "quality_of_earnings",
        "subcategory": "channel_stuffing",
        "issue_type": "fraud",
        "name": "Channel Stuffing — Inventory Pushed to Distributors Without Real Demand",
        "description": (
            "The company is shipping excess inventory to distributors or customers "
            "beyond their immediate needs, inflating current period revenue. Channel "
            "stuffing creates inflated AR, high return rates, and revenue pull-forward "
            "that will reduce future period revenue."
        ),
        "risk_level": "critical",
        "materiality_note": "Any confirmed channel stuffing is critical; inflates revenue and distorts business performance.",
        "detection_logic": "Distributor inventory builds without corresponding end-customer demand; large period-end shipments; return rates increasing in subsequent period; AR aging deteriorating.",
        "potential_causes": [
            "Management pressure to meet revenue targets",
            "Incentives for sales team tied to shipments, not end-customer sales",
            "Right-of-return side agreements not disclosed",
        ],
        "suggested_procedures": [
            "Obtain distributor sell-through reports; compare to sell-in",
            "Identify distributors with growing inventory levels",
            "Review customer agreements for side agreements or right-of-return clauses",
            "Confirm AR terms and collectibility for channel partners",
        ],
        "suggested_ajes": [
            "Dr Revenue / Cr Accounts Receivable — to reverse channel-stuffed revenue",
        ],
        "management_questions": [
            "Do you track distributor sell-through separately from your sell-in?",
            "Have any distributors requested return authorizations for excess inventory?",
            "Are there any side agreements or informal return understandings with distributors?",
        ],
        "affected_account_types": ["revenue", "asset"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["occurrence", "existence"],
        "references": ["AU-C 240", "SEC enforcement actions on channel stuffing"],
        "sort_order": 30,
    },
    {
        "code": "QOE_004",
        "category": "quality_of_earnings",
        "subcategory": "cookie_jar",
        "issue_type": "fraud",
        "name": "Cookie Jar Reserves — Excess Reserves Released to Meet Earnings Targets",
        "description": (
            "Excess reserves were established in prior periods and are being released "
            "into income in the current period to achieve earnings targets. This is a "
            "classic earnings management technique: build reserves in good years, "
            "release in bad years to smooth reported income."
        ),
        "risk_level": "high",
        "materiality_note": "Any identified cookie jar reserve release is qualitatively material.",
        "detection_logic": "Reserve balances declining without corresponding change in underlying risk; reserve releases consistently appearing to offset bad news; excess reserves established during profitable periods.",
        "potential_causes": [
            "Big-bath year used to over-accrue reserves for future income management",
            "Warranty, litigation, or restructuring reserves built in excess of required amounts",
            "Restructuring reserve residuals not returned to expense as estimates change",
        ],
        "suggested_procedures": [
            "Review roll-forward of all significant reserves over 3 years",
            "Identify reserves released without change in underlying circumstances",
            "Assess whether reserve establishment was consistent with economic conditions at the time",
            "Test adequacy of current reserves relative to exposures",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What was the basis for establishing the reserves released this period?",
            "Have the underlying risks changed to justify reserve reductions?",
            "Were any reserves established in the prior year that appear to have been excessive in hindsight?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["occurrence", "accuracy"],
        "references": ["AU-C 540", "SEC Staff Bulletin on Accounting Fraud"],
        "sort_order": 40,
    },
    {
        "code": "QOE_005",
        "category": "quality_of_earnings",
        "subcategory": "recurring_revenue",
        "issue_type": "qoe",
        "name": "Recurring Revenue Classification Overstated",
        "description": (
            "Revenue classified as 'recurring' includes items that are not contractually "
            "committed or have significant termination risk. Overstated recurring revenue "
            "percentages inflate business quality metrics and valuation multiples in "
            "transaction contexts."
        ),
        "risk_level": "high",
        "materiality_note": "Always material in transaction context; recurring vs. non-recurring split directly affects deal pricing.",
        "detection_logic": "Recurring revenue percentage above 80% of total revenue without documented contractual basis; churn rates inconsistent with high recurring revenue claim.",
        "potential_causes": [
            "Month-to-month contracts classified as recurring despite cancellation risk",
            "Usage-based revenue classified as recurring",
            "Renewal revenue included before contract renewal executed",
        ],
        "suggested_procedures": [
            "Obtain complete customer contract list; verify contract terms and renewal status",
            "Classify revenue by contract type: contractually committed, month-to-month, one-time",
            "Calculate churn rate and assess consistency with recurring revenue claim",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What percentage of revenue is under multi-year contracts vs. month-to-month?",
            "What is the cancellation policy for recurring revenue customers?",
            "What was the contract renewal rate last year?",
        ],
        "affected_account_types": ["revenue"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["occurrence", "accuracy"],
        "references": ["QoE best practices"],
        "sort_order": 50,
    },
    {
        "code": "QOE_006",
        "category": "quality_of_earnings",
        "subcategory": "working_capital_normalization",
        "issue_type": "qoe",
        "name": "Working Capital Target Inappropriate for Transaction",
        "description": (
            "The working capital target in a purchase agreement does not reflect the "
            "normal operating working capital needs of the business. Setting too high "
            "a target extracts value from the buyer; too low a target leaves the buyer "
            "with insufficient working capital post-close."
        ),
        "risk_level": "moderate",
        "materiality_note": "Always relevant in M&A transactions; working capital true-ups are a common post-close dispute.",
        "detection_logic": "Working capital target based on a single period rather than trailing 12-month average; seasonality not considered in target calculation.",
        "potential_causes": [
            "Target based on peak working capital period",
            "Unusual period-end items included in target calculation",
            "Debt-like items improperly excluded from working capital calculation",
        ],
        "suggested_procedures": [
            "Calculate trailing 12-month average working capital by month",
            "Identify and exclude non-recurring or unusual items from working capital",
            "Assess whether seasonality affects appropriate target setting",
            "Review purchase agreement definition of working capital for completeness",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "How was the working capital target established?",
            "Were any unusual or non-recurring items in the target period?",
            "Is the working capital target consistent with the trailing 12-month average?",
        ],
        "affected_account_types": ["asset", "liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["accuracy"],
        "references": ["QoE best practices", "SPA working capital provisions"],
        "sort_order": 60,
    },
    {
        "code": "QOE_007",
        "category": "quality_of_earnings",
        "subcategory": "revenue_recognition_aggression",
        "issue_type": "qoe",
        "name": "Aggressive Revenue Recognition Inflating Near-Term Period Results",
        "description": (
            "Revenue recognition policies, while technically compliant, are at the "
            "aggressive end of GAAP guidance, pulling revenue forward into the current "
            "period. This makes the most recent period appear stronger than the "
            "underlying business performance would otherwise support."
        ),
        "risk_level": "high",
        "materiality_note": "Relevant in any QoE analysis; must assess sustainability of recognition policies.",
        "detection_logic": "Revenue recognition policies more aggressive than industry peers; deferred revenue declining as % of revenue; ASC 606 options selected to accelerate recognition.",
        "potential_causes": [
            "Percentage-of-completion method on long-term contracts with aggressive milestones",
            "Variable consideration estimated at maximum rather than constrained amount",
            "Performance obligations combined rather than separated to accelerate recognition",
        ],
        "suggested_procedures": [
            "Benchmark recognition policies against industry peers",
            "Assess sustainability of current-period revenue recognition",
            "Calculate impact of more conservative recognition approaches",
            "Evaluate deferred revenue roll-forward for health of future revenue stream",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Are revenue recognition policies reviewed periodically for appropriateness?",
            "Are there alternative recognition approaches that would result in lower current-period revenue?",
        ],
        "affected_account_types": ["revenue", "liability"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["accuracy", "occurrence"],
        "references": ["ASC 606-10", "QoE best practices"],
        "sort_order": 70,
    },
    {
        "code": "QOE_008",
        "category": "quality_of_earnings",
        "subcategory": "expense_deferral",
        "issue_type": "qoe",
        "name": "Expense Deferral Inflating Near-Term EBITDA",
        "description": (
            "Operating expenses are being deferred into future periods through "
            "capitalization or prepayment arrangements, reducing current period "
            "expense and inflating near-term EBITDA. Deferred costs must represent "
            "genuine future economic benefit."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when deferred costs are growing faster than revenue.",
        "detection_logic": "Prepaid and deferred cost balances growing disproportionately to revenue or operating activity.",
        "potential_causes": [
            "Operating costs capitalized beyond qualifying criteria",
            "Large annual prepayments creating deferred expense benefit",
            "Software development costs deferred beyond technological feasibility",
        ],
        "suggested_procedures": [
            "Review all deferred cost and prepaid balances for economic substance",
            "Assess whether deferral is accelerating or decelerating expenses vs. prior periods",
            "Normalize EBITDA for changes in deferred expense levels",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What costs are being deferred and what is the expected benefit period?",
            "How have deferred cost levels changed from prior periods?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["valuation", "accuracy"],
        "references": ["QoE best practices", "ASC 340-40"],
        "sort_order": 80,
    },
    {
        "code": "QOE_009",
        "category": "quality_of_earnings",
        "subcategory": "management_fee",
        "issue_type": "qoe",
        "name": "Management Fee or Overhead Allocation Distorting Stand-Alone EBITDA",
        "description": (
            "A management fee paid to a parent, sponsor, or owner entity is either "
            "above market (inflating expenses and reducing EBITDA) or below market "
            "(understating true costs). In stand-alone analysis, the fee must be "
            "replaced with market-rate equivalent costs."
        ),
        "risk_level": "moderate",
        "materiality_note": "Relevant for any entity paying management fees to related parties.",
        "detection_logic": "Management fees to related party present; fee percentage of revenue above or below 1-3% benchmark range.",
        "potential_causes": [
            "PE fund-level management fee charged to portfolio company",
            "Owner management fee inflated to extract cash pre-transaction",
            "Shared services underbilled leaving stand-alone costs understated",
        ],
        "suggested_procedures": [
            "Identify all management fee arrangements",
            "Assess market rate for equivalent services",
            "Adjust normalized EBITDA for difference between actual and market-rate fees",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What services are provided in exchange for the management fee?",
            "What would it cost to replace these services on a stand-alone basis?",
            "Would the management fee continue post-transaction?",
        ],
        "affected_account_types": ["cogs"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["accuracy", "occurrence"],
        "references": ["QoE best practices", "AICPA PE/VC Guide"],
        "sort_order": 90,
    },
    {
        "code": "QOE_010",
        "category": "quality_of_earnings",
        "subcategory": "organic_vs_acquisition",
        "issue_type": "qoe",
        "name": "Growth Metrics Not Bifurcated Between Organic and Acquisition Growth",
        "description": (
            "Revenue or EBITDA growth is presented in total without bifurcating "
            "organic growth (same-store or same-entity) from acquisition-driven "
            "growth. This makes growth appear more robust than it is on an organic "
            "basis and obscures integration risk."
        ),
        "risk_level": "moderate",
        "materiality_note": "Relevant for any entity that completed acquisitions in the trailing 24 months.",
        "detection_logic": "Acquisitions completed in trailing 24 months without pro forma or organic growth disclosure.",
        "potential_causes": [
            "No segment or entity-level revenue tracking for acquired businesses",
            "Revenue metrics reported only at consolidated level",
        ],
        "suggested_procedures": [
            "Bifurcate revenue and EBITDA between organic operations and acquisitions",
            "Calculate organic growth rate excluding acquired revenue",
            "Assess sustainability of organic growth as a standalone metric",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What portion of revenue growth is organic vs. from acquisitions?",
            "Can acquired businesses be reported separately?",
            "What is the same-store or organic revenue growth rate?",
        ],
        "affected_account_types": ["revenue"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["accuracy", "presentation"],
        "references": ["QoE best practices", "ASC 805"],
        "sort_order": 100,
    },
]
