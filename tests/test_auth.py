"""
Milestone 21 authentication test suite.

Proof points
------------
1.  Login succeeds with valid credentials
2.  Login fails with invalid password
3.  Login fails for unknown email
4.  JWT validation works — decode returns correct payload
5.  Expired tokens are rejected
6.  Org isolation enforced — token org_id mismatch rejected
7.  Viewer cannot mutate accounting objects (PermissionDeniedError)
8.  Reviewer separation enforced — preparer cannot review own reconciliation
9.  Protected /auth/me returns user for valid token
10. Protected /auth/me returns 401 for missing token
11. Protected /auth/me returns 401 for malformed token
12. Account lockout after MAX_LOGIN_ATTEMPTS failures
13. /health endpoint responds correctly
14. /ready endpoint responds correctly
15. Logging middleware attaches X-Request-Id to response
"""

from __future__ import annotations

import datetime

import pytest
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core.config import settings
from app.core.security import (
    create_access_token,
    hash_password,
    token_payload_for_user,
    verify_password,
)
from app.database import Base
from app.api.deps import get_db
from app.main import app
from app.models.organization import Organization
from app.models.user import User
from app.services.auth_service import (
    AccountLockedError,
    AuthenticationError,
    authenticate_user,
    create_token_for_user,
)
from app.services.organization_service import create_organization, seed_default_roles
from app.services.user_service import create_user, assign_role
from app.services.reconciliation_service import (
    create_reconciliation,
    transition_status,
    ReviewerSeparationError,
)
from app.services.permission_service import PermissionDeniedError, require_permission


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def auth_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def set_pragmas(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.close()

    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)


@pytest.fixture(scope="module")
def auth_session_factory(auth_engine):
    return sessionmaker(bind=auth_engine)


@pytest.fixture(scope="module")
def seeded(auth_session_factory):
    """
    Seed two organizations with users covering all role scenarios.

    Returns a dict of named users and their plain-text passwords.
    """
    db = auth_session_factory()

    org_a = create_organization(db, name="Org Alpha", slug="alpha")
    org_b = create_organization(db, name="Org Beta", slug="beta")
    seed_default_roles(db)
    db.commit()

    pw_admin = "AdminPass1!"
    pw_viewer = "ViewerPass1!"
    pw_reviewer = "ReviewerPass1!"
    pw_accountant = "AccountantPass1!"

    admin = create_user(
        db, organization_id=org_a.id, email="admin@alpha.com",
        full_name="Alpha Admin", hashed_password=hash_password(pw_admin),
        is_superuser=True,
    )
    viewer = create_user(
        db, organization_id=org_a.id, email="viewer@alpha.com",
        full_name="Alpha Viewer", hashed_password=hash_password(pw_viewer),
    )
    reviewer = create_user(
        db, organization_id=org_a.id, email="reviewer@alpha.com",
        full_name="Alpha Reviewer", hashed_password=hash_password(pw_reviewer),
    )
    accountant = create_user(
        db, organization_id=org_a.id, email="accountant@alpha.com",
        full_name="Alpha Accountant", hashed_password=hash_password(pw_accountant),
    )
    other_org_user = create_user(
        db, organization_id=org_b.id, email="user@beta.com",
        full_name="Beta User", hashed_password=hash_password("BetaPass1!"),
    )

    assign_role(db, user_id=viewer.id, role_name="viewer",
                organization_id=org_a.id)
    assign_role(db, user_id=reviewer.id, role_name="reviewer",
                organization_id=org_a.id)
    assign_role(db, user_id=accountant.id, role_name="accountant",
                organization_id=org_a.id)

    db.commit()

    result = {
        "org_a": org_a, "org_b": org_b,
        "admin": admin, "pw_admin": pw_admin,
        "viewer": viewer, "pw_viewer": pw_viewer,
        "reviewer": reviewer, "pw_reviewer": pw_reviewer,
        "accountant": accountant, "pw_accountant": pw_accountant,
        "other_org_user": other_org_user,
        "db": db,
    }
    yield result
    db.close()


