"""Users and role-assignment router."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.api.schemas import (
    AssignRoleRequest,
    PermissionsOut,
    UserCreate,
    UserOut,
    UserRoleOut,
)
from app.services.permission_service import get_user_permissions
from app.services.user_service import (
    assign_role,
    create_user,
    get_user_or_raise,
    list_users,
    remove_role,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/", response_model=UserOut, status_code=201)
def create_new_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    acting_user=Depends(get_current_user),
):
    return create_user(
        db,
        organization_id=body.organization_id,
        email=body.email,
        full_name=body.full_name,
        is_active=body.is_active,
        is_superuser=body.is_superuser,
        acting_user=acting_user,
    )


@router.get("/", response_model=list[UserOut])
def list_org_users(
    organization_id: int,
    db: Session = Depends(get_db),
    acting_user=Depends(get_current_user),
):
    return list_users(db, organization_id=organization_id, acting_user=acting_user)


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)):
    return get_user_or_raise(db, user_id)


@router.post("/{user_id}/roles", response_model=UserRoleOut, status_code=201)
def assign_user_role(
    user_id: int,
    body: AssignRoleRequest,
    db: Session = Depends(get_db),
    acting_user=Depends(get_current_user),
):
    return assign_role(
        db,
        user_id=user_id,
        role_name=body.role_name,
        organization_id=body.organization_id,
        entity_id=body.entity_id,
        acting_user=acting_user,
    )


@router.delete("/roles/{user_role_id}", status_code=204)
def remove_user_role(
    user_role_id: int,
    db: Session = Depends(get_db),
    acting_user=Depends(get_current_user),
):
    remove_role(db, user_role_id=user_role_id, acting_user=acting_user)


@router.get("/{user_id}/permissions", response_model=PermissionsOut)
def get_permissions(user_id: int, db: Session = Depends(get_db)):
    user = get_user_or_raise(db, user_id)
    perms = get_user_permissions(db, user)
    return PermissionsOut(user_id=user_id, permissions=sorted(perms))
