# Internal Alpha Checklist

Use this checklist before distributing the internal alpha to testers.

## Infrastructure

- [ ] `.env` configured with a strong, unique `SECRET_KEY` (32+ chars, not the dev default)
- [ ] `DATABASE_URL` points to a persistent Postgres instance (not SQLite)
- [ ] `ENVIRONMENT=production` set in the deployment environment
- [ ] `ALLOWED_ORIGINS` contains only the actual frontend origin (no wildcards)
- [ ] `alembic upgrade head` completed successfully on the target DB
- [ ] Docker image builds without errors (`docker build -t accounting-tool .`)
- [ ] `docker-compose.dev.yml` or equivalent orchestration is running
- [ ] `/health` returns `{"status": "ok"}` via `curl http://localhost:8000/health`
- [ ] `/ready` returns `{"status": "ready"}` (confirms DB connectivity)

## First-Run Setup

- [ ] Fresh DB: `GET /setup/status` returns `{"setup_complete": false, "user_count": 0}`
- [ ] First admin created via `python scripts/setup_admin.py` OR via `POST /setup/admin`
- [ ] After setup: `GET /setup/status` returns `{"setup_complete": true}`
- [ ] Admin can log in at the frontend login page
- [ ] `POST /setup/admin` returns 409 after first admin exists

## Authentication

- [ ] Login with valid credentials returns a JWT token
- [ ] Login with wrong password returns 401 (not 500)
- [ ] After 5 failed attempts, account is locked for 15 minutes
- [ ] `/auth/me` returns correct user details with a valid token
- [ ] `/auth/me` returns 401 with an expired or missing token
- [ ] Frontend redirects to `/login` when token is missing or expired
- [ ] Frontend stores token in `sessionStorage` (not `localStorage`)
- [ ] Logout clears token and redirects to `/login`

## Authorization

- [ ] Viewer cannot create or post journal entries (403)
- [ ] Reviewer cannot approve their own journal entry (422 ReviewerSeparationError)
- [ ] Admin user can access `/admin` route in the frontend
- [ ] Non-admin user is redirected to `/unauthorized` when accessing `/admin`
- [ ] Users from org A cannot access data from org B (org isolation)

## Demo Data (if using seed)

- [ ] `python scripts/reset_local.py` completes without errors
- [ ] All 5 demo users can log in with `Demo1234!`
- [ ] Dashboard loads and shows quick links
- [ ] Demo banner is visible on all pages
- [ ] Chart of accounts shows 17 accounts for Acme Manufacturing
- [ ] Journal entries list shows posted + draft entries
- [ ] Trial balance loads for January 2024 (period 2024-01)
- [ ] Financial statements render (Balance Sheet + Income Statement)

## Data Integrity

- [ ] All posted journal entries are balanced (debits = credits)
- [ ] Opening balance entry: $950,000 balanced
- [ ] No unbalanced entries exist in the demo dataset

## Frontend

- [ ] `npm run build` completes without TypeScript errors
- [ ] Bundle size under 600 KB (check build output)
- [ ] Login page renders correctly at `/login`
- [ ] Protected routes redirect unauthenticated users to `/login`
- [ ] Dashboard loads after successful login
- [ ] No console errors on initial page load

## CI/CD

- [ ] GitHub Actions CI passes on `main` branch (all 3 jobs green)
  - [ ] `backend-test` (pytest 337 tests)
  - [ ] `frontend-test` (vitest 68 tests + tsc + build)
  - [ ] `security-audit` (pip-audit + npm audit — advisory only)
- [ ] E2E smoke tests pass (`npm run test:e2e`)

## Security

- [ ] `SECRET_KEY` is not the dev default value
- [ ] CORS `allow_origins` does not include `*`
- [ ] No sensitive data in git history (`.env` is gitignored)
- [ ] HTTPS configured in production (SSL termination at reverse proxy)
- [ ] Response headers include `X-Request-Id` for log correlation

## Operational

- [ ] Logs are written to stdout in structured format
- [ ] Log level set appropriately (`INFO` for alpha, `WARNING` for quieter production)
- [ ] DB backup strategy documented or configured
- [ ] Rollback procedure documented: `alembic downgrade -1`

## Known Limitations (Alpha)

- Password reset is a placeholder (logs the request, sends no email)
- No email notifications for workflow tasks
- Single-organization support only (multi-tenancy not enforced at DB level)
- SQLite not recommended for concurrent users — use Postgres for alpha testers
- No rate limiting beyond account lockout (5 attempts)
- No audit log UI (events are logged to stdout only)
