# Trial Balance Import — Column Mapping Regression: Root Cause

Reported: 2026-06-20 (manual UI testing)

## Symptom

User uploaded a TB whose columns were laid out:

| A      | B                              | C       | D | E      |
|--------|--------------------------------|---------|---|--------|
| (blank)| `1000 · Cash`                  | 0       |   | 20.16  |
| (blank)| `1000-01 · FHB - MLI Operating`| 20.16   |   | 0      |
| (blank)| `1000-02 · FHB - MLI Merch …`  | 2.38    |   | 0      |

After Process & Validate, the Mapping Workbench rendered rows like:

- `0 Imported Account 1`
- `20.16`
- `2.38`
- `745.33`

i.e. Column C (Debit amounts) was treated as the Account Number column, and
the real source data in Column B was discarded.

## Code path traced

The data flowed through these calls (file:line):

1. **Step 3 UI — `frontend/src/pages/TrialBalanceImportPage.tsx:570`**
   `FIELD_OPTIONS` exposed only six choices: ignore / account_number /
   account_name / debit / credit / balance / description. There was **no
   "Account # + Name (combined)" option**, so a user whose data put both
   number and name in one cell had no way to declare that.

2. **Process & Validate — `frontend/src/pages/TrialBalanceImportPage.tsx:711`**
   The Process button was gated only on `colMapping['account_number']`. A
   user who picked an amount column as Account Number (or whose auto-detect
   did so) was allowed to advance unchallenged.

3. **Upload handler — `app/api/routers/tb_import.py` calls into
   `app/services/import_batch_service.py`**

4. **Auto-detection — `import_batch_service.py:auto_detect_column_mapping`**
   The function matched column **header names** against `COLUMN_ALIASES`
   (`account_number: ["account #", "acct", "num", "gl account", "code", …]`).
   When headers were generic / absent / unmatched, the function returned
   nothing for `account_number` and the UI relied on the user to pick. When
   the user (or stale state) picked the wrong column, no DATA inspection
   ever ran.

5. **Row interpretation — `import_batch_service.py:_interpret_row` (line 302)**
   For every row, this called `get("account_number")` which simply returned
   the value from whichever column the user had mapped. If that column held
   `"20.16"`, then `raw_acct_num = "20.16"`.

6. **Combined-field split — `parse_combined_account_field` (line 170)**
   `_COMBINED_PATTERN = ^(\d{3,8}(?:-\d{1,6})*)\s*(?:[-–—·:]\s*|\s+)(.+)$`
   The regex requires 3–8 digits + separator + name text. `"20.16"` does
   not match, so the function returned `("20.16", "")` and the loader
   stored that as the account number.

7. **Mapping Workbench display**
   The page renders `raw_account_number` directly. With that field
   containing `"20.16"`, the workbench showed `20.16 Imported Account 1`.

## Three converging root causes

| # | Layer | What was wrong |
|---|-------|---------------|
| 1 | Frontend | No "Account # + Name (combined)" option, so users with Column B = "1000 · Cash" had nowhere to map it correctly — they were forced to pick that column as either Account Number alone (losing the name) or as Account Name (losing the number). |
| 2 | Backend auto-detection | `auto_detect_column_mapping` only read header text. It never inspected column data to recognise that Column C's values (`0`, `20.16`, `2.38`) are clearly amounts, not codes. |
| 3 | Backend validation | There was no guard that rejected a column of decimals being mapped as `account_number`. Bad mappings flowed straight through to the loader. |

## Fix shape (applied in this sprint)

1. **New `account_combined` standard field** (`import_batch_service.py:77`
   + `TrialBalanceImportPage.tsx:570`) — explicit way for the user (and
   auto-detect) to declare one column holds both number and name.

2. **`infer_column_type_from_data(values)`**
   (`import_batch_service.py`) — samples values and returns `amount` /
   `account_combined` / `account_number` / `text` / `empty`. Decimal-shaped
   values are classified as `amount` so they cannot be confused with codes.

3. **`auto_detect_column_mapping(headers, rows=…)`** — now does a second
   pass over un-matched columns using data inference. The user's TB now
   auto-detects Column B → `account_combined`, Column C → `debit`, Column
   E → `credit` even if their headers are generic.

4. **`validate_column_mapping_against_data(col_map, rows)`** — returns
   warnings when an amount-shaped column is mapped as `account_number`, or
   an account-shaped column is mapped as `debit`/`credit`/`balance`. Caller
   can surface these as a blocking error.

5. **`_interpret_row` honors `account_combined`** explicitly — when set,
   parses the cell with `parse_combined_account_field` and splits into
   `(number, name)`.

6. **Frontend gate** — Process & Validate button accepts EITHER
   `account_number` OR `account_combined` as the required field.

## Verification matrix

| Check | Test | Where |
|-------|------|-------|
| Combined "1000 · Cash" splits correctly | `TestParseCombined.test_dot_middle_dot_separator` | `tests/test_tb_import_column_regression.py` |
| Subaccount "1000-01 · FHB - MLI Operating" splits | `TestParseCombined.test_subaccount_with_middot` | same file |
| Amount column NOT auto-detected as account_number | `TestUserRegression.test_auto_detection_picks_combined_column_b_not_amount_column_c` | same file |
| Decimal column data → "amount" inference | `TestInferColumnType.test_amount_column_decimals` | same file |
| Combined-field _interpret_row splits properly | `TestUserRegression.test_explicit_combined_mapping_parses_correctly` | same file |
| Warning when amount column mapped as account_number | `TestUserRegression.test_validation_warns_if_amount_column_mapped_as_account_number` | same file |
| Clean correct mapping yields no warnings | `TestUserRegression.test_validation_clean_for_correct_mapping` | same file |

All 17 backend tests pass.
