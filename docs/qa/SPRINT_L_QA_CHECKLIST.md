# Sprint L QA Checklist — Chart of Accounts Management

## Backend Endpoints

- [ ] `GET /api/v1/accounts/{id}` returns `AccountDetail` with `children`, `balance_summary` (total_debit, total_credit, net_balance), and `parent_account_id`
- [ ] `GET /api/v1/accounts/{id}` returns 404 for unknown account
- [ ] `POST /api/v1/accounts/{id}/deactivate` sets `active=false` and `account_status=inactive` when balance is zero
- [ ] `POST /api/v1/accounts/{id}/deactivate` returns 409 with `"Cannot deactivate account with non-zero balance"` when balance is non-zero
- [ ] `DELETE /api/v1/accounts/{id}` returns 409 with `"Cannot delete account with posted journal entry lines"` when JE lines exist
- [ ] `DELETE /api/v1/accounts/{id}` returns 409 with `"Cannot delete account with child accounts — reassign children first"` when children exist
- [ ] `DELETE /api/v1/accounts/{id}` returns 204 when account has no JE lines and no children
- [ ] `GET /api/v1/accounts/?include_hierarchy=true` returns only root accounts (children not in top-level items list)

## Frontend: ChartOfAccountsPage

- [ ] Filter bar renders with search input and type chip filters when an entity is selected
- [ ] Clicking an account name opens the account detail panel (right-side drawer)
- [ ] Detail panel shows: account number, name, type, normal balance, parent, balance summary (total debit/credit/net), children list, FSLI mapping
- [ ] Detail panel shows **Edit Account** and **Add Child** buttons
- [ ] **Deactivate** button appears for active accounts; **Reactivate** for inactive accounts
- [ ] Clicking **Deactivate** shows inline "Are you sure? Yes/No" confirmation
- [ ] On confirmation, `accountsApi.deactivate(id)` is called; success shows toast
- [ ] If deactivate returns 409 (non-zero balance), error toast is displayed
- [ ] **Delete** button appears only when account has no children and no JE lines (balance_summary totals are zero)
- [ ] Clicking **Delete** shows inline confirmation; on confirm calls `accountsApi.delete(id)`
- [ ] If delete returns 409, error toast is displayed
- [ ] Clicking **Edit Account** opens the inline row edit form (account_name, account_type, parent_account_id, reporting_taxonomy_line_id)
- [ ] Saving inline edit calls `accountsApi.update(id, payload)` and shows success toast
- [ ] **Hierarchy tree toggle** button appears in the toolbar (Layers/List icon)
- [ ] Clicking toggle switches from nested tree to flat list (all accounts shown at same visual depth derived from `depth_level`)
- [ ] Toggling back switches to nested tree view

## Tests

- [ ] `python -m pytest tests/test_coa_management.py -q` — all 5 tests pass
- [ ] `cd frontend && npx vitest run src/test/coa_management.test.tsx` — all 5 tests pass

## What's New entry

- [ ] OverviewPage `WHATS_NEW` array has Sprint L entry at the top with correct 5 bullet points
