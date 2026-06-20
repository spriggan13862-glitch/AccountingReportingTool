# Sprint D — Accounting Balance Engine QA Checklist
Last updated: 2026-06-19

## Acceptance Criteria
- [ ] Revenue is negative in Accounting Working View
- [ ] Revenue is positive in Financial Statement Presentation View
- [ ] Expenses positive in both views
- [ ] Net Income = Revenue - COGS - Expenses (all terms positive in FSP)
- [ ] Balance Sheet: Assets = Liabilities + Equity
- [ ] AJE impacts use presentation amounts for NI/BS display
- [ ] View toggle on Financial Statements page works
- [ ] `/financial-statements/compute-balance` endpoint returns correct values
- [ ] Backend tests pass: `python -m pytest tests/test_balance_engine.py -v`
- [ ] Frontend tests pass: `cd frontend && npm run test -- balance_engine`

## Balance Sign Table
| Type         | Normal | AWV Display  | FSP Display |
|--------------|--------|--------------|-------------|
| Asset        | Debit  | +balance     | +balance    |
| Liability    | Credit | -balance*    | +balance    |
| Equity       | Credit | -balance*    | +balance    |
| Revenue      | Credit | -balance*    | +balance    |
| COGS         | Debit  | +balance     | +balance    |
| Expense      | Debit  | +balance     | +balance    |
| Contra-Asset | Credit | -balance*    | +balance    |

*AWV: credit-normal balances shown as negative in debit-dominant accounting working view.

## Key Functions (backend)
| Function | Location |
|---|---|
| `get_normal_balance(account_type)` | `app/services/balance_engine.py` |
| `get_accounting_signed_balance(type, debit, credit)` | `app/services/balance_engine.py` |
| `get_presentation_amount(type, accounting_balance)` | `app/services/balance_engine.py` |
| `get_awv_display_amount(type, accounting_balance)` | `app/services/balance_engine.py` |
| `compute_net_income(revenue, cogs, expenses)` | `app/services/balance_engine.py` |

## Key Functions (frontend)
| Function | Location |
|---|---|
| `getNormalBalance(accountType)` | `frontend/src/lib/balanceEngine.ts` |
| `getAccountingSignedBalance(type, debit, credit)` | `frontend/src/lib/balanceEngine.ts` |
| `getPresentationAmount(type, balance, signBehavior?)` | `frontend/src/lib/balanceEngine.ts` |
| `getAwvDisplayAmount(type, balance)` | `frontend/src/lib/balanceEngine.ts` |
| `computeNetIncome(revenue, cogs, expenses)` | `frontend/src/lib/balanceEngine.ts` |
| `formatForView(amount, type, view, signBehavior?)` | `frontend/src/lib/balanceEngine.ts` |

## API Endpoint
```
GET /financial-statements/compute-balance?account_type=asset&debit=1000&credit=200&view=accounting
→ { accounting_balance: 800, presentation_amount: 800, normal_balance: 'debit', is_normal: true, ... }
```

## Sign Convention Clarification
The key insight: `get_accounting_signed_balance()` returns a POSITIVE number when the account
has a normal-side balance (whether debit or credit normal). The sign flip for display happens at
the VIEW layer:

- **FSP display**: accounting_balance is shown as-is for all types (revenue already positive = earned)
- **AWV display**: credit-normal accounts (revenue, liability, equity) are flipped NEGATIVE
  because in the debit-dominant working view, credit balances read as negative

This means `get_presentation_amount()` does NOT flip revenue. It only flips when `sign_behavior`
is explicitly set to 'negative' or 'contra' (taxonomy line overrides).
