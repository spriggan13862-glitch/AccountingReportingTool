"""Financial Reporting — 6 issue templates (FR_001–FR_006)"""

FINANCIAL_REPORTING = [
    {
        "code": "FR_001",
        "category": "financial_reporting",
        "subcategory": "gaap_basis",
        "issue_type": "audit",
        "name": "Financial Statements Not Prepared on a Consistent Basis of Accounting",
        "description": (
            "Financial statements are not consistently prepared under an acceptable "
            "basis of accounting (GAAP, IFRS, or special purpose frameworks), or the "
            "basis changes between periods without disclosure. Inconsistent application "
            "makes period-to-period comparisons unreliable."
        ),
        "risk_level": "high",
        "materiality_note": "Always requires disclosure; material to any analysis relying on comparability.",
        "detection_logic": "Cash basis used for some periods, accrual for others; hybrid approach without disclosure.",
        "potential_causes": [
            "Tax return basis used for internal reporting without clear disclosure",
            "Mix of cash and accrual recognition without formal policy",
            "New accountant changed basis without disclosing the change",
        ],
        "suggested_procedures": [
            "Confirm stated basis of accounting in the financial statement header or notes",
            "Verify consistent application across all periods presented",
            "If modified cash basis, identify and disclose all modifications",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Are financial statements consistently prepared under the same basis of accounting?",
            "Has the basis of accounting changed in any period presented?",
            "Is the basis of accounting clearly stated in the financial statements?",
        ],
        "affected_account_types": ["revenue", "asset", "liability"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["consistency", "accuracy"],
        "references": ["ASC 105-10", "AICPA Statements on Standards for Accounting and Review Services"],
        "sort_order": 10,
    },
    {
        "code": "FR_002",
        "category": "financial_reporting",
        "subcategory": "comparative",
        "issue_type": "audit",
        "name": "Comparative Period Financial Statements Missing or Inconsistent",
        "description": (
            "Financial statements are presented without comparative prior period data, "
            "or prior period data has been restated without disclosure. Comparative "
            "statements are essential for trend analysis and are required in most "
            "audit and review engagements."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material when prior period comparatives are required by engagement or user needs.",
        "detection_logic": "Single-year financial statements without prior period; restatement of prior year without disclosure.",
        "potential_causes": [
            "Prior period records not available",
            "Management preference for single-year presentation",
            "Prior period error correction presented without restatement disclosure",
        ],
        "suggested_procedures": [
            "Obtain prior year financial statements",
            "Present comparative periods consistently",
            "Disclose any restatements or reclassifications in the comparative period",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "Are financial statements presented with prior period comparatives?",
            "Have any prior period amounts been restated? What was the reason?",
        ],
        "affected_account_types": ["revenue", "asset"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["consistency", "presentation"],
        "references": ["ASC 250-10-45", "AICPA AR Section 90"],
        "sort_order": 20,
    },
    {
        "code": "FR_003",
        "category": "financial_reporting",
        "subcategory": "internal_controls",
        "issue_type": "audit",
        "name": "Material Weakness in Internal Controls Over Financial Reporting",
        "description": (
            "One or more material weaknesses exist in internal controls over financial "
            "reporting. A material weakness is a deficiency that creates a reasonable "
            "possibility that a material misstatement will not be prevented or detected "
            "on a timely basis."
        ),
        "risk_level": "critical",
        "materiality_note": "Any material weakness is critical; must be communicated to those charged with governance.",
        "detection_logic": "No segregation of duties in accounting; no formal close process; no reconciliation controls; no management review.",
        "potential_causes": [
            "Small business with single accounting employee",
            "No formal month-end close process",
            "Owner override of controls without compensating controls",
            "No IT general controls over financial systems",
        ],
        "suggested_procedures": [
            "Document key financial reporting processes and controls",
            "Identify significant deficiencies and material weaknesses",
            "Assess compensating controls",
            "Communicate findings to management and governance",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What controls exist over the period-end close process?",
            "Who reviews journal entries and account reconciliations?",
            "Is there segregation of duties in the accounting function?",
        ],
        "affected_account_types": ["revenue", "asset", "liability"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["completeness", "accuracy"],
        "references": ["PCAOB AS 2201", "COSO 2013 Framework", "AU-C 265"],
        "sort_order": 30,
    },
    {
        "code": "FR_004",
        "category": "financial_reporting",
        "subcategory": "subsequent_events",
        "issue_type": "audit",
        "name": "Subsequent Events Not Evaluated or Disclosed",
        "description": (
            "Events occurring after the balance sheet date but before financial "
            "statement issuance have not been evaluated for disclosure or recognition. "
            "ASC 855 requires recognition of Type I events (conditions existing at period "
            "end confirmed by subsequent events) and disclosure of Type II events "
            "(new conditions arising after period end)."
        ),
        "risk_level": "moderate",
        "materiality_note": "Any material subsequent event requires disclosure or recognition.",
        "detection_logic": "Known post-period events (acquisitions, litigation, bankruptcies) without corresponding evaluation.",
        "potential_causes": [
            "No formal subsequent events inquiry process",
            "Accounting team not informed of post-close business events",
            "Type I/Type II classification not applied",
        ],
        "suggested_procedures": [
            "Perform subsequent events inquiry from balance sheet date to report date",
            "Obtain management representation regarding subsequent events",
            "Evaluate whether events require recognition (Type I) or disclosure (Type II)",
        ],
        "suggested_ajes": [
            "Dr/Cr as appropriate — for Type I subsequent events requiring recognition",
        ],
        "management_questions": [
            "Have there been any significant business events since the balance sheet date?",
            "Are there any acquisitions, disposals, or litigation developments after period end?",
            "Have any significant customer or vendor relationships changed since period end?",
        ],
        "affected_account_types": ["asset", "liability"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["completeness", "presentation"],
        "references": ["ASC 855-10-25", "ASC 855-10-55", "AU-C 560"],
        "sort_order": 40,
    },
    {
        "code": "FR_005",
        "category": "financial_reporting",
        "subcategory": "segment",
        "issue_type": "financial_analytics",
        "name": "Operating Segments Not Appropriately Disaggregated",
        "description": (
            "The entity operates in multiple distinct business segments or geographic "
            "areas but presents consolidated financials without segment-level "
            "disaggregation. ASC 280 requires segment reporting when the entity "
            "meets quantitative thresholds (10% of revenue, profit/loss, or assets)."
        ),
        "risk_level": "moderate",
        "materiality_note": "ASC 280 applies to public entities; relevant to private entities in M&A and QoE contexts for understanding segment profitability.",
        "detection_logic": "Multiple distinct business lines or geographies operated without segment-level reporting.",
        "potential_causes": [
            "Segment reporting requirement not evaluated",
            "Management believes entity is single-segment without formal analysis",
        ],
        "suggested_procedures": [
            "Identify operating segments using management approach (CODM decision-making)",
            "Apply quantitative thresholds to determine reportable segments",
            "Prepare segment-level revenue and profit disclosure",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "How does management review business performance internally? By product line? Geography?",
            "Are there distinct business units with different customer bases, cost structures, or management?",
        ],
        "affected_account_types": ["revenue"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["presentation", "completeness"],
        "references": ["ASC 280-10-50-1", "ASC 280-10-10-1"],
        "sort_order": 50,
    },
    {
        "code": "FR_006",
        "category": "financial_reporting",
        "subcategory": "compilation_vs_audit",
        "issue_type": "audit",
        "name": "Engagement Level Inappropriate for User Reliance",
        "description": (
            "Financial statements are prepared as a compilation but are being relied "
            "upon by lenders, investors, or buyers as if they were reviewed or audited. "
            "Compilation provides no assurance; review provides limited assurance; "
            "audit provides reasonable assurance. The level of assurance should match "
            "the reliance level."
        ),
        "risk_level": "high",
        "materiality_note": "Misrepresenting the level of assurance is a serious issue; material for any third-party reliance.",
        "detection_logic": "SBA loan or significant acquisition financed with compilation-level financials; engagement letter for compilation but referred to as audited.",
        "potential_causes": [
            "Cost constraints limiting engagement level",
            "User not aware of the difference between compilation and audit",
            "Engagement level misrepresented to lender or buyer",
        ],
        "suggested_procedures": [
            "Confirm that the accountant's report clearly states the engagement level",
            "Assess whether users understand the assurance level",
            "Recommend upgrading engagement level if user reliance requires higher assurance",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What level of assurance do the financial statements carry (compilation, review, or audit)?",
            "Are users aware of the engagement level and its implications?",
            "Is an upgrade to a higher assurance level warranted?",
        ],
        "affected_account_types": ["revenue", "asset"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["presentation"],
        "references": ["AICPA SSARS No. 21", "AU-C 200", "AICPA AR Sections"],
        "sort_order": 60,
    },
]
