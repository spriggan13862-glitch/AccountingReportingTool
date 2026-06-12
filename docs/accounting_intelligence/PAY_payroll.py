"""Payroll — 8 issue templates (PAY_001–PAY_008)"""

PAYROLL = [
    {
        "code": "PAY_001",
        "category": "payroll",
        "subcategory": "ghost_employees",
        "issue_type": "fraud",
        "name": "Ghost Employee Payments",
        "description": (
            "Payroll payments are being made to fictitious employees who do not perform "
            "services for the company. Ghost employee schemes are a common payroll fraud "
            "that requires access to both HR (to add employees) and payroll (to process "
            "payments)."
        ),
        "risk_level": "critical",
        "materiality_note": "Any confirmed ghost employee is critical; indicates significant control failure.",
        "detection_logic": "Employees with no performance reviews, PTO usage, or benefits enrollment; employees with same address or bank account as other employees; terminated employees still receiving pay.",
        "potential_causes": [
            "Same person controls HR employee master and payroll processing",
            "No periodic headcount reconciliation to payroll",
            "Terminated employees not removed from payroll timely",
        ],
        "suggested_procedures": [
            "Compare payroll register to HR employee file; identify discrepancies",
            "Verify that all employees in payroll are still active in HR system",
            "Test terminated employees for payments after termination date",
            "Assess segregation of duties over employee setup and payroll processing",
        ],
        "suggested_ajes": [
            "Dr Fraud Loss / Cr Cash — to record identified ghost employee payments",
        ],
        "management_questions": [
            "Who adds new employees to the payroll system? Who approves?",
            "Is there a process to remove terminated employees from payroll on termination date?",
            "Is payroll reconciled to headcount each period?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["occurrence", "existence"],
        "references": ["AU-C 240", "ACFE Fraud Tree — Payroll Fraud"],
        "sort_order": 10,
    },
    {
        "code": "PAY_002",
        "category": "payroll",
        "subcategory": "misclassification",
        "issue_type": "financial_analytics",
        "name": "Employee vs. Independent Contractor Misclassification",
        "description": (
            "Workers who should be classified as employees are treated as independent "
            "contractors, resulting in understated payroll taxes, benefits costs, and "
            "potential employment law violations. IRS and state agencies actively "
            "scrutinize worker classification. Misclassification creates significant "
            "back-tax and penalty exposure."
        ),
        "risk_level": "high",
        "materiality_note": "Cumulative payroll tax exposure and potential penalties can be material.",
        "detection_logic": "1099 payments to workers with characteristics of employees: exclusive service, company-directed work, use of company tools.",
        "potential_causes": [
            "Workers misclassified to avoid payroll taxes and benefits",
            "Outdated classification not revisited as worker relationships evolved",
            "Use of 1099 classification based on worker's preference rather than IRS criteria",
        ],
        "suggested_procedures": [
            "Apply IRS 20-factor test or ABC test to significant contractor relationships",
            "Identify workers exclusive to the company or working under direct supervision",
            "Quantify back payroll tax exposure including penalties",
            "Assess IRS voluntary classification settlement program (VCSP) eligibility",
        ],
        "suggested_ajes": [
            "Dr Payroll Tax Expense / Cr Payroll Tax Liability — to accrue reclassification exposure",
        ],
        "management_questions": [
            "Are contractor relationships reviewed for proper classification?",
            "Are any contractors working exclusively for the company under direct supervision?",
            "Have any state or federal agencies challenged any contractor classifications?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["accuracy", "completeness"],
        "references": ["IRS Rev. Rul. 87-41", "IRC Section 3401", "FLSA"],
        "sort_order": 20,
    },
    {
        "code": "PAY_003",
        "category": "payroll",
        "subcategory": "overtime",
        "issue_type": "financial_analytics",
        "name": "Overtime Pay Misclassification — FLSA Compliance Risk",
        "description": (
            "Employees who should be classified as non-exempt (entitled to overtime pay) "
            "are classified as exempt, or overtime calculations are incorrect. FLSA "
            "compliance failures expose the entity to back-pay claims, penalties, and "
            "class action litigation."
        ),
        "risk_level": "moderate",
        "materiality_note": "Cumulative back-pay exposure can be material in labor-intensive businesses.",
        "detection_logic": "Non-management employees classified as exempt; salary threshold below current FLSA minimum; duties test not met for exempt classification.",
        "potential_causes": [
            "Job titles used as proxy for exempt classification without duties test",
            "Salary threshold ($684/week as of 2024) not met for exemption",
            "Non-management employees classified exempt to avoid overtime premium",
        ],
        "suggested_procedures": [
            "Review all exempt employee classifications against FLSA duties tests",
            "Verify salary threshold compliance for each exempt employee",
            "Estimate overtime exposure for misclassified employees",
            "Review recent FLSA litigation trends in the industry",
        ],
        "suggested_ajes": [
            "Dr Wage Expense / Cr Accrued Wages — to accrue identified overtime obligations",
        ],
        "management_questions": [
            "How are employee exemption classifications determined and documented?",
            "Are any employees classified as exempt who perform non-managerial duties?",
            "Has there been any DOL audit or employee complaint regarding overtime?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["completeness", "accuracy"],
        "references": ["FLSA Section 13(a)(1)", "29 CFR Part 541"],
        "sort_order": 30,
    },
    {
        "code": "PAY_004",
        "category": "payroll",
        "subcategory": "bonuses",
        "issue_type": "qoe",
        "name": "Bonus Expense Anomaly — Inflated or Discretionary Timing",
        "description": (
            "Bonus expense is unusually high, concentrated near period end, or paid "
            "to owner/related parties in amounts inconsistent with market rates. "
            "In QoE and SBA contexts, excess owner compensation and discretionary "
            "bonuses are key add-back items that affect normalized EBITDA."
        ),
        "risk_level": "moderate",
        "materiality_note": "Always evaluate in transaction context; any excess owner bonus is a QoE add-back.",
        "detection_logic": "Bonus expense as % of revenue unusually high; bonuses concentrated in the acquisition or loan application period; large owner bonuses in a loss year.",
        "potential_causes": [
            "Large owner bonus to minimize taxable income before transaction",
            "Discretionary bonuses not based on performance criteria",
            "Bonuses accrued but not paid, creating liability without cash impact",
            "Year-end bonus timing adjusted to manage reported results",
        ],
        "suggested_procedures": [
            "Obtain bonus detail by recipient; assess market reasonableness",
            "Compare owner compensation to market benchmarks for role and company size",
            "Identify bonuses paid to related parties",
            "Assess whether bonuses are recurring vs. one-time",
        ],
        "suggested_ajes": [
            "Dr Retained Earnings / Cr Owner Compensation — to normalize excess owner compensation in QoE",
        ],
        "management_questions": [
            "What is the basis for bonus determinations? Are there formal plans?",
            "Were any discretionary bonuses paid in the period not linked to performance metrics?",
            "Is owner compensation benchmarked to market rates?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["occurrence", "accuracy"],
        "references": ["QoE best practices", "SBA SOP 50-10"],
        "sort_order": 40,
    },
    {
        "code": "PAY_005",
        "category": "payroll",
        "subcategory": "benefits",
        "issue_type": "financial_analytics",
        "name": "Employee Benefits Expense Understated",
        "description": (
            "Employee benefits costs (health insurance, 401(k) match, workers' "
            "compensation, unemployment insurance) are not fully accrued or are "
            "understated. Benefits represent a significant component of total "
            "compensation cost and must be accrued in the period earned."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material when benefits are a significant percentage of total compensation.",
        "detection_logic": "Benefits expense as % of payroll declining without reduction in benefit programs; 401(k) match or employer premiums not accrued.",
        "potential_causes": [
            "401(k) employer match accrued only when paid rather than when earned",
            "Workers' compensation premium audit adjustment not accrued",
            "Health insurance premium increases not reflected in accruals",
        ],
        "suggested_procedures": [
            "Compare benefits expense to prior periods and headcount",
            "Verify 401(k) match accrual against plan documents",
            "Confirm workers' compensation accruals reflect current claims",
        ],
        "suggested_ajes": [
            "Dr Benefits Expense / Cr Accrued Benefits — to record understated benefit obligations",
        ],
        "management_questions": [
            "Are 401(k) employer match obligations accrued in the period earned?",
            "Have there been any changes in health insurance premiums or benefit programs?",
            "Are workers' compensation accruals current?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["completeness", "accuracy"],
        "references": ["ASC 710-10", "ASC 712-10", "ASC 715-10"],
        "sort_order": 50,
    },
    {
        "code": "PAY_006",
        "category": "payroll",
        "subcategory": "timekeeping",
        "issue_type": "audit",
        "name": "Timekeeping and Hours Recording Controls Inadequate",
        "description": (
            "Manual timekeeping or weak controls over hours recording create risk of "
            "payroll fraud through falsified hours, buddy punching, or unauthorized "
            "overtime. Inadequate timekeeping also creates FLSA overtime calculation "
            "errors."
        ),
        "risk_level": "moderate",
        "materiality_note": "Evaluate based on size of hourly workforce and hours recording controls.",
        "detection_logic": "High percentage of manual time entries; overtime concentration in specific employees without operational explanation; time entries edited frequently.",
        "potential_causes": [
            "Manual timesheets without supervisory approval",
            "Electronic timekeeping bypass or override without controls",
            "Buddy punching without biometric verification",
        ],
        "suggested_procedures": [
            "Assess timekeeping system controls: biometric, badge, or manual",
            "Review overtime approvals for a sample of employees",
            "Identify instances of time entries edited after initial submission",
            "Compare hours worked to production or output metrics",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What system is used for timekeeping?",
            "How is overtime approved?",
            "Are time entries reviewed by supervisors before payroll processing?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["IncomeStatement"],
        "audit_assertions": ["occurrence", "accuracy"],
        "references": ["FLSA recordkeeping requirements", "COSO Control Activities"],
        "sort_order": 60,
    },
    {
        "code": "PAY_007",
        "category": "payroll",
        "subcategory": "garnishments",
        "issue_type": "audit",
        "name": "Wage Garnishments and Child Support Orders Not Properly Processed",
        "description": (
            "Court-ordered wage garnishments (child support, tax levies, creditor "
            "garnishments) are not being withheld and remitted as required. Failure "
            "to honor garnishment orders exposes the employer to penalties and "
            "contempt of court proceedings."
        ),
        "risk_level": "moderate",
        "materiality_note": "While dollar amounts may be immaterial, compliance failure creates legal exposure.",
        "detection_logic": "Active garnishment orders on file but no withholding in payroll records; remittances to garnishment recipients not matching withholding amounts.",
        "potential_causes": [
            "Garnishment order not communicated to payroll processor",
            "ERP garnishment module not configured for specific order",
            "Remittance to agency delayed beyond required deadline",
        ],
        "suggested_procedures": [
            "Obtain listing of all active garnishment orders",
            "Verify withholding in payroll records matches order amounts",
            "Confirm remittances are made to appropriate agencies within required timeframes",
        ],
        "suggested_ajes": [
            "Dr Garnishment Payable / Cr Cash — to record missed garnishment remittance",
        ],
        "management_questions": [
            "How are garnishment orders managed and tracked?",
            "Are garnishments withheld and remitted timely?",
            "Have there been any penalty notices from courts or agencies?",
        ],
        "affected_account_types": ["liability"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["completeness", "accuracy"],
        "references": ["Consumer Credit Protection Act", "CCPA Title III"],
        "sort_order": 70,
    },
    {
        "code": "PAY_008",
        "category": "payroll",
        "subcategory": "capitalized_labor",
        "issue_type": "financial_analytics",
        "name": "Labor Costs Over-Capitalized to Fixed Assets or Inventory",
        "description": (
            "Employee labor costs are being capitalized to fixed assets or inventory "
            "in excess of amounts that meet capitalization criteria. Over-capitalization "
            "defers expense recognition, inflating current period income while "
            "overstating long-term assets."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when capitalized labor exceeds 10% of total payroll without clear capital project justification.",
        "detection_logic": "Capitalized labor as % of total payroll significantly higher than prior periods or project activity; payroll expense declining despite stable headcount.",
        "potential_causes": [
            "Maintenance labor improperly classified as construction/betterment",
            "Non-qualifying activities included in capitalized projects",
            "Earnings management through aggressive capitalization",
        ],
        "suggested_procedures": [
            "Review capitalized labor by project; assess qualifying criteria",
            "Compare capitalized labor to total payroll; assess reasonableness",
            "Test that projects receiving capitalized labor are clearly capital in nature",
        ],
        "suggested_ajes": [
            "Dr Payroll Expense / Cr Fixed Asset or WIP — to reclassify over-capitalized labor",
        ],
        "management_questions": [
            "What percentage of payroll is being capitalized to projects or inventory?",
            "What controls exist to ensure only qualifying activities are capitalized?",
            "Has capitalized labor changed significantly from prior periods?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["accuracy", "valuation"],
        "references": ["ASC 360-10-25", "ASC 330-10-30-7"],
        "sort_order": 80,
    },
]
