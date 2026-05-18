# Accounting Tool — Internal Alpha

A full-stack accounting platform built with FastAPI + SQLAlchemy (backend) and React + TypeScript (frontend).

## Quick Start (Local Development)

### Prerequisites

- Python 3.11+
- Node.js 20+
- Git

### 1. Clone and install

```bash
git clone <repo-url>
cd accounting_tool
pip install -r requirements.txt
cd frontend && npm install && cd ..
```

### 2. Configure environment

Copy the example env file and adjust as needed:

```bash
cp .env.example .env   # or create .env manually
```

Minimum `.env` for local dev (defaults work out of the box):

```
SECRET_KEY=dev-secret-key-change-in-production-must-be-32-chars-min
DATABASE_URL=sqlite:///./accounting.db
ENVIRONMENT=development
```

### 3. Initialize the database

```bash
alembic upgrade head
```

### 4a. Demo environment (recommended for first run)

Loads a complete demo dataset: Acme Manufacturing Co., 5 users, chart of accounts, journal entries, and more.

```bash
python scripts/reset_local.py
# Type 'reset' to confirm
```

Demo login credentials:

| Role        | Email                     | Password    |
|-------------|---------------------------|-------------|
| Admin       | admin@acme-demo.com       | Demo1234!   |
| Controller  | controller@acme-demo.com  | Demo1234!   |
| Accountant  | accountant@acme-demo.com  | Demo1234!   |
| Reviewer    | reviewer@acme-demo.com    | Demo1234!   |
| Viewer      | viewer@acme-demo.com      | Demo1234!   |

### 4b. Fresh installation

For a clean slate (no demo data):

```bash
python scripts/setup_admin.py
# Follow the interactive prompts
```

### 5. Start servers

In two separate terminals:

```bash
# Terminal 1 — Backend API (http://localhost:8000)
uvicorn app.main:app --reload

# Terminal 2 — Frontend (http://localhost:5173)
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and log in.

## Makefile Shortcuts

```bash
make install       # Install all dependencies
make dev-backend   # Start FastAPI dev server
make dev-frontend  # Start Vite dev server
make test          # Run all tests (backend + frontend)
make test-backend  # pytest only
make test-frontend # vitest only
make test-e2e      # Playwright smoke tests
make migrate       # Run pending migrations
make reset         # Drop + recreate DB + seed demo data
make seed          # Seed demo data into existing DB
make type-check    # TypeScript type check
make build         # Production frontend build
```

## API Documentation

Interactive API docs (Swagger UI) available at [http://localhost:8000/docs](http://localhost:8000/docs) while the backend is running.

Key endpoints:

- `POST /api/v1/auth/login` — obtain JWT access token
- `GET  /api/v1/auth/me` — current user profile
- `GET  /setup/status` — check if first-admin setup is complete
- `POST /setup/admin` — create first admin (only available on empty DB)
- `GET  /health` — liveness check
- `GET  /ready` — readiness check (verifies DB connection)

## Project Structure

```
accounting_tool/
├── app/
│   ├── api/
│   │   ├── deps.py          # JWT auth dependencies
│   │   ├── routers/         # FastAPI routers
│   │   └── schemas.py       # Pydantic schemas
│   ├── core/
│   │   ├── config.py        # pydantic-settings configuration
│   │   ├── logging_config.py
│   │   └── security.py      # JWT + bcrypt
│   ├── models/              # SQLAlchemy models
│   ├── services/            # Business logic
│   ├── database.py
│   └── main.py
├── alembic/                 # Database migrations
├── frontend/
│   ├── src/
│   │   ├── api/             # API client + modules
│   │   ├── components/      # React components
│   │   ├── pages/           # Page components
│   │   ├── providers/       # AuthProvider, QueryProvider
│   │   └── routes/          # AppRouter
│   └── e2e/                 # Playwright smoke tests
├── scripts/
│   ├── seed_demo.py         # Demo data seeder
│   ├── setup_admin.py       # First-admin CLI
│   └── reset_local.py       # Local DB reset
├── tests/                   # pytest backend tests
├── docs/
│   └── INTERNAL_ALPHA_CHECKLIST.md
└── Makefile
```

## Running Tests

```bash
# Backend (337 tests)
python -m pytest -q

# Frontend (68 tests)
cd frontend && npm test -- --run

# E2E smoke tests
cd frontend && npm run test:e2e
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for Docker-based deployment instructions.

## Internal Alpha Notes

See [docs/INTERNAL_ALPHA_CHECKLIST.md](docs/INTERNAL_ALPHA_CHECKLIST.md) for the checklist of items to verify before wider rollout.
