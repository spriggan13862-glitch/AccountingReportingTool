"""Fixed Assets — 8 issue templates (FA_001–FA_008)"""

FIXED_ASSETS = [
    {
        "code": "FA_001",
        "category": "fixed_assets",
        "subcategory": "capitalization",
        "issue_type": "financial_analytics",
        "name": "Improper Capitalization — Expenses Recorded as Fixed Assets",
        "description": (
            "Operating expenses are being capitalized as fixed assets, reducing current "
            "period expenses and inflating asset values. Items that do not meet the "
            "capitalization criteria (extending useful life, adding new capability) "
            "should be expensed when incurred."
        ),
        "risk_level": "high",
        "materiality_note": "Flag when repairs & maintenance or capitalized costs deviate significantly from historical patterns or when capitalization threshold is inconsistently applied.",
        "detection_logic": "Repairs and maintenance expense unusually low; fixed asset additions include items with short useful lives; capitalized amounts include items below stated capitalization threshold.",
        "potential_causes": [
            "Pressure to meet earnings targets by capitalizing expenses",
            "Capitalization threshold not consistently applied",
            "Routine maintenance recorded as betterment",
            "Software development costs capitalized that are research/maintenance",
        ],
        "suggested_procedures": [
            "Test a sample of fixed asset additions; verify nature, useful life, and capitalization criteria",
            "Compare repairs and maintenance expense to prior periods and revenue",
            "Verify capitalization threshold is consistently applied",
            "Review software development costs: only capitalize post-technological feasibility",
        ],
        "suggested_ajes": [
            "Dr Operating Expense / Cr Fixed Asset / Cr Accumulated Depreciation — to reclassify improper capitalizations",
        ],
        "management_questions": [
            "What is the capitalization threshold for fixed assets?",
            "How are repairs vs. betterments distinguished?",
            "Are there any items capitalized this period that are routine maintenance?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["valuation", "occurrence", "accuracy"],
        "references": ["ASC 360-10-25", "ASC 350-40"],
        "sort_order": 10,
    },
    {
        "code": "FA_002",
        "category": "fixed_assets",
        "subcategory": "depreciation",
        "issue_type": "financial_analytics",
        "name": "Depreciation Rate or Method Incorrect",
        "description": (
            "Fixed assets are being depreciated over incorrect useful lives, using "
            "an inappropriate method, or with incorrectly estimated salvage values. "
            "This misallocates costs across periods and may violate consistency "
            "requirements under ASC 250."
        ),
        "risk_level": "moderate",
        "materiality_note": "Evaluate the cumulative effect of incorrect depreciation on net asset value and income.",
        "detection_logic": "Depreciation as % of gross fixed assets inconsistent with stated policies; assets fully depreciated still in active use; asset additions with no corresponding depreciation.",
        "potential_causes": [
            "Useful lives not updated for changes in technology or operations",
            "Method changed without disclosure",
            "New asset additions not added to depreciation schedule",
            "Assets retired but not removed from depreciation schedule",
        ],
        "suggested_procedures": [
            "Recalculate depreciation for a sample of assets under stated policy",
            "Compare depreciation rates to industry norms and prior periods",
            "Verify assets still in use against depreciation schedule",
            "Test for assets that should have been retired",
        ],
        "suggested_ajes": [
            "Dr Depreciation Expense / Cr Accumulated Depreciation — to correct understatement",
            "Dr Accumulated Depreciation / Cr Gain on Asset — to correct over-depreciation",
        ],
        "management_questions": [
            "When were useful lives and salvage values last reviewed?",
            "Are any assets in active use that are fully depreciated?",
            "Has the depreciation method changed in any period?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["valuation", "accuracy", "consistency"],
        "references": ["ASC 360-10-35-4", "ASC 250-10-45-2"],
        "sort_order": 20,
    },
    {
        "code": "FA_003",
        "category": "fixed_assets",
        "subcategory": "impairment",
        "issue_type": "audit",
        "name": "Fixed Asset Impairment Not Recognized",
        "description": (
            "Fixed assets with indicators of impairment have not been tested and "
            "written down as required by ASC 360. Impairment indicators include "
            "significant decline in market value, adverse changes in the use of the "
            "asset, current-period operating losses, or expected disposal before the "
            "end of the original useful life."
        ),
        "risk_level": "high",
        "materiality_note": "Flag when assets with known impairment indicators have not been tested or written down.",
        "detection_logic": "Significant operational changes, facility closures, or market declines without corresponding impairment analysis.",
        "potential_causes": [
            "Management reluctance to recognize impairment losses",
            "Impairment trigger not identified by accounting team",
            "Cash flow projections too optimistic, preventing impairment trigger",
        ],
        "suggested_procedures": [
            "Review for impairment indicators: market decline, operational changes, expected disposal",
            "For impaired assets, compare undiscounted cash flows to carrying value (step 1)",
            "If step 1 triggered, calculate fair value and record impairment loss",
            "Assess whether disposal group accounting is needed for assets held-for-sale",
        ],
        "suggested_ajes": [
            "Dr Impairment Loss / Cr Accumulated Impairment — to record asset impairment",
        ],
        "management_questions": [
            "Are there any facilities being closed or assets being taken out of service?",
            "Have there been any significant declines in the business that would reduce the value of long-lived assets?",
            "Are there any assets expected to be disposed of before the end of their useful life?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["valuation", "completeness"],
        "references": ["ASC 360-10-35-15", "ASC 360-10-35-17"],
        "sort_order": 30,
    },
    {
        "code": "FA_004",
        "category": "fixed_assets",
        "subcategory": "retirement",
        "issue_type": "audit",
        "name": "Retired or Disposed Fixed Assets Still on Books",
        "description": (
            "Assets that have been sold, scrapped, or otherwise disposed of remain in "
            "the fixed asset register without removal. This overstates gross assets, "
            "accumulated depreciation, and may result in continued depreciation expense "
            "on non-existent assets."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when disposed assets exceed 5% of gross fixed assets.",
        "detection_logic": "Fixed asset register contains assets with acquisition dates well beyond average useful life still depreciating; physical verification identifies assets not present.",
        "potential_causes": [
            "No formal disposal authorization and derecognition process",
            "Scrapped assets informally removed from service without accounting entry",
            "Asset sales not communicated to accounting department",
        ],
        "suggested_procedures": [
            "Perform physical inspection of significant fixed asset locations",
            "Compare physical count to asset register; investigate missing items",
            "Review proceeds from asset sales; verify gain/loss calculation and derecognition",
        ],
        "suggested_ajes": [
            "Dr Accumulated Depreciation / Dr Loss on Disposal / Cr Fixed Asset — to remove retired assets",
            "Dr Cash / Cr Gain on Disposal — if proceeds were received for retired assets",
        ],
        "management_questions": [
            "Has a physical inspection of fixed assets been performed recently?",
            "What is the process for reporting disposed or scrapped assets to accounting?",
            "Are there any assets in the register that are no longer in service?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["existence", "completeness"],
        "references": ["ASC 360-10-40", "AU-C 501"],
        "sort_order": 40,
    },
    {
        "code": "FA_005",
        "category": "fixed_assets",
        "subcategory": "classification",
        "issue_type": "balance_sheet",
        "name": "Assets Held for Sale Not Reclassified to Current",
        "description": (
            "Assets that meet the criteria to be classified as held-for-sale under "
            "ASC 360-10-45-9 are still classified as long-term fixed assets. Held-for-sale "
            "assets must be reclassified to current assets and measured at the lower of "
            "carrying value or fair value less costs to sell, with no further depreciation."
        ),
        "risk_level": "moderate",
        "materiality_note": "Always reclassify when criteria met; material to working capital and liquidity presentation.",
        "detection_logic": "Management has approved sale plan for specific assets; assets are being marketed but not reclassified.",
        "potential_causes": [
            "Held-for-sale criteria not evaluated by accounting team",
            "Assets being sold incidentally without formal accounting review",
            "Sale plan approved but accounting team not notified",
        ],
        "suggested_procedures": [
            "Apply ASC 360 held-for-sale criteria: committed plan, available for immediate sale, active marketing, probable within 12 months",
            "Reclassify qualifying assets to current; cease depreciation",
            "Measure at lower of carrying value or fair value less costs to sell",
        ],
        "suggested_ajes": [
            "Dr Assets Held for Sale (Current) / Cr Fixed Assets — to reclassify",
            "Dr Impairment / Cr Assets Held for Sale — to write down to fair value less costs to sell",
        ],
        "management_questions": [
            "Are there any assets or business units currently being marketed for sale?",
            "Has management committed to a formal plan to sell any assets?",
            "Are any sales expected to close within 12 months?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["classification", "valuation", "presentation"],
        "references": ["ASC 360-10-45-9", "ASC 360-10-45-13"],
        "sort_order": 50,
    },
    {
        "code": "FA_006",
        "category": "fixed_assets",
        "subcategory": "capex_completeness",
        "issue_type": "financial_analytics",
        "name": "Capital Expenditure Significantly Below Depreciation — Underinvestment Risk",
        "description": (
            "Capital expenditures are materially below depreciation expense, indicating "
            "the entity is not replacing depreciating assets at the rate they are wearing "
            "out. This underinvestment may signal deferred maintenance, aging asset base, "
            "or financial constraint. It is a key indicator in QoE and lending analysis."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when CapEx/Depreciation ratio < 0.5 for two consecutive years.",
        "detection_logic": "CapEx/Depreciation ratio < 0.5; average asset age (Accumulated Depreciation/Annual Depreciation) increasing; gross fixed assets declining.",
        "potential_causes": [
            "Cash constraints preventing replacement of aging assets",
            "Business in run-off mode without reinvestment",
            "Deferred maintenance building future capital requirements",
            "Transition to asset-light model (legitimate operational change)",
        ],
        "suggested_procedures": [
            "Calculate CapEx/Depreciation ratio for current and prior 3 years",
            "Assess average asset age; compare to industry norms",
            "Obtain management's capital expenditure plan for next 12 months",
            "Evaluate whether deferred maintenance creates contingent liabilities",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What is the capital expenditure plan for the next 12 months?",
            "Are there deferred maintenance items that will require near-term capital investment?",
            "Has the asset base declined intentionally (asset-light strategy)?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "CashFlowStatement"],
        "audit_assertions": ["completeness", "valuation"],
        "references": ["QoE best practices", "SBA SOP 50-10"],
        "sort_order": 60,
    },
    {
        "code": "FA_007",
        "category": "fixed_assets",
        "subcategory": "internal_use_software",
        "issue_type": "financial_analytics",
        "name": "Internal-Use Software Capitalization Errors",
        "description": (
            "Internal-use software development costs are either improperly capitalized "
            "(preliminary project stage costs included) or improperly expensed "
            "(application development stage costs excluded). ASC 350-40 provides specific "
            "guidance on the three stages of software development and which costs qualify."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material when software development costs are a significant portion of operating expenses or fixed assets.",
        "detection_logic": "Inconsistent treatment of software development costs; all costs expensed or all costs capitalized without stage analysis.",
        "potential_causes": [
            "Preliminary project costs (research, evaluation) capitalized",
            "Post-implementation costs (maintenance, training) capitalized",
            "Application development costs expensed",
            "No formal tracking of stage-by-stage costs",
        ],
        "suggested_procedures": [
            "Obtain software development project documentation",
            "Apply ASC 350-40 three-stage framework; identify qualifying capitalized costs",
            "Verify preliminary and post-implementation costs are expensed",
            "Confirm amortization method and useful life are appropriate",
        ],
        "suggested_ajes": [
            "Dr Software Asset / Cr R&D Expense — to capitalize improperly expensed development costs",
            "Dr R&D Expense / Cr Software Asset — to expense improperly capitalized preliminary costs",
        ],
        "management_questions": [
            "How are software development costs tracked by project stage?",
            "Are preliminary project and post-implementation costs separately identified?",
            "What is the amortization period for capitalized software?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["valuation", "accuracy", "completeness"],
        "references": ["ASC 350-40-25", "ASC 350-40-35"],
        "sort_order": 70,
    },
    {
        "code": "FA_008",
        "category": "fixed_assets",
        "subcategory": "asset_retirement",
        "issue_type": "audit",
        "name": "Asset Retirement Obligation Not Recorded",
        "description": (
            "A legal obligation associated with the retirement of a long-lived asset "
            "(e.g., environmental cleanup, lease restoration, decommissioning) has not "
            "been recorded as an asset retirement obligation (ARO) under ASC 410. "
            "An unrecorded ARO understates both the asset and the liability."
        ),
        "risk_level": "moderate",
        "materiality_note": "Flag when lease agreements, environmental permits, or regulatory requirements create retirement obligations.",
        "detection_logic": "Lease agreements require restoration; regulatory permits require environmental cleanup; no ARO recorded.",
        "potential_causes": [
            "Lease restoration clauses not identified by accounting team",
            "Environmental obligations not quantified or recorded",
            "ARO deemed immaterial without proper estimation",
        ],
        "suggested_procedures": [
            "Review lease agreements for restoration clauses",
            "Review environmental permits and regulatory requirements for retirement obligations",
            "Estimate fair value of retirement obligation using expected cash flow approach",
            "Record ARO at fair value with corresponding increase in asset cost",
        ],
        "suggested_ajes": [
            "Dr Fixed Asset (ARO Asset) / Cr Asset Retirement Obligation — to record initial ARO",
        ],
        "management_questions": [
            "Are there any legal obligations to restore leased facilities upon exit?",
            "Are there any environmental cleanup obligations associated with operations?",
            "Have any ARO obligations been identified and estimated?",
        ],
        "affected_account_types": ["asset", "liability"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["completeness", "valuation"],
        "references": ["ASC 410-20-25", "ASC 410-20-30"],
        "sort_order": 80,
    },
]
