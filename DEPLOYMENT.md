# Deployment Guide — Accounting Tool (M21 Alpha)

## Prerequisites

- Python 3.12+
- Node.js 22+
- PostgreSQL 14+ (production) or SQLite (development)

---

## Backend Setup

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set SECRET_KEY, DATABASE_URL, ALLOWED_ORIGINS
```

Generate a secure `SECRET_KEY`:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 3. Run database migrations

**Fresh installation:**
```bash
alembic upgrade head
```

**Existing database** (previously managed by `create_all`):
```bash
alembic stamp 001      # mark baseline as applied
alembic upgrade head   # apply M21 auth-field migration
```

### 4. Create the first admin user

Use the Python shell or a management script (full admin CLI is a future milestone):
```python
from app.database import SessionLocal
from app.services.organization_service import create_organization, seed_default_roles
from app.services.user_service import create_user, assign_role
from app.core.security import hash_password

db = SessionLocal()
org = create_organization(db, name="Acme Corp", slug="acme")
seed_default_roles(db)
db.commit()

user = create_user(
    db,
    organization_id=org.id,
    email="admin@acme.com",
    full_name="Admin User",
    hashed_password=hash_password("ChangeMe123!"),
    is_superuser=True,
)
db.commit()
print(f"Created user id={user.id}")
db.close()
```

### 5. Start the backend

**Development (with auto-reload):**
```bash
uvicorn app.main:app --reload --port 8000
```

**Production:**
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

---

## Frontend Setup

### 1. Install dependencies

```bash
cd frontend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
# Set VITE_API_BASE_URL=http://your-backend-host:8000/api/v1
```

### 3. Development server

```bash
npm run dev
```

### 4. Production build

```bash
npm run build
# Serve the dist/ directory from any static host or nginx
```

---

## Docker (Development)

```bash
docker-compose -f docker-compose.dev.yml up --build
```

- Backend: http://localhost:8000
- Frontend: http://localhost:5173
- API docs: http://localhost:8000/docs

---

## Health Checks

| Endpoint | Purpose | Expected |
|---|---|---|
| `GET /health` | Liveness — is the process alive? | `{"status":"ok"}` |
| `GET /ready` | Readiness — can the DB be reached? | `{"status":"ready"}` |

---

## Authentication Flow

1. POST `/api/v1/auth/login` with `{"email": "...", "password": "..."}`
2. Receive `{"access_token": "...", "token_type": "bearer", "expires_in": 3600}`
3. Include in subsequent requests: `Authorization: Bearer <token>`
4. Token expires after `ACCESS_TOKEN_EXPIRE_MINUTES` (default: 60)
5. Re-authenticate or call `POST /api/v1/auth/refresh` to extend session

---

## Security Notes

- `SECRET_KEY` must be a cryptographically random 32+ byte hex string in production
- Tokens are stateless JWTs — logout invalidates on the client only
- Account locks after 5 consecutive failed logins (15-minute cooldown)
- All CORS origins must be explicitly listed in `ALLOWED_ORIGINS`
- Never commit `.env` to version control