@pytest.fixture(scope="module")
def api_client(auth_session_factory):
    def override_get_db():
        db = auth_session_factory()
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


def _auth_header(user, expires_delta=None):
    """Build a valid Bearer header for the given user."""
    token = create_access_token(
        token_payload_for_user(user),
        expires_delta=expires_delta,
    )
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# 1. Login succeeds with valid credentials
# ---------------------------------------------------------------------------

def test_1_login_valid_credentials(seeded):
    db = seeded["db"]
    user = authenticate_user(db, "admin@alpha.com", seeded["pw_admin"])
    assert user.email == "admin@alpha.com"
    assert user.is_superuser is True


# ---------------------------------------------------------------------------
# 2. Login fails with invalid password
# ---------------------------------------------------------------------------

def test_2_login_invalid_password(seeded):
    db = seeded["db"]
    with pytest.raises(AuthenticationError):
        authenticate_user(db, "viewer@alpha.com", "wrong-password")


# ---------------------------------------------------------------------------
# 3. Login fails for unknown email
# ---------------------------------------------------------------------------

def test_3_login_unknown_email(seeded):
    db = seeded["db"]
    with pytest.raises(AuthenticationError):
        authenticate_user(db, "nobody@nowhere.com", "anything")


# ---------------------------------------------------------------------------
# 4. JWT validation — decode returns correct payload
# ---------------------------------------------------------------------------

def test_4_jwt_payload(seeded):
    admin = seeded["admin"]
    token = create_access_token(token_payload_for_user(admin))
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    assert payload["user_id"] == admin.id
    assert payload["org_id"] == admin.organization_id
    assert payload["sub"] == admin.email
    assert payload["is_su"] is True


# ---------------------------------------------------------------------------
# 5. Expired tokens are rejected by /auth/me
# ---------------------------------------------------------------------------

def test_5_expired_token_rejected(seeded, api_client):
    admin = seeded["admin"]
    expired_header = _auth_header(admin, expires_delta=datetime.timedelta(seconds=-1))
    r = api_client.get("/api/v1/auth/me", headers=expired_header)
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# 6. Org isolation — /auth/me rejects token with wrong org_id
# ---------------------------------------------------------------------------

def test_6_token_org_mismatch_rejected(seeded, api_client):
    # Craft a token claiming to be admin@alpha.com but with the wrong org_id
    admin = seeded["admin"]
    bad_payload = {
        "sub": admin.email,
        "user_id": admin.id,
        "org_id": seeded["org_b"].id,   # wrong org
        "is_su": False,
    }
    bad_token = create_access_token(bad_payload)
    r = api_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {bad_token}"})
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# 7. Viewer cannot mutate accounting objects
# ---------------------------------------------------------------------------

def test_7_viewer_cannot_post_journal_entries(seeded):
    db = seeded["db"]
    viewer = seeded["viewer"]
    with pytest.raises(PermissionDeniedError):
        require_permission(db, viewer, "post_journal_entries")


def test_7b_viewer_cannot_manage_periods(seeded):
    db = seeded["db"]
    viewer = seeded["viewer"]
    with pytest.raises(PermissionDeniedError):
        require_permission(db, viewer, "manage_periods")


# ---------------------------------------------------------------------------
# 8. Reviewer separation — preparer cannot review their own reconciliation
# ---------------------------------------------------------------------------

def test_8_reviewer_separation_enforced(seeded, auth_session_factory):
    db = auth_session_factory()
    org_a = seeded["org_a"]
    reviewer = seeded["reviewer"]
    accountant = seeded["accountant"]

    from app.models.entity import Entity
    from app.models.account import Account

    entity = Entity(
        code="SEP001", name="Sep Entity", entity_type="operating",
        organization_id=org_a.id, currency="USD",
    )
    db.add(entity)
    db.flush()

    account = Account(
        account_number="1100-SEP", account_name="Sep Cash",
        account_type="asset", normal_balance="debit",
    )
    db.add(account)
    db.flush()

    recon = create_reconciliation(
        db,
        organization_id=org_a.id,
        entity_id=entity.id,
        account_id=account.id,
    )
    db.flush()

    # Advance through valid state chain: not_started → in_progress → prepared
    transition_status(db, recon.id, "in_progress", user_id=accountant.id)
    recon = transition_status(db, recon.id, "prepared", user_id=accountant.id)

    # Accountant tries to review their own work — reviewer separation must reject it
    with pytest.raises(ReviewerSeparationError):
        transition_status(db, recon.id, "reviewed", user_id=accountant.id)

    db.rollback()
    db.close()


