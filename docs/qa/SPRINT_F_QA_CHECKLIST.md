# Sprint F — Financial Statement Presentation View QA Checklist
Last updated: 2026-06-19

## Acceptance Criteria
- [ ] Same underlying data as AWV but signs flipped for presentation
- [ ] Revenue shown as positive
- [ ] COGS shown as positive
- [ ] Expenses shown as positive
- [ ] Net Income = Revenue - COGS - Expenses
- [ ] Balance Sheet balances: Total Assets = Total Liabilities + Equity
- [ ] No account numbers shown in client view
- [ ] Subtotals bold, totals with styling
- [ ] Print button works
- [ ] Toggle between Working View and Financial Statements

## Tab Navigation
- [ ] "Working View" tab renders AccountingWorkingView with debit-normal signs
- [ ] "Financial Statements" tab renders FinancialStatementPresentationView
- [ ] Switching tabs triggers correct data fetch

## Income Statement
- [ ] Revenue section shows taxonomy lines with positive amounts
- [ ] Total Revenue matches sum of revenue taxonomy lines
- [ ] COGS section appears only when COGS > 0
- [ ] Gross Profit = Revenue - COGS
- [ ] Operating Expenses section shows taxonomy lines
- [ ] Total Expenses matches sum of expense taxonomy lines
- [ ] Operating Income = Gross Profit - Total Expenses
- [ ] Other Income / Other Expenses shown when non-zero
- [ ] Net Income row has double-border styling
- [ ] Net Income negative → rose color

## Balance Sheet
- [ ] Assets section shows taxonomy lines with positive amounts
- [ ] Total Assets row underlined
- [ ] Liabilities section shows taxonomy lines with positive amounts
- [ ] Equity section shows taxonomy lines
- [ ] Total Liabilities & Equity = Total Liabilities + Total Equity
- [ ] Imbalance warning shown when Assets ≠ L + E
- [ ] data-testid="fsp-total-assets" present
- [ ] data-testid="fsp-total-liabilities-equity" present

## API
- [ ] GET /financial-statements/presentation-view returns 200 with entity_id
- [ ] income_statement.revenue > 0 for entities with revenue data
- [ ] balance_sheet.balanced = true for balanced books
- [ ] Endpoint uses get_presentation_amount() not get_awv_display_amount()

## Tests
- [ ] pytest tests/test_presentation_view.py -v passes all 12 tests
- [ ] npm run test (Vitest) presentation_view.test.tsx passes all 11 tests

## Print
- [ ] Print button triggers window.print()
- [ ] Statement body has max-w-3xl for screen, print:max-w-full for print
