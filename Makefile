# Makefile — accounting tool local development convenience targets
# Requires: Python 3.11+, Node 20+, make (Git Bash / WSL on Windows)

.PHONY: help install dev-backend dev-frontend dev reset seed setup-admin \
        test test-backend test-frontend test-e2e lint type-check \
        migrate migrate-check db-reset

PYTHON := python
NPM    := npm
ALEMBIC := alembic

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ---------------------------------------------------------------------------
# Installation
# ---------------------------------------------------------------------------

install: ## Install all dependencies (Python + Node)
	pip install -r requirements.txt
	cd frontend && $(NPM) install

# ---------------------------------------------------------------------------
# Development servers
# ---------------------------------------------------------------------------

dev-backend: ## Start FastAPI dev server (hot-reload) on :8000
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-frontend: ## Start Vite dev server on :5173
	cd frontend && $(NPM) run dev

dev: ## Start both servers (requires two terminals — use 'make dev-backend' and 'make dev-frontend')
	@echo "Run in separate terminals:"
	@echo "  make dev-backend"
	@echo "  make dev-frontend"

# ---------------------------------------------------------------------------
# Database & seeding
# ---------------------------------------------------------------------------

migrate: ## Run alembic migrations (upgrade head)
	$(ALEMBIC) upgrade head

migrate-check: ## Show pending migrations
	$(ALEMBIC) current
	$(ALEMBIC) heads

seed: ## Seed demo data (Acme Manufacturing) — skips if org already exists
	$(PYTHON) -c "from app.database import SessionLocal; from scripts.seed_demo import seed_demo_data; db = SessionLocal(); seed_demo_data(db, verbose=True); db.close()"

reset: ## DROP and recreate local DB, then seed demo data (DESTRUCTIVE)
	$(PYTHON) scripts/reset_local.py

reset-yes: ## Same as reset but skips confirmation prompt (for scripting)
	$(PYTHON) scripts/reset_local.py --yes

setup-admin: ## Interactive first-admin setup (for fresh installations)
	$(PYTHON) scripts/setup_admin.py

# ---------------------------------------------------------------------------
# Testing
# ---------------------------------------------------------------------------

test: test-backend test-frontend ## Run all tests

test-backend: ## Run pytest (backend)
	$(PYTHON) -m pytest -q

test-backend-v: ## Run pytest verbose
	$(PYTHON) -m pytest -v

test-frontend: ## Run vitest (frontend)
	cd frontend && $(NPM) test -- --run

test-e2e: ## Run Playwright E2E smoke tests (starts its own server)
	cd frontend && $(NPM) run test:e2e

# ---------------------------------------------------------------------------
# Code quality
# ---------------------------------------------------------------------------

lint: ## Lint backend (ruff) and frontend (eslint)
	ruff check app/ tests/ scripts/ || true
	cd frontend && $(NPM) run lint || true

type-check: ## Type-check frontend (tsc)
	cd frontend && $(NPM) run type-check

build: ## Production build (frontend)
	cd frontend && $(NPM) run build
