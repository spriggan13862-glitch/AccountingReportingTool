"""Accrued Liabilities — 8 issue templates (ACL_001–ACL_008)"""

ACCRUED_LIABILITIES = [
    {
        "code": "ACL_001",
        "category": "accrued_liabilities",
        "subcategory": "accrued_expenses",
        "issue_type": "audit",
        "name": "Accrued Expenses Systematically Understated",
        "description": (
            "Recurring accrued expenses (legal fees, consulting, utilities, repairs) are "
            "recorded below the amounts that can be reasonably estimated from vendor "
            "relationships and prior-period patterns. Systematic understatement of "
            "accruals inflates net income each period."
        ),
        "risk_level": "high",
        "materiality_note": "Evaluate aggregate of all understated accruals against materiality threshold.",
        "detection_logic": "Total accrued liabilities declining as percentage of revenue without operational explanation; large true-up entries recorded in subsequent period.",
        "potential_causes": [
            "Accruals based on last invoice rather than estimated services rendered",
            "Period-end accrual estimation intentionally conservative to boost income",
            "Incomplete review of open purchase orders and contracts at period end",
        ],
        "suggested_procedures": [
            "Obtain listing of all recurring vendor relationships; estimate accrual for uninvoiced activity",
            "Compare actual expenses booked in subsequent period to prior-period accruals",
            "Analyze accrual true-up entries for patterns of consistent understatement",
            "Review attorney letters and consulting agreements for period-end obligations",
        ],
        "suggested_ajes": [
            "Dr Operating Expense / Cr Accrued Liabilities — to record understated accruals",
        ],
        "management_questions": [
            "What process is used to identify uninvoiced services at period end?",
            "Are there any open contracts or projects for which no accrual has been recorded?",
            "How are recurring accruals (legal, consulting, utilities) estimated each period?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["completeness", "valuation", "cutoff"],
        "references": ["ASC 420-10", "AU-C 560"],
        "sort_order": 10,
    },
    {
        "code": "ACL_002",
        "category": "accrued_liabilities",
        "subcategory": "warranty",
        "issue_type": "financial_analytics",
        "name": "Warranty Reserve Inadequate or Not Recorded",
        "description": (
            "Product warranty obligations are not adequately reserved. Under ASC 460, "
            "the estimated cost of warranty obligations must be accrued at the time of "
            "sale. An inadequate reserve understates liabilities and inflates income in "
            "the period of sale."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when warranty claims paid in subsequent periods consistently exceed the reserve.",
        "detection_logic": "Product revenue growing without proportional warranty reserve growth; warranty claim payments exceeding accrual replenishment.",
        "potential_causes": [
            "Reserve rate not updated for changes in product quality or claim rates",
            "New product warranty terms not incorporated in reserve calculation",
            "Extended warranty sold but not separately deferred",
            "Known product defects not reflected in reserve",
        ],
        "suggested_procedures": [
            "Obtain warranty claims paid for trailing 12 months; calculate actual claim rate",
            "Compare actual claim rate to reserve accrual rate",
            "Review product quality reports or customer service data for emerging issues",
            "Verify that extended warranties are deferred and recognized ratably",
        ],
        "suggested_ajes": [
            "Dr Warranty Expense / Cr Accrued Warranty Liability — to increase reserve",
        ],
        "management_questions": [
            "What is the historical warranty claim rate by product line?",
            "Are there any known product quality issues that may increase warranty claims?",
            "How are extended warranty obligations tracked and deferred?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["completeness", "valuation", "accuracy"],
        "references": ["ASC 460-10-25-5", "ASC 460-10-30"],
        "sort_order": 20,
    },
    {
        "code": "ACL_003",
        "category": "accrued_liabilities",
        "subcategory": "compensation",
        "issue_type": "audit",
        "name": "Accrued Compensation and Benefits Understated",
        "description": (
            "Accruals for earned but unpaid compensation (salary, wages, bonuses, "
            "commissions, vacation pay) are understated at period end. Employees "
            "have earned these amounts; failure to accrue understates both expense "
            "and liabilities."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material when understated compensation exceeds one payroll cycle for significant employee groups.",
        "detection_logic": "Payroll expense unusually low in the last period; large payroll true-up entries in subsequent period; accrued payroll as days of payroll below normal.",
        "potential_causes": [
            "Payroll accrual not adjusted for partial payroll period at period end",
            "Bonus accrual not recorded until board approval",
            "Commission accruals based on invoiced sales rather than earned commissions",
            "Vacation accrual not updated for current balances",
        ],
        "suggested_procedures": [
            "Calculate days of payroll accrual needed for partial period; compare to recorded accrual",
            "Verify bonus and commission accruals against plan documents and earned amounts",
            "Confirm vacation and PTO liability calculation reflects current balances",
        ],
        "suggested_ajes": [
            "Dr Salary/Wage Expense / Cr Accrued Compensation — to record earned but unpaid wages",
            "Dr Bonus Expense / Cr Accrued Bonus — to accrue earned bonuses",
        ],
        "management_questions": [
            "Are payroll accruals adjusted for days worked but not yet paid at period end?",
            "When are bonuses accrued — at the time earned or at the time approved/paid?",
            "Are vacation and PTO accruals updated each period?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["completeness", "cutoff", "accuracy"],
        "references": ["ASC 420-10", "ASC 712-10", "ASC 710-10"],
        "sort_order": 30,
    },
    {
        "code": "ACL_004",
        "category": "accrued_liabilities",
        "subcategory": "legal",
        "issue_type": "audit",
        "name": "Contingent Legal Liabilities Not Accrued",
        "description": (
            "Loss contingencies from pending litigation, regulatory actions, or tax "
            "disputes have not been accrued or disclosed. Under ASC 450, a loss "
            "contingency must be accrued when it is probable that a liability has been "
            "incurred and the amount can be reasonably estimated."
        ),
        "risk_level": "high",
        "materiality_note": "Always high when pending litigation involves material amounts; qualitative disclosure required for reasonably possible losses.",
        "detection_logic": "Attorney letters reference pending litigation without corresponding accrual; sudden appearance of legal expenses without prior accrual.",
        "potential_causes": [
            "Management belief that loss is not probable despite attorney advice",
            "Ongoing settlement negotiations creating accrual uncertainty",
            "Tax contingencies not disclosed pending examination",
        ],
        "suggested_procedures": [
            "Send attorney letters to all outside counsel requesting contingency status update",
            "Evaluate probability of loss and estimate range of outcomes",
            "Accrue when probable and estimable; disclose when reasonably possible",
            "Obtain management representation regarding undisclosed contingencies",
        ],
        "suggested_ajes": [
            "Dr Legal Expense / Cr Accrued Legal Liability — to record probable loss contingency",
        ],
        "management_questions": [
            "Are there any pending lawsuits, claims, or regulatory actions against the company?",
            "Have outside counsel provided any opinions on likely outcomes?",
            "Are there any pending tax examinations or assessments?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["completeness", "valuation"],
        "references": ["ASC 450-20-25-2", "AU-C 501", "AU-C 560"],
        "sort_order": 40,
    },
    {
        "code": "ACL_005",
        "category": "accrued_liabilities",
        "subcategory": "restructuring",
        "issue_type": "audit",
        "name": "Restructuring Charges Recorded Prematurely or Incorrectly",
        "description": (
            "Restructuring charges are recorded before the criteria for recognition are "
            "met under ASC 420, or are recorded in the wrong period. Common errors "
            "include accruing future period costs, recording exit costs before commitment, "
            "or using restructuring as a big-bath to shift expenses across periods."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag any restructuring accruals; requires specific criteria under ASC 420.",
        "detection_logic": "Large one-time restructuring accruals near period end; restructuring liability not utilized in subsequent periods.",
        "potential_causes": [
            "Exit cost accrual before formal plan meeting ASC 420 criteria",
            "Future period operating costs included in restructuring reserve",
            "Big-bath: inflating current period charges to clean up future periods",
        ],
        "suggested_procedures": [
            "Verify that restructuring plan meets one-time termination benefit or exit cost criteria",
            "Confirm communication to affected employees has occurred",
            "Review subsequent period utilization of restructuring reserve",
            "Assess whether future operating costs are improperly included",
        ],
        "suggested_ajes": [
            "Dr Restructuring Reserve / Cr Gain — to reverse prematurely recognized charges",
        ],
        "management_questions": [
            "Has a formal restructuring plan been approved by management and communicated to employees?",
            "What specific costs are included in the restructuring accrual?",
            "What is the timeline for executing the restructuring plan?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["cutoff", "completeness", "accuracy"],
        "references": ["ASC 420-10-25-4", "ASC 420-10-30"],
        "sort_order": 50,
    },
    {
        "code": "ACL_006",
        "category": "accrued_liabilities",
        "subcategory": "tax",
        "issue_type": "audit",
        "name": "Accrued Income Tax Liability Misstated",
        "description": (
            "The current income tax liability is materially misstated due to errors in "
            "the provision calculation, misclassification of deferred tax items, or "
            "failure to accrue for uncertain tax positions (UTPs) under ASC 740-10."
        ),
        "risk_level": "high",
        "materiality_note": "Material when misstatement affects effective tax rate by more than 2 percentage points or affects pre/post-tax income classification.",
        "detection_logic": "Effective tax rate inconsistent with statutory rates; large prior-year tax adjustments; no UTP reserve despite audit history.",
        "potential_causes": [
            "Estimated tax payments not properly reconciled to current provision",
            "Deferred tax asset/liability calculation errors",
            "Uncertain tax positions not evaluated under ASC 740-10 MLRE threshold",
            "State and local tax obligations not fully captured",
        ],
        "suggested_procedures": [
            "Reconcile book income to taxable income for current period",
            "Verify deferred tax calculations for temporary differences",
            "Review uncertain tax positions; apply more-likely-than-not recognition threshold",
            "Reconcile tax payments to current tax liability",
        ],
        "suggested_ajes": [
            "Dr/Cr Income Tax Expense / Cr/Dr Accrued Income Tax — to correct provision",
        ],
        "management_questions": [
            "Are all federal, state, and local tax obligations current?",
            "Are there any open tax examinations or years under audit?",
            "Are uncertain tax positions tracked and evaluated under ASC 740-10?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["completeness", "valuation", "accuracy"],
        "references": ["ASC 740-10-25", "ASC 740-10-30", "FIN 48"],
        "sort_order": 60,
    },
    {
        "code": "ACL_007",
        "category": "accrued_liabilities",
        "subcategory": "customer_deposits",
        "issue_type": "balance_sheet",
        "name": "Customer Deposits and Advance Payments Misclassified as Revenue",
        "description": (
            "Customer deposits and advance payments that create a performance obligation "
            "are recorded as revenue instead of deferred revenue (a liability). Until the "
            "performance obligation is satisfied, these amounts represent a liability to "
            "the customer, not earned income."
        ),
        "risk_level": "high",
        "materiality_note": "Material when misclassified amounts cause revenue to appear higher than earned.",
        "detection_logic": "Cash received from customers without corresponding revenue performance; large advance payments near period end booked to revenue.",
        "potential_causes": [
            "Deposits treated as non-refundable and recognized immediately",
            "Advance billing for future-period services recognized on invoice date",
            "ERP configured to credit revenue on cash receipt rather than delivery",
        ],
        "suggested_procedures": [
            "Review terms of advance payment arrangements for refundability and performance triggers",
            "Confirm that performance has been rendered before revenue is recognized",
            "Reconcile deferred revenue roll-forward",
        ],
        "suggested_ajes": [
            "Dr Revenue / Cr Deferred Revenue (Customer Deposits) — to defer revenue until earned",
        ],
        "management_questions": [
            "Are customer deposits refundable? Under what conditions?",
            "At what point are advance payments recognized as revenue?",
            "Is there a separate deferred revenue account for customer advances?",
        ],
        "affected_account_types": ["liability", "revenue"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["cutoff", "completeness", "accuracy"],
        "references": ["ASC 606-10-45-1", "ASC 606-10-55-48"],
        "sort_order": 70,
    },
    {
        "code": "ACL_008",
        "category": "accrued_liabilities",
        "subcategory": "self_insurance",
        "issue_type": "financial_analytics",
        "name": "Self-Insurance Reserves Inadequate",
        "description": (
            "The company self-insures for health, workers' compensation, or general "
            "liability risks but has not adequately reserved for incurred but not "
            "reported (IBNR) claims. Inadequate self-insurance reserves understate "
            "liabilities and overstate income."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when self-insurance retention is material relative to operating expenses.",
        "detection_logic": "Self-insurance stop-loss retention in place without corresponding IBNR reserve; actual claims paid consistently exceeding reserve replenishment.",
        "potential_causes": [
            "IBNR reserve not independently calculated",
            "Reserve based on paid claims only, ignoring claim development patterns",
            "No actuarial review for self-insured programs",
        ],
        "suggested_procedures": [
            "Obtain claims development data for prior periods",
            "Compare IBNR reserve to paid claims pattern and retention amounts",
            "Assess whether independent actuarial estimate has been obtained",
            "Review stop-loss arrangement terms and coverage levels",
        ],
        "suggested_ajes": [
            "Dr Insurance Expense / Cr Self-Insurance Reserve — to increase IBNR reserve",
        ],
        "management_questions": [
            "How is the self-insurance reserve calculated?",
            "Has an actuarial study been performed?",
            "What is the retention amount and stop-loss threshold?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["completeness", "valuation"],
        "references": ["ASC 450-20", "ASC 954-450"],
        "sort_order": 80,
    },
]
