"""Income Tax — 6 issue templates (TAX_001–TAX_006)"""

INCOME_TAX = [
    {
        "code": "TAX_001",
        "category": "income_tax",
        "subcategory": "deferred_tax",
        "issue_type": "financial_analytics",
        "name": "Deferred Tax Asset Valuation Allowance Incorrect",
        "description": (
            "A valuation allowance against deferred tax assets has not been established "
            "when it is more likely than not that some or all DTAs will not be realized, "
            "or an existing allowance is excessive. ASC 740 requires a valuation allowance "
            "when realization is not 'more likely than not' (> 50% probability)."
        ),
        "risk_level": "high",
        "materiality_note": "Material when DTAs are significant relative to total assets or when the allowance determination is borderline.",
        "detection_logic": "Large DTA balance with history of losses and no near-term taxable income expectation; or large valuation allowance released without corresponding improvement in business prospects.",
        "potential_causes": [
            "Projections of future taxable income overly optimistic",
            "Carryforward expiration dates not considered",
            "Tax planning strategies cited without detailed feasibility assessment",
            "Release of valuation allowance to manipulate earnings",
        ],
        "suggested_procedures": [
            "Obtain future taxable income projections; assess reasonableness with historical performance",
            "Evaluate the four sources of taxable income under ASC 740-10-30-18",
            "Determine whether a full or partial valuation allowance is required",
            "Assess whether any release of existing allowance is warranted by improved outlook",
        ],
        "suggested_ajes": [
            "Dr Income Tax Expense / Cr Valuation Allowance — to establish required allowance",
            "Dr Valuation Allowance / Cr Income Tax Benefit — to release excess allowance",
        ],
        "management_questions": [
            "What projections support the recoverability of deferred tax assets?",
            "Have there been any significant changes in business outlook that affect DTA recoverability?",
            "What tax planning strategies are available and have been evaluated?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["valuation", "completeness"],
        "references": ["ASC 740-10-30-17", "ASC 740-10-30-18"],
        "sort_order": 10,
    },
    {
        "code": "TAX_002",
        "category": "income_tax",
        "subcategory": "effective_rate",
        "issue_type": "financial_analytics",
        "name": "Effective Tax Rate Inconsistent with Expectations",
        "description": (
            "The effective income tax rate differs significantly from the blended "
            "statutory rate without adequate explanation. Unexplained ETR changes may "
            "indicate tax provision errors, unrecognized deferred taxes, or improper "
            "permanent difference accounting."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when ETR deviates more than 5 percentage points from expected rate without reconciling items.",
        "detection_logic": "Effective tax rate (Income Tax Expense / Pre-Tax Income) deviates significantly from 21% federal + state blended rate without disclosed reconciling items.",
        "potential_causes": [
            "Permanent differences not fully identified (meals, entertainment, stock comp)",
            "R&D tax credit or other credits not calculated",
            "State and local tax apportionment errors",
            "Domestic production deduction or other timing items",
        ],
        "suggested_procedures": [
            "Prepare rate reconciliation from statutory to effective rate",
            "Identify and quantify all permanent and temporary differences",
            "Verify that all available tax credits have been claimed",
            "Review state tax returns for apportionment consistency with book",
        ],
        "suggested_ajes": [
            "Dr/Cr Income Tax Expense / Cr/Dr Deferred Tax — based on specific reconciling items identified",
        ],
        "management_questions": [
            "Can you walk through the major items in the tax rate reconciliation?",
            "Are all available tax credits (R&D, work opportunity, etc.) being claimed?",
            "Are state and local tax obligations current?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["accuracy", "completeness"],
        "references": ["ASC 740-10-50-12", "ASC 740-10-55"],
        "sort_order": 20,
    },
    {
        "code": "TAX_003",
        "category": "income_tax",
        "subcategory": "uncertain_positions",
        "issue_type": "audit",
        "name": "Uncertain Tax Positions Not Evaluated Under ASC 740-10",
        "description": (
            "Tax return positions that are potentially subject to challenge have not "
            "been evaluated under ASC 740-10 (formerly FIN 48). A tax position must be "
            "recognized only when it is more likely than not to be sustained upon "
            "examination. Unrecognized UTPs understate the tax liability."
        ),
        "risk_level": "high",
        "materiality_note": "Material for entities with aggressive tax positions or history of IRS examination.",
        "detection_logic": "No UTP reserve despite aggressive tax positions, intercompany pricing, or open examination years.",
        "potential_causes": [
            "Aggressive positions taken without UTP analysis",
            "Transfer pricing positions not evaluated",
            "R&D credit claims not reviewed for technical defensibility",
            "State nexus positions not assessed",
        ],
        "suggested_procedures": [
            "Identify all potentially uncertain tax positions",
            "Apply two-step recognition and measurement under ASC 740-10",
            "Document MLRE threshold analysis for each position",
            "Quantify and record UTPs",
        ],
        "suggested_ajes": [
            "Dr Income Tax Expense / Cr Liability for Uncertain Tax Positions — to record UTP reserve",
        ],
        "management_questions": [
            "Are there any tax positions that could be challenged by taxing authorities?",
            "Are there any open examination years?",
            "Have transfer pricing policies been reviewed?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["completeness", "valuation"],
        "references": ["ASC 740-10-25-6", "ASC 740-10-30-7", "FIN 48"],
        "sort_order": 30,
    },
    {
        "code": "TAX_004",
        "category": "income_tax",
        "subcategory": "nexus",
        "issue_type": "financial_analytics",
        "name": "State and Local Tax Nexus Exposure Not Addressed",
        "description": (
            "The entity has sales, employees, or property creating tax nexus in states "
            "where it is not registered and not filing returns. Post-Wayfair, economic "
            "nexus thresholds ($100K sales or 200 transactions) apply in most states. "
            "Unaddressed nexus creates liability for back taxes, penalties, and interest."
        ),
        "risk_level": "high",
        "materiality_note": "Cumulative exposure can be material; accrual required once exposure is identified.",
        "detection_logic": "Remote employees or significant sales in states where no tax return is filed; sales tax collected but no sales tax registration.",
        "potential_causes": [
            "Remote workforce expansion creating payroll nexus",
            "E-commerce sales crossing economic nexus thresholds",
            "No nexus study performed following business expansion",
        ],
        "suggested_procedures": [
            "Perform nexus study for all states where employees, sales, or property exist",
            "Compare filing states to nexus study results",
            "Quantify back tax exposure; assess voluntary disclosure options",
            "Register in non-compliant nexus states",
        ],
        "suggested_ajes": [
            "Dr State Tax Expense / Cr State Tax Liability — to accrue identified nexus exposure",
        ],
        "management_questions": [
            "In which states does the company have employees, offices, or significant sales?",
            "Has a state nexus study been performed?",
            "Are there any states where you may owe sales or income tax?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["completeness", "valuation"],
        "references": ["South Dakota v. Wayfair (2018)", "ASC 740-10"],
        "sort_order": 40,
    },
    {
        "code": "TAX_005",
        "category": "income_tax",
        "subcategory": "s_corp_distribution",
        "issue_type": "financial_analytics",
        "name": "S-Corp or Partnership Tax Distribution Obligations Not Accrued",
        "description": (
            "A pass-through entity (S-Corp, partnership, LLC) has not accrued "
            "tax distributions owed to owners for their share of taxable income. "
            "Tax distribution provisions in operating agreements typically require "
            "distributions to cover the owners' estimated tax obligations on "
            "allocated income."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material when allocated income is significant and tax distribution obligations are unaccrued.",
        "detection_logic": "Pass-through entity with significant taxable income but no accrued tax distributions; operating agreement contains tax distribution provisions.",
        "potential_causes": [
            "Tax distribution provision in operating agreement not monitored",
            "Cash distributions made without calculating tax distribution requirement",
            "Taxable income significantly exceeds book income (timing differences)",
        ],
        "suggested_procedures": [
            "Review operating agreement for tax distribution provisions",
            "Calculate taxable income allocated to each owner",
            "Accrue required tax distributions at applicable tax rates",
        ],
        "suggested_ajes": [
            "Dr Retained Earnings/Distributions / Cr Distributions Payable — to accrue required tax distributions",
        ],
        "management_questions": [
            "Does the operating agreement include tax distribution provisions?",
            "Have required tax distributions been calculated and distributed?",
            "Is the company's taxable income significantly different from book income?",
        ],
        "affected_account_types": ["equity", "liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["completeness", "accuracy"],
        "references": ["ASC 505-10", "Partnership Agreement provisions"],
        "sort_order": 50,
    },
    {
        "code": "TAX_006",
        "category": "income_tax",
        "subcategory": "payroll_tax",
        "issue_type": "audit",
        "name": "Payroll Tax Liabilities Unpaid or Mis-Filed",
        "description": (
            "Federal or state payroll tax deposits are delinquent, mis-filed, or "
            "not reconciled to payroll records. Delinquent payroll taxes are subject "
            "to significant penalties and trust fund recovery penalties against responsible "
            "persons. This is a serious compliance issue for lenders and acquirers."
        ),
        "risk_level": "critical",
        "materiality_note": "Any delinquent payroll taxes are critical; trust fund penalties can create personal liability for officers.",
        "detection_logic": "Payroll tax deposits not matching payroll register; IRS or state notices regarding delinquent filings.",
        "potential_causes": [
            "Cash flow constraints leading to deferral of deposits",
            "Payroll processor errors not caught",
            "941/940 filings not reconciled to W-2 totals",
        ],
        "suggested_procedures": [
            "Obtain IRS tax transcript for payroll tax periods",
            "Reconcile 941 deposits to payroll register by period",
            "Identify any delinquent deposits; quantify penalties and interest exposure",
            "Assess trust fund recovery penalty risk",
        ],
        "suggested_ajes": [
            "Dr Payroll Tax Expense / Cr Payroll Tax Liability — to record unaccrued payroll taxes",
        ],
        "management_questions": [
            "Are all federal and state payroll tax deposits current?",
            "Have 941 and 940 filings been timely filed?",
            "Have W-2 totals been reconciled to 941 filings?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["completeness", "accuracy"],
        "references": ["IRC Section 3402", "IRC Section 6672", "IRS Publication 15"],
        "sort_order": 60,
    },
]
