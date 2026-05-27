# Claude Code Instructions — Accounting Tool

## Accounting Schema Reference

The canonical accounting data model is documented in `docs/schema/ACCOUNTING_SCHEMA.md`. Before adding any new model fields, API endpoints, or financial computations, read the relevant section of that document.

Key principles (see `docs/schema/ASSUMPTIONS.md` for full detail):

- **Sign convention**: `normal_balance` (debit|credit) is stored on every account. `fs_sign_convention` (-1|1) controls display sign for financial statements.
- **Double-entry**: JE lines have separate `debit` and `credit` columns. Both cannot be nonzero on the same line. Sum of debits must equal sum of credits within a JE before posting.
- **Three-statement model**: IS Net Income = BS Retained Earnings delta (± dividends). BS cash = CFS ending cash.
- **YTD**: BS accounts are cumulative ending balance. IS accounts are sum from fiscal year start.
- **Header accounts** (`is_header = TRUE`) cannot receive JE postings. Enforce via `is_postable`.

## Project Stack

- **Backend**: FastAPI + SQLAlchemy ORM + SQLite (Alembic migrations)
- **Frontend**: React + TypeScript + TanStack Query + Vitest + Playwright
- **Test runner**: `cd frontend && npm run test` (Vitest)
- **E2E**: `cd frontend && npm run test:e2e` (Playwright)

## Schema Changes

All schema changes must be:
1. Reflected in `docs/schema/SCHEMA_CHANGELOG.md`
2. Accompanied by an Alembic migration (`alembic revision --autogenerate -m "description"`)
3. Type-checked: update Pydantic schemas and TypeScript types in the same PR

## Coding Rules

- No comments unless the WHY is non-obvious.
- No premature abstractions — three similar lines > a function called once.
- No error handling for impossible cases.
- Security: never trust user input at API boundaries; validate with Pydantic.
