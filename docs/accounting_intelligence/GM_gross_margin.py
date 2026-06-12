"""Gross Margin — 8 issue templates (GM_001–GM_008)"""

GROSS_MARGIN = [
    {
        "code": "GM_001",
        "category": "gross_margin",
        "subcategory": "cogs_completeness",
        "issue_type": "financial_analytics",
        "name": "COGS Understated — Missing Direct Costs",
        "description": (
            "Direct costs of producing goods or delivering services are not fully "
            "included in cost of goods sold, causing gross margin to be overstated. "
            "Common omissions include subcontractor costs, direct labor fringe benefits, "
            "shipping costs, and depreciation on production equipment."
        ),
        "risk_level": "high",
        "materiality_note": "Flag when gross margin is significantly above industry norms without clear competitive advantage explanation.",
        "detection_logic": "Gross margin increasing without corresponding pricing power or product mix shift; COGS as % of revenue declining while operational activity is stable.",
        "potential_causes": [
            "Production-related costs classified as SG&A",
            "Direct labor fringes (benefits, taxes) excluded from COGS",
            "Shipping costs presented below gross profit line",
            "Depreciation on manufacturing equipment in G&A rather than COGS",
        ],
        "suggested_procedures": [
            "Review cost classification policies; compare to industry standard",
            "Test a sample of COGS items for completeness of direct costs",
            "Compare gross margin to industry benchmarks; investigate material deviations",
            "Confirm that all variable costs of production are in COGS",
        ],
        "suggested_ajes": [
            "Dr COGS / Cr Operating Expense — to reclassify direct costs from SG&A to COGS",
        ],
        "management_questions": [
            "What costs are included in cost of goods sold?",
            "Are shipping costs, direct labor benefits, and production depreciation in COGS?",
            "Has the gross margin changed materially from prior periods? What explains it?",
        ],
        "affected_account_types": ["cogs"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["completeness", "classification"],
        "references": ["ASC 330-10-30", "QoE best practices"],
        "sort_order": 10,
    },
    {
        "code": "GM_002",
        "category": "gross_margin",
        "subcategory": "product_mix",
        "issue_type": "financial_analytics",
        "name": "Gross Margin Shift From Product Mix Change",
        "description": (
            "Overall gross margin has changed materially due to a shift in product or "
            "service mix rather than pricing or efficiency improvements. Mix shifts may "
            "not be sustainable and can be obscured in consolidated gross margin "
            "reporting without segment-level analysis."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when overall gross margin changes > 3 percentage points without clear pricing explanation.",
        "detection_logic": "Total gross margin changing while volume is stable; product category mix percentages shifting.",
        "potential_causes": [
            "Higher-margin products growing faster due to acquisition or new contract",
            "Lower-margin revenue stream declining",
            "One-time high-margin project included in period results",
        ],
        "suggested_procedures": [
            "Prepare gross margin by product line or revenue category",
            "Identify which product lines are driving margin changes",
            "Assess sustainability of current product mix",
            "Compare product-level margins to prior periods",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Can you provide gross margin by product line or service category?",
            "Have there been any changes in the mix of products or services sold?",
            "Are there any one-time high-margin projects in the current period?",
        ],
        "affected_account_types": ["revenue", "cogs"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["presentation", "accuracy"],
        "references": ["QoE best practices"],
        "sort_order": 20,
    },
    {
        "code": "GM_003",
        "category": "gross_margin",
        "subcategory": "vendor_rebates",
        "issue_type": "financial_analytics",
        "name": "Vendor Rebates and Allowances Not Properly Reflected in COGS",
        "description": (
            "Vendor rebates, allowances, and cooperative advertising payments received "
            "from suppliers are not being credited to COGS or are being recognized "
            "in the wrong period. ASC 606 requires vendor allowances to reduce COGS "
            "unless they represent a payment for a specific, identifiable benefit."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material when rebates are significant relative to COGS; impacts true gross margin.",
        "detection_logic": "Large vendor rebates received but credited to other income rather than COGS; rebate accruals not recorded at period end.",
        "potential_causes": [
            "Volume rebates recognized only when received, not when earned",
            "Promotional allowances credited to other income rather than COGS",
            "Rebate thresholds estimated incorrectly",
        ],
        "suggested_procedures": [
            "Obtain vendor rebate agreements; calculate accrual for earned but unpaid rebates",
            "Verify that rebates are classified as COGS reduction, not other income",
            "Test timing of rebate recognition against volume achievement",
        ],
        "suggested_ajes": [
            "Dr Rebates Receivable / Cr COGS — to accrue earned vendor rebates",
            "Dr Other Income / Cr COGS — to reclassify vendor rebates from income to COGS",
        ],
        "management_questions": [
            "Are there volume rebate or cooperative advertising agreements with suppliers?",
            "How are vendor rebates classified in the income statement?",
            "Are rebate accruals recorded when earned rather than when received?",
        ],
        "affected_account_types": ["cogs"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["completeness", "classification", "accuracy"],
        "references": ["ASC 606-10-32-25", "EITF 02-16"],
        "sort_order": 30,
    },
    {
        "code": "GM_004",
        "category": "gross_margin",
        "subcategory": "absorption_variance",
        "issue_type": "financial_analytics",
        "name": "Unabsorbed Overhead Variance Not Closed to COGS",
        "description": (
            "Manufacturing overhead variances (volume, efficiency, spending) remain "
            "in variance accounts rather than being closed to COGS at period end. "
            "Under GAAP, overhead variances should be closed to COGS in the period "
            "unless immaterial and allocable to ending inventory."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when overhead variance accounts carry balances > 5% of COGS.",
        "detection_logic": "Overhead variance accounts have material balances at period end; COGS as % of revenue inconsistent with standard cost models.",
        "potential_causes": [
            "Standard costs not updated for actual cost changes",
            "Overhead rates set at normal capacity but production significantly below normal",
            "Volume variance from facility underutilization not charged to COGS",
        ],
        "suggested_procedures": [
            "Review overhead variance balances at period end",
            "Assess whether variances are material; determine COGS allocation",
            "Verify that idle capacity costs are not deferred in inventory",
        ],
        "suggested_ajes": [
            "Dr COGS / Cr Manufacturing Overhead Variance — to close unfavorable variances",
        ],
        "management_questions": [
            "Are manufacturing overhead variance accounts cleared at period end?",
            "Has production volume changed significantly from the normal capacity assumed in standard rates?",
        ],
        "affected_account_types": ["cogs"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["accuracy", "completeness"],
        "references": ["ASC 330-10-30-7", "ASC 330-10-30-8"],
        "sort_order": 40,
    },
    {
        "code": "GM_005",
        "category": "gross_margin",
        "subcategory": "intercompany_margin",
        "issue_type": "audit",
        "name": "Intercompany Profit in Inventory Not Eliminated",
        "description": (
            "Intercompany sales between consolidated entities create intercompany profit "
            "in ending inventory that must be eliminated in consolidation. Failure to "
            "eliminate results in overstated inventory and understated COGS on a "
            "consolidated basis."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material when intercompany inventory sales are significant.",
        "detection_logic": "Intercompany elimination schedule missing inventory profit component; consolidated inventory margins above statutory rates.",
        "potential_causes": [
            "Intercompany elimination focused on revenue/cost but not inventory profit",
            "ERP intercompany module not configured to track inventory profit in transit",
        ],
        "suggested_procedures": [
            "Identify intercompany inventory at period end",
            "Calculate intercompany profit included in ending inventory",
            "Record elimination of intercompany profit in consolidation",
        ],
        "suggested_ajes": [
            "Dr COGS / Cr Inventory — to eliminate intercompany profit in consolidated inventory",
        ],
        "management_questions": [
            "Are there intercompany inventory purchases included in consolidated inventory?",
            "Is the intercompany profit in ending inventory eliminated in consolidation?",
        ],
        "affected_account_types": ["cogs", "asset"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["accuracy", "completeness"],
        "references": ["ASC 810-10-45-1", "ASC 323-10-35-7"],
        "sort_order": 50,
    },
    {
        "code": "GM_006",
        "category": "gross_margin",
        "subcategory": "shrinkage_cogs",
        "issue_type": "financial_analytics",
        "name": "Inventory Shrinkage and Write-Downs Not Reflected in COGS",
        "description": (
            "Inventory write-downs, shrinkage, and obsolescence are not included in "
            "COGS but are classified as non-operating or below-the-line items, "
            "artificially inflating gross margin. These are normal costs of carrying "
            "inventory and should be in COGS."
        ),
        "risk_level": "moderate",
        "materiality_note": "Reclassification required; affects key gross margin metric.",
        "detection_logic": "Inventory write-downs or shrinkage in other expense rather than COGS; gross margin unusually high relative to inventory risk.",
        "potential_causes": [
            "Write-downs classified as unusual items below gross profit",
            "Inventory shrinkage in general expense rather than COGS",
            "Management presenting write-downs below gross profit to protect margin metric",
        ],
        "suggested_procedures": [
            "Review all inventory adjustments; confirm COGS classification",
            "Reclassify write-downs and shrinkage to COGS",
            "Recalculate gross margin including these items",
        ],
        "suggested_ajes": [
            "Dr COGS / Cr Other Expense — to reclassify inventory adjustments to COGS",
        ],
        "management_questions": [
            "Are inventory write-downs and shrinkage included in COGS or classified separately?",
            "Is there a policy for where inventory losses are presented in the income statement?",
        ],
        "affected_account_types": ["cogs"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["classification", "accuracy"],
        "references": ["ASC 330-10-35", "QoE best practices"],
        "sort_order": 60,
    },
    {
        "code": "GM_007",
        "category": "gross_margin",
        "subcategory": "pricing_decline",
        "issue_type": "financial_analytics",
        "name": "Gross Margin Compression — Pricing Power Deterioration",
        "description": (
            "Gross margin is declining due to competitive pricing pressure, inability "
            "to pass through input cost increases, or customer mix shift toward "
            "lower-margin accounts. While not an accounting error, margin compression "
            "is a key indicator for QoE, credit, and M&A analysis."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when gross margin declines more than 3 percentage points period-over-period.",
        "detection_logic": "Gross margin declining while revenue is stable or growing; pricing realization declining.",
        "potential_causes": [
            "Input cost increases not passed through to customers",
            "Competitive discounting to retain customers",
            "New customer growth in lower-margin segments",
            "Contract repricing on renewals at lower rates",
        ],
        "suggested_procedures": [
            "Analyze gross margin by customer cohort (new vs. existing)",
            "Compare average selling price trend to input cost trend",
            "Identify contracts up for renewal with pricing risk",
            "Assess whether margin compression is structural or cyclical",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What is driving the decline in gross margin?",
            "Are input cost increases being passed through to customers?",
            "Are there significant contracts up for renewal where pricing may be reduced?",
        ],
        "affected_account_types": ["revenue", "cogs"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["accuracy"],
        "references": ["QoE best practices"],
        "sort_order": 70,
    },
    {
        "code": "GM_008",
        "category": "gross_margin",
        "subcategory": "cost_timing",
        "issue_type": "financial_analytics",
        "name": "COGS and Revenue Timing Mismatch",
        "description": (
            "Revenue and the corresponding cost of goods sold are recognized in "
            "different periods, creating distorted gross margins. This mismatch violates "
            "the matching principle and results in periods with artificially high or low "
            "margins."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material when timing differences affect reported gross margin by more than 2 percentage points.",
        "detection_logic": "COGS as % of revenue fluctuating significantly without product mix or pricing explanation; large COGS accruals or reversals near period end.",
        "potential_causes": [
            "Revenue recognized in one period, COGS recorded when invoiced in subsequent period",
            "Project costs accrued before revenue is recognized",
            "Year-end cost accruals reversed without corresponding revenue reversal",
        ],
        "suggested_procedures": [
            "Review COGS cutoff for consistency with revenue cutoff",
            "Test matching of revenue and COGS for a sample of transactions",
            "Identify any deferred costs that should be matched to deferred revenue",
        ],
        "suggested_ajes": [
            "Dr COGS / Cr Deferred COGS — to defer costs related to deferred revenue",
            "Dr Deferred COGS / Cr COGS — to recognize deferred costs when revenue is earned",
        ],
        "management_questions": [
            "Is COGS recognized at the same time as the corresponding revenue?",
            "Are there any projects with costs incurred before revenue recognition?",
            "How are period-end COGS accruals handled relative to revenue cutoff?",
        ],
        "affected_account_types": ["cogs", "revenue"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["cutoff", "matching", "accuracy"],
        "references": ["ASC 606-10-25", "Matching principle"],
        "sort_order": 80,
    },
]
