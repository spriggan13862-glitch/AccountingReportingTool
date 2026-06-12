"""Industry-Specific — 4 issue templates (IND_001–IND_004)"""

INDUSTRY_SPECIFIC = [
    {
        "code": "IND_001",
        "category": "industry_specific",
        "subcategory": "construction",
        "issue_type": "financial_analytics",
        "name": "Construction: Percentage-of-Completion Method Errors",
        "description": (
            "Long-term construction contracts using the percentage-of-completion (POC) "
            "method have errors in the completion percentage calculation, cost-to-complete "
            "estimates, or recognition of contract losses. Errors in POC recognition "
            "significantly distort revenue and margins for construction entities."
        ),
        "risk_level": "high",
        "materiality_note": "Material for any construction entity with significant long-term contracts.",
        "detection_logic": "Contract assets growing disproportionately; gross margin on contracts deviating from estimates; overbilling or underbilling concentration.",
        "potential_causes": [
            "Completion percentage based on cost incurred without considering total cost-to-complete",
            "Change orders not reflected in completion percentage",
            "Contract losses not recognized when known loss is probable",
        ],
        "suggested_procedures": [
            "Obtain project-level cost and billing summaries",
            "Recalculate POC using costs incurred / total estimated costs",
            "Identify contracts with expected losses; accrue loss immediately",
            "Reconcile overbilling (contract liability) and underbilling (contract asset) totals",
        ],
        "suggested_ajes": [
            "Dr Contract Loss / Cr Contract Loss Reserve — to record probable contract losses",
        ],
        "management_questions": [
            "How is the percentage of completion calculated for each project?",
            "Are there any contracts expected to result in a loss at completion?",
            "Are cost-to-complete estimates reviewed by project managers?",
        ],
        "affected_account_types": ["revenue", "asset", "liability"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["accuracy", "valuation", "completeness"],
        "references": ["ASC 606-10-25-27", "ASC 606-10-55-13"],
        "sort_order": 10,
    },
    {
        "code": "IND_002",
        "category": "industry_specific",
        "subcategory": "healthcare",
        "issue_type": "financial_analytics",
        "name": "Healthcare: Third-Party Payer Contractual Adjustments Understated",
        "description": (
            "Healthcare entities record gross charges and must estimate contractual "
            "adjustments for Medicare, Medicaid, and commercial insurance to arrive "
            "at net patient revenue. Understated contractual adjustments overstate "
            "net revenue. Collection rates by payer class must be accurately modeled."
        ),
        "risk_level": "high",
        "materiality_note": "Material for any healthcare entity with significant third-party payer revenue.",
        "detection_logic": "Net collection rate increasing without corresponding improvement in payer mix; days in AR increasing; contractual adjustment percentages declining.",
        "potential_causes": [
            "Contractual adjustment rates not updated for payer contract changes",
            "New payer contracts at lower reimbursement rates without corresponding adjustment",
            "Collection rate model not updated for denial rate changes",
        ],
        "suggested_procedures": [
            "Obtain payer analysis: charges, adjustments, and collections by payer class",
            "Compare contractual adjustment rates to prior periods and payer contracts",
            "Test net collection rates against subsequent period actual collections",
        ],
        "suggested_ajes": [
            "Dr Contractual Adjustments (contra-revenue) / Cr Revenue — to increase adjustments",
        ],
        "management_questions": [
            "When were contractual adjustment rates last updated for each payer?",
            "Have any payer contracts been renegotiated at different rates?",
            "What is the denial rate by payer and is this reflected in revenue estimates?",
        ],
        "affected_account_types": ["revenue"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["valuation", "accuracy"],
        "references": ["ASC 606-10-32-8", "HFMA guidance on contractual adjustments"],
        "sort_order": 20,
    },
    {
        "code": "IND_003",
        "category": "industry_specific",
        "subcategory": "real_estate",
        "issue_type": "financial_analytics",
        "name": "Real Estate: Capitalized Costs vs. Period Costs Classification",
        "description": (
            "Real estate development entities must carefully classify costs between "
            "land, development, and period costs. Incorrectly capitalizing carrying "
            "costs (property taxes, insurance, interest) after property is ready for "
            "its intended use, or capitalizing costs that are not directly attributable "
            "to development, overstates real estate assets."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material for real estate development entities with significant carrying costs.",
        "detection_logic": "Capitalized costs growing without active development activity; carrying costs capitalized beyond development completion date.",
        "potential_causes": [
            "Carrying costs capitalized after project is substantially complete",
            "Indirect costs allocated to development projects without appropriate basis",
            "Property taxes and insurance capitalized without development activity",
        ],
        "suggested_procedures": [
            "Confirm development stage and active use determination date",
            "Identify all capitalized carrying costs; assess qualification",
            "Cease capitalization when property is ready for its intended use",
        ],
        "suggested_ajes": [
            "Dr Operating Expense / Cr Real Estate Development Asset — to expense post-completion carrying costs",
        ],
        "management_questions": [
            "When did active development cease on each project?",
            "Are carrying costs still being capitalized after development completion?",
            "Is there a formal tracking of project stages for capitalization purposes?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["valuation", "accuracy"],
        "references": ["ASC 970-360-25", "ASC 835-20-25-1"],
        "sort_order": 30,
    },
    {
        "code": "IND_004",
        "category": "industry_specific",
        "subcategory": "saas",
        "issue_type": "financial_analytics",
        "name": "SaaS: Contract Acquisition Costs and Deferred Revenue Accounting",
        "description": (
            "SaaS entities face specific accounting challenges: deferred revenue "
            "recognition over contract periods, capitalization of contract acquisition "
            "costs (commissions) under ASC 340-40, and presentation of key SaaS metrics "
            "(ARR, MRR, NRR). Errors in these areas significantly distort both financial "
            "statements and operational metrics."
        ),
        "risk_level": "high",
        "materiality_note": "Material for SaaS entities; affects all key financial and operational metrics.",
        "detection_logic": "Commission expense growing faster than ARR; deferred revenue not reconciling to contract values; recognized revenue exceeding contracted amounts.",
        "potential_causes": [
            "Commissions expensed immediately rather than amortized over customer life",
            "Annual contracts billed upfront but not deferred and recognized ratably",
            "Usage-based revenue recognized before usage occurs",
            "Churn not reflected in deferred revenue reductions",
        ],
        "suggested_procedures": [
            "Prepare deferred revenue roll-forward by customer cohort",
            "Verify ratable recognition of upfront billings",
            "Assess commission capitalization under ASC 340-40",
            "Calculate ARR, MRR, and NRR from contract data; compare to reported metrics",
        ],
        "suggested_ajes": [
            "Dr Revenue / Cr Deferred Revenue — to defer revenue not yet earned",
            "Dr Deferred Commission / Cr Commission Expense — to capitalize qualifying commissions",
        ],
        "management_questions": [
            "Are sales commissions capitalized and amortized under ASC 340-40?",
            "Is annual subscription revenue recognized ratably over the contract period?",
            "How is ARR calculated and reconciled to the general ledger?",
        ],
        "affected_account_types": ["revenue", "liability", "asset"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["accuracy", "completeness", "valuation"],
        "references": ["ASC 606-10-25", "ASC 340-40-25-1", "SaaS metrics best practices"],
        "sort_order": 40,
    },
    {
        "code": "IND_005",
        "category": "industry_specific",
        "subcategory": "restaurant_retail",
        "issue_type": "financial_analytics",
        "name": "Restaurant/Retail: Gift Card Breakage Revenue Not Properly Recognized",
        "description": (
            "Gift cards (stored-value instruments) sold but never redeemed ('breakage') "
            "must be recognized as revenue in proportion to the pattern of redemptions "
            "under ASC 606, or ratably over the estimated redemption period. Recognizing "
            "breakage immediately or too slowly distorts revenue."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material for restaurant and retail entities with significant gift card programs.",
        "detection_logic": "Gift card deferred revenue balance growing without ratable breakage recognition; breakage recognized in lump sum rather than proportionally.",
        "potential_causes": [
            "Breakage recognized immediately on sale rather than proportionally",
            "Breakage rate assumptions not updated for current redemption patterns",
            "State escheatment laws requiring remittance not considered",
        ],
        "suggested_procedures": [
            "Obtain gift card issuance and redemption history",
            "Calculate breakage rate from historical data",
            "Verify ratable recognition over redemption pattern",
            "Assess state escheatment obligations for unredeemed amounts",
        ],
        "suggested_ajes": [
            "Dr Deferred Revenue / Cr Revenue — to recognize ratable breakage",
        ],
        "management_questions": [
            "How is gift card breakage estimated and recognized?",
            "Are state escheatment requirements being met for unredeemed gift cards?",
            "Is the breakage rate based on current redemption patterns?",
        ],
        "affected_account_types": ["revenue", "liability"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["valuation", "accuracy"],
        "references": ["ASC 606-10-55-48", "ASC 606-10-55-49"],
        "sort_order": 50,
    },
    {
        "code": "IND_006",
        "category": "industry_specific",
        "subcategory": "professional_services",
        "issue_type": "financial_analytics",
        "name": "Professional Services: Work-in-Process Billing Lag and Realization Rate",
        "description": (
            "Professional services firms (law, accounting, consulting, staffing) "
            "must track work-in-process (WIP) at standard billing rates and apply "
            "write-down for expected realization below standard. A billing realization "
            "rate below 90% indicates write-downs that must be reflected in the WIP "
            "balance and revenue recognized."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material for professional services firms where WIP is significant relative to revenue.",
        "detection_logic": "WIP realization rate below 90%; billed revenue significantly below WIP at standard rates; write-down reserve on WIP insufficient.",
        "potential_causes": [
            "Fixed-fee engagements where hours exceed estimate without write-down",
            "Contingency matters where outcome affects collectibility",
            "Client relationship discounts systematically applied at billing but not reserved in WIP",
        ],
        "suggested_procedures": [
            "Obtain WIP aging by matter and professional",
            "Calculate realization rate: billed / WIP at standard",
            "Reserve WIP for expected write-downs based on historical realization",
            "Assess collectibility of billed AR by matter type",
        ],
        "suggested_ajes": [
            "Dr WIP Write-Down / Cr WIP Reserve — to reserve for expected realization shortfall",
        ],
        "management_questions": [
            "What is the firm's billing realization rate for the period?",
            "Are WIP balances reserved for anticipated write-downs at billing?",
            "Are there any contingency matters where WIP collectibility is uncertain?",
        ],
        "affected_account_types": ["asset", "revenue"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["valuation", "completeness"],
        "references": ["ASC 606-10-25", "Professional services industry guidance"],
        "sort_order": 60,
    },
]
