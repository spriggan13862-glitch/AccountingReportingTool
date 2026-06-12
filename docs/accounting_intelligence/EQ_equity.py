"""Equity — 8 issue templates (EQ_001–EQ_008)"""

EQUITY = [
    {
        "code": "EQ_001",
        "category": "equity",
        "subcategory": "retained_earnings",
        "issue_type": "balance_sheet",
        "name": "Retained Earnings Does Not Reconcile to Cumulative Net Income Less Distributions",
        "description": (
            "The retained earnings balance does not reconcile to prior period retained "
            "earnings plus current period net income minus dividends/distributions. "
            "An unexplained change in retained earnings indicates an unrecorded "
            "transaction, prior period error, or unauthorized distribution."
        ),
        "risk_level": "high",
        "materiality_note": "Any unexplained variance in retained earnings is material.",
        "detection_logic": "Beginning retained earnings + Net income − Dividends ≠ Ending retained earnings.",
        "potential_causes": [
            "Unrecorded distribution to owner",
            "Prior period error correction recorded directly to retained earnings without disclosure",
            "Reclassification entries made directly to retained earnings",
            "Acquisition accounting adjustment recorded incorrectly",
        ],
        "suggested_procedures": [
            "Prepare roll-forward of retained earnings: beginning + NI − distributions = ending",
            "Investigate any direct entries to retained earnings",
            "Confirm that all prior period adjustments are properly disclosed",
            "Verify that distributions are authorized and properly recorded",
        ],
        "suggested_ajes": [
            "Depends on identified cause — may involve reversing direct entries and recording through income statement",
        ],
        "management_questions": [
            "Were there any distributions or dividends paid in the period?",
            "Were there any direct adjustments to retained earnings for prior period corrections?",
            "Can you provide the retained earnings roll-forward for the period?",
        ],
        "affected_account_types": ["equity"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["completeness", "accuracy", "existence"],
        "references": ["ASC 505-10", "ASC 250-10-45"],
        "sort_order": 10,
    },
    {
        "code": "EQ_002",
        "category": "equity",
        "subcategory": "distributions",
        "issue_type": "fraud",
        "name": "Unauthorized or Undisclosed Owner Distributions",
        "description": (
            "Distributions to owners or shareholders are being made without proper "
            "authorization, are not recorded as distributions (instead coded to expenses), "
            "or are not disclosed. Undisclosed distributions can mask earnings manipulation "
            "and are particularly important in QoE and SBA underwriting."
        ),
        "risk_level": "high",
        "materiality_note": "Qualitatively material in any transaction context; critical for SBA and M&A.",
        "detection_logic": "Cash outflows to owner/shareholders not recorded as distributions; retained earnings declining without documented distributions; excessive officer compensation relative to market.",
        "potential_causes": [
            "Owner withdrawals coded as expenses to reduce taxable income",
            "Distributions not approved by board or operating agreement",
            "Informal personal draws not formally authorized",
        ],
        "suggested_procedures": [
            "Review all payments to owners/shareholders; verify proper coding",
            "Reconcile distributions to board resolutions or operating agreement provisions",
            "Compare officer compensation to market rates",
            "Test for personal expenses in business accounts",
        ],
        "suggested_ajes": [
            "Dr Owner Distribution / Cr Expense — to reclassify expenses that are actually distributions",
        ],
        "management_questions": [
            "Were there any distributions or dividends paid to owners in the period?",
            "Are distributions authorized by the operating agreement or board resolution?",
            "Are there any personal expenses paid through the business that represent owner distributions?",
        ],
        "affected_account_types": ["equity"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["occurrence", "authorization", "completeness"],
        "references": ["ASC 505-10-50", "AU-C 240"],
        "sort_order": 20,
    },
    {
        "code": "EQ_003",
        "category": "equity",
        "subcategory": "stock_based_comp",
        "issue_type": "financial_analytics",
        "name": "Stock-Based Compensation Expense Not Recorded or Incorrect",
        "description": (
            "Stock options, restricted stock units, or other equity awards have not "
            "been valued and expensed under ASC 718. Stock-based compensation must be "
            "measured at the grant-date fair value and recognized over the requisite "
            "service period."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material for entities with significant equity award programs.",
        "detection_logic": "Equity awards outstanding with no corresponding compensation expense; SBC expense inconsistent with award vesting schedules.",
        "potential_causes": [
            "Awards not valued using Black-Scholes or other acceptable model",
            "Service period or vesting terms not properly tracked",
            "Expense not reversed for forfeitures",
            "Modification of awards not re-measured",
        ],
        "suggested_procedures": [
            "Obtain equity award register; verify grant-date fair value calculations",
            "Recalculate SBC expense under vesting schedule",
            "Confirm forfeiture adjustments are reflected",
            "Assess any award modifications requiring re-measurement",
        ],
        "suggested_ajes": [
            "Dr SBC Expense / Cr Additional Paid-In Capital — to record missing stock-based compensation",
        ],
        "management_questions": [
            "Are there any outstanding stock options, RSUs, or other equity awards?",
            "Have these awards been valued and expensed under ASC 718?",
            "Are forfeiture assumptions included in the expense calculation?",
        ],
        "affected_account_types": ["equity"],
        "affected_statements": ["IncomeStatement", "BalanceSheet"],
        "audit_assertions": ["completeness", "valuation", "accuracy"],
        "references": ["ASC 718-10-25", "ASC 718-10-30"],
        "sort_order": 30,
    },
    {
        "code": "EQ_004",
        "category": "equity",
        "subcategory": "aoci",
        "issue_type": "balance_sheet",
        "name": "Accumulated Other Comprehensive Income Misclassified",
        "description": (
            "Items that should be reported in Other Comprehensive Income (OCI) are "
            "included in net income, or OCI items are not being reclassified to net "
            "income when realized. Affected items include unrealized gains/losses on "
            "AFS securities, foreign currency translation, and pension adjustments."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material when OCI items are significant relative to net income.",
        "detection_logic": "Unrealized gains/losses on investments flowing through income statement rather than OCI; AOCI balance flat despite known investment or currency activity.",
        "potential_causes": [
            "Investment securities classified as trading rather than AFS",
            "Foreign subsidiary translation adjustments recorded in income",
            "Pension corridor or remeasurement gains not in OCI",
        ],
        "suggested_procedures": [
            "Review investment portfolio classifications: trading vs. AFS",
            "Verify FX translation adjustments are in OCI, not income",
            "Confirm pension actuarial gains/losses flow through OCI",
        ],
        "suggested_ajes": [
            "Dr Net Income (Retained Earnings) / Cr AOCI — to reclassify OCI items from income",
        ],
        "management_questions": [
            "How are investment securities classified? Trading or available-for-sale?",
            "Are there foreign subsidiary operations with translation exposures?",
            "Does the entity have pension or post-retirement benefit obligations?",
        ],
        "affected_account_types": ["equity"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["classification", "accuracy"],
        "references": ["ASC 220-10-45", "ASC 320-10-45"],
        "sort_order": 40,
    },
    {
        "code": "EQ_005",
        "category": "equity",
        "subcategory": "mezzanine",
        "issue_type": "balance_sheet",
        "name": "Redeemable Preferred Equity Classified Within Permanent Equity",
        "description": (
            "Preferred stock or other equity instruments that are mandatorily redeemable "
            "or redeemable at the option of the holder are classified within permanent "
            "equity rather than temporary equity (mezzanine). SEC guidance (ASC 480 and "
            "SEC ASR 268) requires outside-permanent-equity presentation for redeemable "
            "instruments."
        ),
        "risk_level": "moderate",
        "materiality_note": "Reclassification required for SEC registrants; important for any entity with investor capital that has redemption features.",
        "detection_logic": "Preferred stock with put options or mandatory redemption features classified within stockholders' equity section.",
        "potential_causes": [
            "Redeemable features not identified during instrument analysis",
            "Private company simplification election not evaluated",
            "Investment agreement terms not communicated to accounting",
        ],
        "suggested_procedures": [
            "Review all equity instrument agreements for redemption features",
            "Apply ASC 480 mandatorily redeemable classification; apply SEC ASR 268 for contingently redeemable",
            "Reclassify to temporary equity (mezzanine) section",
        ],
        "suggested_ajes": [
            "Dr Permanent Equity / Cr Temporary Equity — to reclassify redeemable instruments",
        ],
        "management_questions": [
            "Are there any equity instruments with mandatory redemption or put option features?",
            "Are investor rights agreements reviewed for accounting implications?",
        ],
        "affected_account_types": ["equity"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["classification", "presentation"],
        "references": ["ASC 480-10-25", "SEC ASR 268"],
        "sort_order": 50,
    },
    {
        "code": "EQ_006",
        "category": "equity",
        "subcategory": "treasury_stock",
        "issue_type": "balance_sheet",
        "name": "Treasury Stock Accounting Error",
        "description": (
            "Share repurchases are recorded incorrectly. Treasury stock should be "
            "recorded at cost as a reduction of equity (debit to treasury stock). "
            "Gains on reissuance go to APIC; losses reduce APIC first, then retained "
            "earnings. Recording gains/losses through income is prohibited."
        ),
        "risk_level": "low",
        "materiality_note": "Evaluate when share repurchases are significant.",
        "detection_logic": "Gain or loss on treasury stock transactions appearing in income statement.",
        "potential_causes": [
            "Treasury stock gain/loss recorded as income",
            "Retirement of treasury shares not properly recorded",
            "Par value vs. cost method inconsistency",
        ],
        "suggested_procedures": [
            "Review all treasury stock transactions",
            "Confirm no gains/losses recorded in income statement",
            "Verify APIC is properly credited/debited on reissuance",
        ],
        "suggested_ajes": [
            "Dr Gain on Treasury Stock / Cr APIC — to reclassify from income to equity",
        ],
        "management_questions": [
            "Were any share repurchases or reissuances made in the period?",
            "Are repurchases recorded using cost method or par value method?",
        ],
        "affected_account_types": ["equity"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["accuracy", "classification"],
        "references": ["ASC 505-30-30", "ASC 505-30-45"],
        "sort_order": 60,
    },
    {
        "code": "EQ_007",
        "category": "equity",
        "subcategory": "equity_method",
        "issue_type": "financial_analytics",
        "name": "Equity Method Investment Not Applied for Significant Influence",
        "description": (
            "An investment in another entity for which the investor has significant "
            "influence (generally 20–50% ownership) is not being accounted for under "
            "the equity method. Instead, it is carried at cost or fair value. The equity "
            "method requires recognition of the investor's proportionate share of the "
            "investee's income or loss."
        ),
        "risk_level": "moderate",
        "materiality_note": "Material when equity method losses would materially reduce reported income.",
        "detection_logic": "Investment at 20%+ ownership without equity method accounting; investment balance flat while investee reports income or loss.",
        "potential_causes": [
            "Ownership percentage near 20% threshold without formal assessment",
            "Significant influence indicators not evaluated beyond ownership %",
            "Investment written off without equity method loss recognition",
        ],
        "suggested_procedures": [
            "Identify all equity investments; assess ownership % and significant influence indicators",
            "Apply equity method prospectively from when significant influence attained",
            "Obtain investee financials; calculate proportionate share of income/loss",
        ],
        "suggested_ajes": [
            "Dr Equity Method Investment / Cr Equity in Earnings of Investee — to record investee income",
            "Dr Equity in Loss of Investee / Cr Equity Method Investment — for investee losses",
        ],
        "management_questions": [
            "What is the ownership percentage in each equity investment?",
            "Does the company have board representation or other indicators of significant influence?",
            "Has equity method accounting been applied consistently?",
        ],
        "affected_account_types": ["asset"],
        "affected_statements": ["BalanceSheet", "IncomeStatement"],
        "audit_assertions": ["completeness", "valuation"],
        "references": ["ASC 323-10-15-6", "ASC 323-10-25"],
        "sort_order": 70,
    },
    {
        "code": "EQ_008",
        "category": "equity",
        "subcategory": "deficit",
        "issue_type": "financial_analytics",
        "name": "Accumulated Deficit Without Going Concern Evaluation",
        "description": (
            "The entity has an accumulated deficit (negative retained earnings) that "
            "combined with other indicators may raise substantial doubt about the entity's "
            "ability to continue as a going concern. Management must evaluate going concern "
            "conditions under ASC 205-40 for each annual and interim reporting period."
        ),
        "risk_level": "high",
        "materiality_note": "Always requires evaluation when accumulated deficit is present with other going concern indicators.",
        "detection_logic": "Accumulated deficit combined with: negative operating cash flow, debt covenant violations, debt maturing within 12 months, recurring net losses.",
        "potential_causes": [
            "Start-up entity with pre-revenue losses",
            "Established entity with declining performance",
            "One-time impairments creating large deficit",
        ],
        "suggested_procedures": [
            "Enumerate going concern conditions and events present",
            "Evaluate management's plans to address conditions",
            "Assess whether substantial doubt exists after considering management's plans",
            "Draft going concern disclosure if required",
        ],
        "suggested_ajes": [],
        "management_questions": [
            "What are management's plans to address the accumulated deficit?",
            "Does the entity have committed financing to fund operations for the next 12 months?",
            "What is the projected cash runway at current burn rates?",
        ],
        "affected_account_types": ["equity"],
        "affected_statements": ["BalanceSheet"],
        "audit_assertions": ["completeness", "presentation"],
        "references": ["ASC 205-40-50", "AU-C 570"],
        "sort_order": 80,
    },
]
