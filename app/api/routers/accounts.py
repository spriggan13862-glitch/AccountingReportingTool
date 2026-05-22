from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import AccountCreate, AccountOut, AccountReparentBody, AccountReparentResult, AccountUpdate, Page
from app.models.account import Account

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.post("/", response_model=AccountOut, status_code=201)
def create_account(body: AccountCreate, db: Session = Depends(get_db)):
    account = Account(
        entity_id=body.entity_id,
        account_number=body.account_number,
        account_name=body.account_name,
        account_type=body.account_type,
        normal_balance=body.normal_balance,
        parent_account_id=body.parent_account_id,
        detail_type=body.detail_type,
        description=body.description,
        tax_line=body.tax_line,
        source_system=body.source_system,
        reporting_taxonomy_line_id=body.reporting_taxonomy_line_id,
    )
    db.add(account)
    db.flush()
    db.refresh(account)
    return account


@router.get("/", response_model=Page[AccountOut])
def list_accounts(
    entity_id: int | None = None,
    account_type: str | None = None,
    account_status: str | None = None,
    active: bool | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(Account)
    if entity_id is not None:
        q = q.filter(Account.entity_id == entity_id)
    if account_type is not None:
        q = q.filter(Account.account_type == account_type)
    if account_status is not None:
        q = q.filter(Account.account_status == account_status)
    if active is not None:
        q = q.filter(Account.active == active)
    if search:
        term = f"%{search}%"
        q = q.filter(
            Account.account_number.ilike(term) | Account.account_name.ilike(term)
        )
    total = q.count()
    items = q.order_by(Account.account_number).offset((page - 1) * page_size).limit(page_size).all()
    return Page(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, -(-total // page_size)),
    )


@router.get("/tree", response_model=list[dict])
def accounts_tree(
    entity_id: int,
    db: Session = Depends(get_db),
):
    """Return accounts as a nested tree structure for hierarchy visualization."""
    accounts = (
        db.query(Account)
        .filter(Account.entity_id == entity_id)
        .order_by(Account.account_number)
        .all()
    )

    id_to_node: dict[int, dict] = {}
    for a in accounts:
        id_to_node[a.id] = {
            "id": a.id,
            "account_number": a.account_number,
            "account_name": a.account_name,
            "account_type": a.account_type,
            "normal_balance": a.normal_balance,
            "detail_type": a.detail_type,
            "account_status": a.account_status,
            "description": a.description,
            "reporting_taxonomy_line_id": a.reporting_taxonomy_line_id,
            "parent_account_id": a.parent_account_id,
            "active": a.active,
            "children": [],
        }

    roots: list[dict] = []
    for a in accounts:
        node = id_to_node[a.id]
        if a.parent_account_id and a.parent_account_id in id_to_node:
            id_to_node[a.parent_account_id]["children"].append(node)
        else:
            roots.append(node)

    return roots


@router.get("/{account_id}", response_model=AccountOut)
def get_account(account_id: int, db: Session = Depends(get_db)):
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")
    return account


@router.patch("/{account_id}", response_model=AccountOut)
def update_account(account_id: int, body: AccountUpdate, db: Session = Depends(get_db)):
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")

    if body.account_name is not None:
        account.account_name = body.account_name
    if body.account_type is not None:
        account.account_type = body.account_type
    if body.normal_balance is not None:
        account.normal_balance = body.normal_balance
    if body.detail_type is not None:
        account.detail_type = body.detail_type
    if body.description is not None:
        account.description = body.description
    if body.tax_line is not None:
        account.tax_line = body.tax_line
    if body.account_status is not None:
        account.account_status = body.account_status
        account.active = body.account_status == "active"
    if body.reporting_taxonomy_line_id is not None:
        account.reporting_taxonomy_line_id = body.reporting_taxonomy_line_id
    if body.parent_account_id is not None:
        account.parent_account_id = body.parent_account_id
    if body.active is not None:
        account.active = body.active

    db.flush()
    db.refresh(account)
    return account


def _would_create_cycle(account_id: int, new_parent_id: int, db: Session) -> bool:
    """Walk up from new_parent_id; if we reach account_id, that's a cycle."""
    visited: set[int] = set()
    current_id: int | None = new_parent_id
    while current_id is not None:
        if current_id == account_id:
            return True
        if current_id in visited:
            break
        visited.add(current_id)
        parent = db.get(Account, current_id)
        if parent is None:
            break
        current_id = parent.parent_account_id
    return False


@router.post("/{account_id}/reparent", response_model=AccountReparentResult)
def reparent_account(
    account_id: int,
    body: AccountReparentBody,
    db: Session = Depends(get_db),
):
    """
    Change an account's parent.  body.parent_account_id = null moves the account to root.
    Validates: no self-parent, no circular hierarchy.
    Returns old + new parent info for audit trail and toast messages.
    """
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")

    new_parent_id = body.parent_account_id

    if new_parent_id == account_id:
        raise HTTPException(status_code=422, detail="An account cannot be its own parent")

    if new_parent_id is not None:
        new_parent_account = db.get(Account, new_parent_id)
        if new_parent_account is None:
            raise HTTPException(status_code=404, detail=f"Parent account {new_parent_id} not found")
        if new_parent_account.entity_id != account.entity_id:
            raise HTTPException(status_code=422, detail="Parent account must belong to the same entity")
        if _would_create_cycle(account_id, new_parent_id, db):
            raise HTTPException(
                status_code=422,
                detail="This reparent operation would create a circular hierarchy",
            )

    # Capture old parent for audit response
    old_parent_id = account.parent_account_id
    old_parent = db.get(Account, old_parent_id) if old_parent_id is not None else None

    account.parent_account_id = new_parent_id
    db.flush()
    db.refresh(account)

    new_parent = db.get(Account, new_parent_id) if new_parent_id is not None else None

    return AccountReparentResult(
        account_id=account.id,
        account_number=account.account_number,
        account_name=account.account_name,
        old_parent_id=old_parent_id,
        old_parent_number=old_parent.account_number if old_parent else None,
        old_parent_name=old_parent.account_name if old_parent else None,
        new_parent_id=new_parent_id,
        new_parent_number=new_parent.account_number if new_parent else None,
        new_parent_name=new_parent.account_name if new_parent else None,
    )
