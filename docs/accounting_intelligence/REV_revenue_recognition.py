"""Revenue Recognition — 12 issue templates (REV_001–REV_012)"""

REVENUE_RECOGNITION = [
    {
        "code": "REV_001",
        "category": "revenue_recognition",
        "subcategory": "timing",
        "issue_type": "financial_analytics",
        "name": "Revenue Recognized Before Delivery / Performance Obligation Unsatisfied",
        "description": (
            "Revenue is recorded in the period before the goods are delivered or the "
            "service performance obligation is satisfied. Under ASC 606, revenue may only "
            "be recognized when (or as) a performance obligation is transferred to the "
            "customer. Early recognition inflates the current period income statement and "
            "understates deferred revenue on the balance sheet."
        ),
        "risk_level": "high",
        "materiality_note": "Material when premature revenue exceeds 5% of total revenue or when it causes a period to appear profitable that would otherwise show a loss.",
        "detection_logic": "Revenue growth significantly exceeds accounts receivable growth AND deferred revenue balance declines unexpectedly.",
        "potential_causes": [
            "Bill-and-hold arrangements without meeting ASC 606 criteria",
            "Channel stuffing — shipping goods before customer orders",
            "Revenue recorded on shipment when terms are FOB destination",
            "Multi-element arrangements allocated incorrectly across periods",
            "Subscription revenue recognized upfront rather than ratably",
        ],
        "suggested_procedures": [
            "Obtain and review a sample of customer contracts from the period; confirm performance obligations are satisfied before revenue is recorded",
            "Test cutoff by selecting transactions 5 days before and after period end; verify shipping docs and delivery confirmation",
            "Reconcile deferred revenue roll-forward: beginning balance + billings − revenue recognized = ending balance",
            "Review bill-and-hold transactions for compliance with ASC 606-10-55-83 through 55-84",
            "Confirm revenue recognition policy is consistently applied across customer types",
        ],
        "suggested_ajes": [
            "Dr Revenue / Cr Deferred Revenue — to defer prematurely recognized revenue to the correct period",
            "Dr Accounts Receivable / Cr Revenue — if revenue was omitted from the correct period",
        ],
        "management_questions": [
            "What is your revenue recognition policy for each major product/service line?",
            "Are there any bill-and-hold arrangements in place? What criteria are used?",
            "How are multi-element contracts allocated between performance obligations?",
            "What controls exist to ensure shipping cutoff is applied consistently at period end?",
        ],
        "affected_account_types": ["revenue", "liability"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["completeness", "cutoff", "occurrence", "accuracy"],
        "references": ["ASC 606-10-25-1", "ASC 606-10-55-83", "SAB Topic 13"],
        "sort_order": 10,
    },
    {
        "code": "REV_002",
        "category": "revenue_recognition",
        "subcategory": "timing",
        "issue_type": "financial_analytics",
        "name": "Deferred Revenue Understated — Unearned Amounts Not Recorded",
        "description": (
            "Customer payments received in advance of performance are not recorded as "
            "deferred revenue (a liability). Instead, they are recognized as revenue "
            "immediately, violating ASC 606. This overstates revenue in the current "
            "period and understates liabilities."
        ),
        "risk_level": "high",
        "materiality_note": "Evaluate relative to total deferred revenue balance and subscription/prepayment revenue streams.",
        "detection_logic": "Cash receipts significantly exceed billed revenue; deferred revenue balance is flat or declining while subscription billings grow.",
        "potential_causes": [
            "Upfront fees for multi-year contracts recognized in full at signing",
            "Annual maintenance or support fees recognized on the invoice date rather than ratably",
            "Gift card or store credit liabilities not tracked",
            "Software license revenue recognized before delivery or acceptance",
        ],
        "suggested_procedures": [
            "Obtain billings schedule for subscription or prepayment contracts; agree to deferred revenue ledger",
            "Test a sample of cash receipts for advance payments; verify deferred revenue entry was recorded",
            "Review contract terms for performance obligations not yet satisfied at period end",
            "Recalculate ratable revenue recognition for multi-period contracts",
        ],
        "suggested_ajes": [
            "Dr Revenue / Cr Deferred Revenue — to reclassify revenue earned in a future period",
        ],
        "management_questions": [
            "What percentage of revenue is received in advance of performance?",
            "How is the deferred revenue balance reconciled each period?",
            "Are there any annual contracts billed upfront? How is revenue spread?",
        ],
        "affected_account_types": ["revenue", "liability"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["completeness", "valuation", "cutoff"],
        "references": ["ASC 606-10-45-1", "ASC 340-40"],
        "sort_order": 20,
    },
    {
        "code": "REV_003",
        "category": "revenue_recognition",
        "subcategory": "returns_and_allowances",
        "issue_type": "financial_analytics",
        "name": "Sales Returns and Allowances Reserve Inadequate",
        "description": (
            "The allowance for sales returns and allowances is understated relative to "
            "historical return rates or known customer claims. ASC 606 requires an "
            "estimate of variable consideration (including returns) to be recorded at "
            "the time of sale. Understating this reserve overstates net revenue."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when actual returns in subsequent periods exceed recorded estimates by more than 10%.",
        "detection_logic": "Returns and allowances as a percentage of gross revenue declining while product quality issues or customer complaints are rising.",
        "potential_causes": [
            "Reserve calculated using outdated return rate assumptions",
            "Known product defects or recalls not yet reflected in reserve",
            "Large customer disputes or chargebacks not yet recorded",
            "Seasonal return patterns not considered in estimation",
        ],
        "suggested_procedures": [
            "Analyze trailing 12-month return rates by product line; compare to current reserve percentage",
            "Review subsequent period credit memos and returns; compare to reserve balance",
            "Inquire about known disputes, product issues, or planned promotions that may increase returns",
            "Test the reserve calculation for reasonableness against historical experience",
        ],
        "suggested_ajes": [
            "Dr Sales Returns and Allowances / Cr Allowance for Returns — to increase reserve to appropriate level",
        ],
        "management_questions": [
            "What is your historical return rate by product category?",
            "Are there any pending customer claims or disputes not yet recorded?",
            "Have there been any product quality issues in the period that may lead to higher returns?",
        ],
        "affected_account_types": ["revenue", "asset"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["valuation", "completeness", "accuracy"],
        "references": ["ASC 606-10-32-8", "ASC 606-10-55-23"],
        "sort_order": 30,
    },
    {
        "code": "REV_004",
        "category": "revenue_recognition",
        "subcategory": "gross_vs_net",
        "issue_type": "financial_analytics",
        "name": "Gross vs. Net Revenue Presentation Error",
        "description": (
            "Revenue is presented on a gross basis (including amounts passed through to "
            "third parties) when net presentation is required under ASC 606 principal vs. "
            "agent guidance, or vice versa. This misclassification inflates or deflates "
            "revenue and cost of sales without affecting gross profit, but materially "
            "distorts revenue metrics and margins."
        ),
        "risk_level": "moderate",
        "materiality_note": "Always qualitatively material when the entity acts as agent; gross margin distortion can mislead buyers in M&A or SBA contexts.",
        "detection_logic": "Gross margin significantly lower than industry peers; or revenue contains large pass-through cost components.",
        "potential_causes": [
            "Marketplace or platform businesses recording third-party fulfillment costs as COGS",
            "Agency arrangements recorded gross instead of net",
            "Reseller arrangements where entity bears no inventory risk recorded gross",
            "Tax or freight pass-throughs included in gross revenue",
        ],
        "suggested_procedures": [
            "Review ASC 606 principal vs. agent indicators for each revenue stream",
            "Identify all pass-through arrangements; assess whether entity controls goods/services before transfer",
            "Recalculate revenue and COGS under correct presentation; quantify the gross-to-net adjustment",
            "Review industry peers' presentation for comparability",
        ],
        "suggested_ajes": [
            "Dr Revenue / Cr COGS — to reduce both by the pass-through amount in an agent arrangement",
        ],
        "management_questions": [
            "In arrangements with third-party suppliers, does the company take title to goods before delivering to the customer?",
            "Who bears the inventory and credit risk in fulfillment arrangements?",
            "Are there any commission-based or agency revenue streams?",
        ],
        "affected_account_types": ["revenue", "cogs"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["presentation", "accuracy", "valuation"],
        "references": ["ASC 606-10-55-36", "ASC 606-10-55-37"],
        "sort_order": 40,
    },
    {
        "code": "REV_005",
        "category": "revenue_recognition",
        "subcategory": "concentration",
        "issue_type": "qoe",
        "name": "Customer Concentration Risk — Single Customer Exceeds 20% of Revenue",
        "description": (
            "One or more customers represent more than 20% of total revenue, creating "
            "significant concentration risk. While not an accounting error, this is a "
            "material disclosure requirement and a significant QoE concern in M&A, SBA, "
            "and audit contexts. Loss of a single large customer could materially impair "
            "future revenue."
        ),
        "risk_level": "high",
        "materiality_note": "Always flag when any single customer exceeds 10% of revenue; critical above 20%.",
        "detection_logic": "Revenue by customer analysis shows single customer >= 20% of total period revenue.",
        "potential_causes": [
            "Organic growth of a single large relationship",
            "Acquisition of a customer-concentrated business",
            "Loss of diversified customers leaving concentration by default",
            "Government or large institutional contracts dominating revenue",
        ],
        "suggested_procedures": [
            "Prepare revenue by customer schedule; identify all customers above 10% threshold",
            "Review contracts with top 3 customers for renewal terms, termination clauses, and exclusivity",
            "Assess whether concentration is increasing or decreasing over trailing 3 years",
            "Evaluate customer credit quality and financial stability",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What is the contract renewal status with your top customer(s)?",
            "Are there any pending disputes or renegotiations with concentrated customers?",
            "What is your strategy for customer diversification?",
            "Are there any exclusivity or volume commitment clauses in top customer contracts?",
        ],
        "affected_account_types": ["revenue"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["presentation", "completeness"],
        "references": ["ASC 280-10-50-42", "SBA SOP 50-10"],
        "sort_order": 50,
    },
    {
        "code": "REV_006",
        "category": "revenue_recognition",
        "subcategory": "nonrecurring",
        "issue_type": "qoe",
        "name": "Non-Recurring Revenue Included in Run-Rate Without Disclosure",
        "description": (
            "One-time or non-recurring revenue items (settlement proceeds, asset sales, "
            "government grants, one-time project fees) are commingled with recurring "
            "operating revenue without separate identification. This inflates the apparent "
            "run-rate of the business, which is particularly deceptive in QoE, M&A, and "
            "SBA loan underwriting contexts."
        ),
        "risk_level": "high",
        "materiality_note": "Material in any transaction context; flag all non-recurring items regardless of dollar amount.",
        "detection_logic": "Revenue contains line items coded to unusual accounts (settlements, grants, other income reclassified as revenue) or large single transactions with no prior-period comparables.",
        "potential_causes": [
            "Litigation settlement proceeds booked as revenue",
            "PPP loan forgiveness or government grants coded to revenue",
            "One-time project or consulting engagements treated as recurring",
            "Asset disposals credited to revenue accounts",
            "Insurance proceeds recorded in revenue",
        ],
        "suggested_procedures": [
            "Obtain general ledger detail for all revenue accounts; identify items above materiality threshold",
            "For each unusual item, obtain supporting documentation and assess recurrence probability",
            "Prepare an adjusted revenue schedule separating recurring and non-recurring components",
            "Compare adjusted revenue to prior 3 years to assess run-rate trend",
        ],
        "suggested_ajes": [
            "Dr Revenue / Cr Other Income — to reclassify non-recurring items below operating income",
        ],
        "management_questions": [
            "Are there any revenue items in this period that you would not expect to recur?",
            "Were any settlements, insurance claims, or government grants included in revenue?",
            "Are there any one-time project engagements that contributed to revenue this period?",
        ],
        "affected_account_types": ["revenue"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["presentation", "completeness", "occurrence"],
        "references": ["ASC 225-20", "QoE best practices"],
        "sort_order": 60,
    },
    {
        "code": "REV_007",
        "category": "revenue_recognition",
        "subcategory": "contract_modifications",
        "issue_type": "audit",
        "name": "Contract Modification Not Accounted for Under ASC 606",
        "description": (
            "Changes to existing customer contracts (scope changes, price modifications, "
            "term extensions) are not evaluated under ASC 606 contract modification "
            "guidance. Modifications may need to be treated as a new contract, a "
            "termination and replacement, or a continuation of the existing contract "
            "depending on the facts and circumstances."
        ),
        "risk_level": "moderate",
        "materiality_note": "Evaluate on a contract-by-contract basis; material for large contracts or when modification changes total transaction price significantly.",
        "detection_logic": "Contract amendments or change orders identified in contract files but not evaluated for accounting impact.",
        "potential_causes": [
            "Change orders processed without accounting review",
            "Price concessions given to retain customers not recorded as variable consideration adjustments",
            "Scope reductions treated as revenue reversals rather than contract modifications",
            "Contract renewals with changed terms treated as continuations",
        ],
        "suggested_procedures": [
            "Review contract amendment files and change orders for the period",
            "For each significant modification, apply ASC 606-10-25-10 decision tree: distinct goods/services at standalone selling price?",
            "Recalculate cumulative catch-up adjustment if modification treated as continuation",
            "Ensure sales team has process to notify accounting of all contract changes",
        ],
        "suggested_ajes": [
            "Various — depends on modification treatment; may require catch-up revenue adjustment or reallocation",
        ],
        "management_questions": [
            "Were there any significant contract amendments, renewals, or scope changes this period?",
            "How does the accounting team learn about contract modifications from the sales team?",
            "Are there any price concessions given to customers that were not formally documented?",
        ],
        "affected_account_types": ["revenue", "liability"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["accuracy", "cutoff", "valuation"],
        "references": ["ASC 606-10-25-10", "ASC 606-10-25-12"],
        "sort_order": 70,
    },
    {
        "code": "REV_008",
        "category": "revenue_recognition",
        "subcategory": "variable_consideration",
        "issue_type": "audit",
        "name": "Variable Consideration Constraint Not Applied",
        "description": (
            "Revenue includes estimated variable consideration (bonuses, rebates, "
            "penalties, royalties) without applying the constraint under ASC 606. "
            "Constrained revenue is the amount for which it is highly probable that a "
            "significant reversal will not occur. Failure to apply the constraint "
            "overstates revenue when estimates are uncertain."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when variable components exceed 10% of gross contract value.",
        "detection_logic": "Contracts contain performance bonuses, rebates, or penalty clauses; revenue recognized at maximum rather than constrained estimate.",
        "potential_causes": [
            "Performance bonuses recognized before achievement criteria confirmed",
            "Volume rebates not estimated and deducted from revenue",
            "Penalty clauses not considered in transaction price estimation",
            "Royalty revenue recognized before underlying sales reported by licensee",
        ],
        "suggested_procedures": [
            "Identify all contracts with variable consideration components",
            "For each variable element, assess probability-weighted or most-likely-amount estimate",
            "Apply constraint test: is it highly probable a significant reversal will not occur?",
            "Compare amounts recognized to constrained estimates",
        ],
        "suggested_ajes": [
            "Dr Revenue / Cr Refund Liability — to record estimated variable consideration liability",
        ],
        "management_questions": [
            "Which contracts include performance bonuses, rebates, or volume discounts?",
            "How are variable consideration estimates updated as information becomes available?",
            "Have any performance bonuses been recognized that are not yet contractually earned?",
        ],
        "affected_account_types": ["revenue", "liability"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["valuation", "accuracy", "completeness"],
        "references": ["ASC 606-10-32-11", "ASC 606-10-32-12"],
        "sort_order": 80,
    },
    {
        "code": "REV_009",
        "category": "revenue_recognition",
        "subcategory": "cutoff",
        "issue_type": "audit",
        "name": "Revenue Cutoff Error at Period End",
        "description": (
            "Revenue transactions are recorded in the wrong accounting period due to "
            "improper cutoff procedures. This includes recording December shipments in "
            "January (understatement) or recording January activity in December "
            "(overstatement). Both distort period comparisons and trend analysis."
        ),
        "risk_level": "moderate",
        "materiality_note": "Assess against materiality threshold; high risk near year-end and quarter-end.",
        "detection_logic": "Revenue in the last 5 business days of a period is disproportionately high relative to the rest of the period; or revenue in the first 5 days of the following period is unusually low.",
        "potential_causes": [
            "Period-end pressure to meet revenue targets",
            "Shipping department records sales date as ship date regardless of period",
            "ERP cutoff settings misconfigured",
            "Manual journal entries recorded on first day of new period for prior period activity",
        ],
        "suggested_procedures": [
            "Test revenue cutoff: select transactions in last 5 days of period and first 5 days of subsequent period",
            "Agree sales invoices to shipping documents and delivery confirmations",
            "For FOB destination shipments, verify delivery date, not ship date, is used for recognition",
            "Review journal entries dated on the first business day of the period after close",
        ],
        "suggested_ajes": [
            "Dr Revenue / Cr Deferred Revenue — to push overstatement to correct period",
            "Dr Accounts Receivable / Cr Revenue — to pull understatement into correct period",
        ],
        "management_questions": [
            "What controls exist over the revenue cutoff process at period end?",
            "Are there any shipments in transit at period end? How are these handled?",
            "What is the policy for FOB destination vs. FOB shipping point?",
        ],
        "affected_account_types": ["revenue", "asset"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["cutoff", "occurrence", "completeness"],
        "references": ["ASC 606-10-25-23", "AU-C 330"],
        "sort_order": 90,
    },
    {
        "code": "REV_010",
        "category": "revenue_recognition",
        "subcategory": "related_party",
        "issue_type": "fraud",
        "name": "Related Party Revenue Without Arm's Length Terms",
        "description": (
            "Revenue transactions with related parties (officers, owners, affiliates) "
            "are recorded at non-arm's-length prices. This may inflate revenue above "
            "market rates, create circular revenue arrangements, or obscure the true "
            "economic performance of the business. Material in all transaction contexts."
        ),
        "risk_level": "high",
        "materiality_note": "Always flagged regardless of dollar amount; qualitative materiality applies.",
        "detection_logic": "Revenue from counterparties identified as related parties in entity records or ownership documentation.",
        "potential_causes": [
            "Inter-company sales at above-market transfer prices",
            "Owner loans recast as revenue",
            "Revenue from affiliated entities not disclosed",
            "Round-trip transactions between related entities",
        ],
        "suggested_procedures": [
            "Obtain related party listing; cross-reference against customer master",
            "For related party revenues, obtain contracts and compare to market rates",
            "Assess whether related party transactions are on arm's-length terms",
            "Verify related party revenues are fully disclosed in financial statements",
        ],
        "suggested_ajes": [
            "Dr Revenue / Cr Payable to Related Party — to eliminate or restate non-arm's-length revenue",
        ],
        "management_questions": [
            "Are any customers related to owners, officers, or affiliates of the company?",
            "Are related party transactions conducted at arm's length?",
            "Are related party revenues disclosed in the financial statements?",
        ],
        "affected_account_types": ["revenue"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["occurrence", "presentation", "completeness"],
        "references": ["ASC 850-10", "AU-C 550"],
        "sort_order": 100,
    },
    {
        "code": "REV_011",
        "category": "revenue_recognition",
        "subcategory": "seasonality",
        "issue_type": "financial_analytics",
        "name": "Unexplained Revenue Seasonality Deviation",
        "description": (
            "Current period revenue deviates significantly from expected seasonal patterns "
            "without adequate explanation. Businesses with known seasonal cycles should "
            "show consistent intra-year patterns. A material deviation from the expected "
            "seasonal pattern may indicate revenue manipulation, lost customers, or a "
            "fundamental business change requiring disclosure."
        ),
        "risk_level": "low",
        "materiality_note": "Flag when current period deviates more than 15% from prior-year same period.",
        "detection_logic": "Period-over-period same-period comparison shows revenue deviation > 15% without corresponding operational explanation.",
        "potential_causes": [
            "Pull-forward of Q4 revenue into Q3 to meet targets",
            "Lost key customer or channel not yet disclosed",
            "Change in distribution strategy affecting timing",
            "Legitimate business change: new product launch, geographic expansion",
        ],
        "suggested_procedures": [
            "Compare current period to same period in prior 3 years",
            "Obtain management explanation for material deviations",
            "Corroborate explanation with supporting operational data (units shipped, headcount, orders)",
            "Assess whether deviation is isolated or part of a trend",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What drove the difference in revenue this period vs. the same period last year?",
            "Were there any pull-forward or push-back arrangements with customers?",
            "Have there been any changes to distribution channels or sales territories?",
        ],
        "affected_account_types": ["revenue"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["occurrence", "completeness"],
        "references": ["ASC 270-10", "QoE best practices"],
        "sort_order": 110,
    },
    {
        "code": "REV_012",
        "category": "revenue_recognition",
        "subcategory": "completeness",
        "issue_type": "audit",
        "name": "Unbilled Revenue (Accrued Revenue) Not Recorded",
        "description": (
            "Services performed or goods delivered for which billing has not yet been "
            "issued are not accrued as revenue. Under accrual accounting, revenue must "
            "be recognized when earned regardless of billing timing. Missing unbilled "
            "receivables understates revenue and assets."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when estimated unbilled amounts exceed 5% of total revenue.",
        "detection_logic": "Services or projects in progress at period end with no corresponding unbilled receivable; billings in subsequent period include large amounts for prior period work.",
        "potential_causes": [
            "Time-and-materials projects billed only at completion rather than as work is performed",
            "Government contracts with milestone billing; work performed but milestone not reached",
            "Subscription overages not calculated and billed until following month",
            "Manual billing process with delays between performance and invoice generation",
        ],
        "suggested_procedures": [
            "Obtain project status reports and work-in-progress schedules at period end",
            "Compare billings in first 30 days of subsequent period to services performed in current period",
            "Test contract terms for billing triggers vs. performance triggers",
            "Recalculate unbilled amounts for time-and-materials projects using hours × rates",
        ],
        "suggested_ajes": [
            "Dr Unbilled Accounts Receivable / Cr Revenue — to accrue earned but unbilled revenue",
        ],
        "management_questions": [
            "Are there any projects where work has been completed but billing has not been issued?",
            "What is the average lag between service delivery and invoice generation?",
            "Are there any milestone-billed contracts where work in progress exceeds billed amounts?",
        ],
        "affected_account_types": ["revenue", "asset"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["completeness", "cutoff", "accuracy"],
        "references": ["ASC 606-10-45-3", "ASC 606-10-45-4"],
        "sort_order": 120,
    },
]