# ---------------------------------------------------------------------------
# 9. /auth/me returns user for valid token
# ---------------------------------------------------------------------------

def test_9_me_returns_user(seeded, api_client):
    admin = seeded["admin"]
    r = api_client.get("/api/v1/auth/me", headers=_auth_header(admin))
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == "admin@alpha.com"
    assert data["id"] == admin.id


# ---------------------------------------------------------------------------
# 10. /auth/me returns 401 when no token provided
# ---------------------------------------------------------------------------

def test_10_me_no_token_returns_401(api_client):
    r = api_client.get("/api/v1/auth/me")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# 11. /auth/me returns 401 for malformed token
# ---------------------------------------------------------------------------

def test_11_me_malformed_token_returns_401(api_client):
    r = api_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer not.a.real.token"},
    )
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# 12. Account lockout after MAX_LOGIN_ATTEMPTS failures
# ---------------------------------------------------------------------------

def test_12_account_lockout(seeded, auth_session_factory):
    db = auth_session_factory()
    org = seeded["org_a"]

    # Create a dedicated lockout-test user
    lockout_user = create_user(
        db, organization_id=org.id, email="lockout@alpha.com",
        full_name="Lockout Test", hashed_password=hash_password("Correct1!"),
    )
    db.commit()

    bad_attempts = settings.MAX_LOGIN_ATTEMPTS
    for i in range(bad_attempts - 1):
        with pytest.raises(AuthenticationError):
            authenticate_user(db, "lockout@alpha.com", "wrong")

    # The next failure should trigger lockout
    with pytest.raises((AuthenticationError, AccountLockedError)):
        authenticate_user(db, "lockout@alpha.com", "wrong")

    # Subsequent attempts with correct password should be locked
    with pytest.raises(AccountLockedError):
        authenticate_user(db, "lockout@alpha.com", "Correct1!")

    db.rollback()
    db.close()


# ---------------------------------------------------------------------------
# 13. /health endpoint responds correctly
# ---------------------------------------------------------------------------

def test_13_health_endpoint(api_client):
    r = api_client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ---------------------------------------------------------------------------
# 14. /ready endpoint responds correctly
# ---------------------------------------------------------------------------

def test_14_ready_endpoint(api_client):
    r = api_client.get("/ready")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ready"
    assert data["database"] == "ok"


# ---------------------------------------------------------------------------
# 15. Request logging middleware attaches X-Request-Id header
# ---------------------------------------------------------------------------

def test_15_request_id_header_present(api_client):
    r = api_client.get("/health")
    assert "x-request-id" in r.headers


# ---------------------------------------------------------------------------
# Bonus: password hashing round-trip
# ---------------------------------------------------------------------------

def test_password_hash_verify():
    plain = "MySuperSecretPass123!"
    hashed = hash_password(plain)
    assert verify_password(plain, hashed)
    assert not verify_password("wrong", hashed)


# ---------------------------------------------------------------------------
# Bonus: login endpoint via HTTP
# ---------------------------------------------------------------------------

def test_login_endpoint_valid(seeded, api_client):
    r = api_client.post(
        "/api/v1/auth/login",
        json={"email": "admin@alpha.com", "password": seeded["pw_admin"]},
    )
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["expires_in"] > 0


def test_login_endpoint_invalid(api_client):
    r = api_client.post(
        "/api/v1/auth/login",
        json={"email": "admin@alpha.com", "password": "wrong"},
    )
    assert r.status_code == 401
