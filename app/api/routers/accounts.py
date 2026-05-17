from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import AccountCreate, AccountOut, Page
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
    )
    db.add(account)
    db.flush()
    db.refresh(account)
    return account


@router.get("/", response_model=Page[AccountOut])
def list_accounts(
    entity_id: int | None = None,
    account_type: str | None = None,
    active: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(Account)
    if entity_id is not None:
        q = q.filter(Account.entity_id == entity_id)
    if account_type is not None:
        q = q.filter(Account.account_type == account_type)
    if active is not None:
        q = q.filter(Account.active == active)
    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()
    return Page(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, -(-total // page_size)),
    )


@router.get("/{account_id}", response_model=AccountOut)
def get_account(account_id: int, db: Session = Depends(get_db)):
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")
    return account
