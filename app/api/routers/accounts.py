from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import AccountBulkUpdate, AccountCreate, AccountOut, AccountReparentBody, AccountReparentResult, AccountUpdate, Page
from app.models.account import Account
from app.models.journal_entry_line import JournalEntryLine

router = APIRouter(prefix="/accounts", tags=["accounts"])


class BalanceSummary(BaseModel):
    total_debit: Decimal
    total_credit: Decimal
    net_balance: Decimal


class AccountDetail(AccountOut):
    model_config = ConfigDict(from_attributes=True)
    children: list[AccountOut] = []
    balance_summary: BalanceSummary | None = None


def _set_path_and_depth(db: Session, account: Account) -> None:
    """Compute and store account_path and depth_level from the parent chain."""
    if account.parent_account_id is None:
        account.account_path = str(account.id)
        account.depth_level = 0
    else:
        parent = db.get(Account, account.parent_account_id)
        if parent is None:
            account.account_path = str(account.id)
            account.depth_level = 0
        else:
            parent_path = parent.account_path or str(parent.id)
            account.account_path = f"{parent_path}/{account.id}"
            account.depth_level = (parent.depth_level or 0) + 1


def _rebuild_subtree_paths(db: Session, parent: Account) -> None:
    """Recursively recompute account_path and depth_level for all descendants."""
    children = db.query(Account).filter(Account.parent_account_id == parent.id).all()
    for child in children:
        _set_path_and_depth(db, child)
        _rebuild_subtree_paths(db, child)


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
        is_header=body.is_header,
        is_postable=body.is_postable,
        fs_sign_convention=body.fs_sign_convention,
        cfs_section=body.cfs_section,
        fs_statement=body.fs_statement,
        fs_section=body.fs_section,
        fs_line_label=body.fs_line_label,
        fs_line_order=body.fs_line_order,
        sort_order=body.sort_order,
    )
    if body.account_status is not None:
        account.account_status = body.account_status
        if body.active is None:
            account.active = (body.account_status == "active")
    if body.active is not None:
        account.active = body.active
    db.add(account)
    db.flush()
    _set_path_and_depth(db, account)
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
    include_hierarchy: bool = False,
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

    if include_hierarchy:
        id_to_item: dict[int, AccountOut] = {}
        for item in items:
            id_to_item[item.id] = AccountOut.model_validate(item)
        roots: list[AccountOut] = []
        for item in items:
            node = id_to_item[item.id]
            if item.parent_account_id and item.parent_account_id in id_to_item:
                pass
            else:
                roots.append(node)
        return Page(
            items=roots,
            total=total,
            page=page,
            page_size=page_size,
            pages=max(1, -(-total // page_size)),
        )

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


@router.patch("/bulk", response_model=list[AccountOut])
def bulk_update_accounts(body: AccountBulkUpdate, db: Session = Depends(get_db)):
    """Apply the same patch to multiple accounts atomically."""
    if not body.ids:
        return []
    accounts = db.query(Account).filter(Account.id.in_(body.ids)).all()
    patch = body.patch.model_dump(exclude_unset=True)
    for acct in accounts:
        for key, value in patch.items():
            setattr(acct, key, value)
        if "account_status" in patch:
            acct.active = patch["account_status"] == "active"
        if "common_reporting_line_id" in patch:
            acct.crl_state = "assigned" if patch["common_reporting_line_id"] is not None else "unclassified"
    db.flush()
    for acct in accounts:
        db.refresh(acct)
    return accounts


# ---------------------------------------------------------------------------
# Correction 3 — focused Account → FSLI mapping endpoint (Mapping Center)
# ---------------------------------------------------------------------------

class BulkFsliAssign(BaseModel):
    account_ids: list[int]
    common_reporting_line_id: int | None


@router.post("/bulk-fsli", response_model=list[AccountOut])
def bulk_assign_fsli(body: BulkFsliAssign, db: Session = Depends(get_db)):
    """
    Bulk assign (or clear) the canonical Account → FSLI mapping for many
    accounts at once. Used by Mapping Center's bulk-assign action and the
    wizard's "Apply All Matched" path. Setting common_reporting_line_id=null
    clears the mapping and sets crl_state back to 'unclassified'.
    """
    if not body.account_ids:
        return []
    accounts = db.query(Account).filter(Account.id.in_(body.account_ids)).all()
    for acct in accounts:
        acct.common_reporting_line_id = body.common_reporting_line_id
        acct.crl_state = (
            "assigned" if body.common_reporting_line_id is not None else "unclassified"
        )
    db.flush()
    for acct in accounts:
        db.refresh(acct)
    return accounts


@router.get("/{account_id}", response_model=AccountDetail)
def get_account(account_id: int, db: Session = Depends(get_db)):
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")
    children = db.query(Account).filter(Account.parent_account_id == account_id).all()
    lines = db.query(JournalEntryLine).filter(JournalEntryLine.account_id == account_id).all()
    total_debit = sum(Decimal(str(l.debit)) for l in lines)
    total_credit = sum(Decimal(str(l.credit)) for l in lines)
    if account.normal_balance == "debit":
        net_balance = total_debit - total_credit
    else:
        net_balance = total_credit - total_debit
    balance_summary = BalanceSummary(
        total_debit=total_debit,
        total_credit=total_credit,
        net_balance=net_balance,
    )
    detail = AccountDetail.model_validate(account)
    detail.children = [AccountOut.model_validate(c) for c in children]
    detail.balance_summary = balance_summary
    return detail


@router.post("/{account_id}/deactivate", response_model=AccountOut)
def deactivate_account(account_id: int, db: Session = Depends(get_db)):
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")
    lines = db.query(JournalEntryLine).filter(JournalEntryLine.account_id == account_id).all()
    total_debit = sum(Decimal(str(l.debit)) for l in lines)
    total_credit = sum(Decimal(str(l.credit)) for l in lines)
    if account.normal_balance == "debit":
        net_balance = total_debit - total_credit
    else:
        net_balance = total_credit - total_debit
    if net_balance != Decimal("0"):
        raise HTTPException(status_code=409, detail="Cannot deactivate account with non-zero balance")
    account.active = False
    account.account_status = "inactive"
    db.flush()
    db.refresh(account)
    return account


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: int, db: Session = Depends(get_db)):
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")
    je_lines = db.query(JournalEntryLine).filter(JournalEntryLine.account_id == account_id).first()
    if je_lines is not None:
        raise HTTPException(status_code=409, detail="Cannot delete account with posted journal entry lines")
    child = db.query(Account).filter(Account.parent_account_id == account_id).first()
    if child is not None:
        raise HTTPException(status_code=409, detail="Cannot delete account with child accounts — reassign children first")
    db.delete(account)
    db.flush()


def propagate_taxonomy_to_children(parent_id: int, old_taxonomy_id: int | None, new_taxonomy_id: int | None, db: Session):
    """
    Recursively propagate taxonomy changes from a parent account to its children.
    A child is considered to have inherited the mapping if its current `reporting_taxonomy_line_id`
    matches the parent's `old_reporting_taxonomy_line_id` or is `None`/unset.
    """
    children = db.query(Account).filter(Account.parent_account_id == parent_id).all()
    for child in children:
        if child.reporting_taxonomy_line_id == old_taxonomy_id or child.reporting_taxonomy_line_id is None:
            old_child_tax = child.reporting_taxonomy_line_id
            child.reporting_taxonomy_line_id = new_taxonomy_id
            propagate_taxonomy_to_children(child.id, old_child_tax, new_taxonomy_id, db)


def propagate_status_to_children(parent_id: int, old_status: str | None, new_status: str, db: Session):
    children = db.query(Account).filter(Account.parent_account_id == parent_id).all()
    for child in children:
        if child.account_status == old_status or child.account_status is None:
            old_child_status = child.account_status
            child.account_status = new_status
            child.active = (new_status == "active")
            propagate_status_to_children(child.id, old_child_status, new_status, db)


def propagate_type_to_children(parent_id: int, old_type: str | None, new_type: str, db: Session):
    children = db.query(Account).filter(Account.parent_account_id == parent_id).all()
    for child in children:
        if child.account_type == old_type or child.account_type is None:
            old_child_type = child.account_type
            child.account_type = new_type
            propagate_type_to_children(child.id, old_child_type, new_type, db)


@router.patch("/{account_id}", response_model=AccountOut)
def update_account(account_id: int, body: AccountUpdate, db: Session = Depends(get_db)):
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")

    if body.account_number is not None:
        account.account_number = body.account_number
    if body.account_name is not None:
        account.account_name = body.account_name
    if body.account_type is not None:
        old_type = account.account_type
        account.account_type = body.account_type
        if old_type != body.account_type:
            propagate_type_to_children(account.id, old_type, body.account_type, db)
    if body.normal_balance is not None:
        account.normal_balance = body.normal_balance
    if body.detail_type is not None:
        account.detail_type = body.detail_type
    if body.description is not None:
        account.description = body.description
    if body.tax_line is not None:
        account.tax_line = body.tax_line
    if body.account_status is not None:
        old_status = account.account_status
        account.account_status = body.account_status
        account.active = body.account_status == "active"
        if old_status != body.account_status:
            propagate_status_to_children(account.id, old_status, body.account_status, db)
    if "reporting_taxonomy_line_id" in body.model_fields_set:
        old_tax_id = account.reporting_taxonomy_line_id
        new_tax_id = body.reporting_taxonomy_line_id
        account.reporting_taxonomy_line_id = new_tax_id
        if old_tax_id != new_tax_id:
            propagate_taxonomy_to_children(account.id, old_tax_id, new_tax_id, db)
    if "common_reporting_line_id" in body.model_fields_set:
        # Canonical Account → FSLI mapping. Setting/clearing this is what
        # Mapping Center, the wizard, and the by-FSLI statements all read.
        account.common_reporting_line_id = body.common_reporting_line_id
        account.crl_state = "assigned" if body.common_reporting_line_id is not None else "unclassified"
    if body.parent_account_id is not None:
        account.parent_account_id = body.parent_account_id
    if body.active is not None:
        account.active = body.active
    if body.is_header is not None:
        account.is_header = body.is_header
    if body.is_postable is not None:
        account.is_postable = body.is_postable
    if "fs_sign_convention" in body.model_fields_set:
        account.fs_sign_convention = body.fs_sign_convention
    if body.cfs_section is not None:
        account.cfs_section = body.cfs_section
    if body.fs_statement is not None:
        account.fs_statement = body.fs_statement
    if "fs_section" in body.model_fields_set:
        account.fs_section = body.fs_section
    if body.fs_line_label is not None:
        account.fs_line_label = body.fs_line_label
    if body.fs_line_order is not None:
        account.fs_line_order = body.fs_line_order
    if body.sort_order is not None:
        account.sort_order = body.sort_order

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

    # Inherit from new parent: taxonomy line if inherited (matches old parent or is None)
    old_parent_tax_id = old_parent.reporting_taxonomy_line_id if old_parent else None
    is_inherited = (account.reporting_taxonomy_line_id == old_parent_tax_id) or (account.reporting_taxonomy_line_id is None)

    if is_inherited:
        new_tax_id = None
        if new_parent_id is not None:
            new_parent_acct = db.get(Account, new_parent_id)
            if new_parent_acct:
                new_tax_id = new_parent_acct.reporting_taxonomy_line_id
        
        old_tax_id = account.reporting_taxonomy_line_id
        account.reporting_taxonomy_line_id = new_tax_id
        if old_tax_id != new_tax_id:
            propagate_taxonomy_to_children(account.id, old_tax_id, new_tax_id, db)

    # Inherit detail_type, account_type, and account_status if inherited/unset
    old_parent_type = old_parent.account_type if old_parent else None
    is_type_inherited = (account.account_type == old_parent_type) or (account.account_type is None) or (old_parent_type is None)

    old_parent_status = old_parent.account_status if old_parent else None
    is_status_inherited = (account.account_status == old_parent_status) or (account.account_status is None) or (old_parent_status is None)

    if new_parent_id is not None:
        new_parent_acct = db.get(Account, new_parent_id)
        if new_parent_acct is not None:
            if not account.detail_type and new_parent_acct.detail_type:
                account.detail_type = new_parent_acct.detail_type
            if is_type_inherited and new_parent_acct.account_type:
                old_type = account.account_type
                account.account_type = new_parent_acct.account_type
                if old_type != new_parent_acct.account_type:
                    propagate_type_to_children(account.id, old_type, new_parent_acct.account_type, db)
            if is_status_inherited and new_parent_acct.account_status:
                old_status = account.account_status
                account.account_status = new_parent_acct.account_status
                account.active = new_parent_acct.active
                if old_status != new_parent_acct.account_status:
                    propagate_status_to_children(account.id, old_status, new_parent_acct.account_status, db)

    _set_path_and_depth(db, account)
    _rebuild_subtree_paths(db, account)

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


@router.post("/backfill-paths", status_code=200)
def backfill_account_paths(entity_id: int | None = None, db: Session = Depends(get_db)):
    """
    Backfill account_path and depth_level for all accounts that lack them.
    Process root accounts first, then children in BFS order.
    """
    q = db.query(Account).filter(Account.account_path == None)  # noqa: E711
    if entity_id is not None:
        q = q.filter(Account.entity_id == entity_id)
    accounts_missing = q.all()

    def process(account: Account) -> None:
        if account.account_path is not None:
            return
        if account.parent_account_id is not None:
            parent = db.get(Account, account.parent_account_id)
            if parent and parent.account_path is None:
                process(parent)
        _set_path_and_depth(db, account)

    for acct in accounts_missing:
        process(acct)

    db.flush()
    return {"updated": len(accounts_missing)}


@router.post("/backfill-fs-sign", status_code=200)
def backfill_fs_sign_convention(entity_id: int | None = None, db: Session = Depends(get_db)):
    """
    Populate fs_sign_convention from normal_balance for accounts where it is NULL.
    debit normal_balance → 1 (assets, expenses)
    credit normal_balance → -1 (liabilities, equity, revenue)
    """
    q = db.query(Account).filter(Account.fs_sign_convention == None)  # noqa: E711
    if entity_id is not None:
        q = q.filter(Account.entity_id == entity_id)
    accounts_missing = q.all()
    for acct in accounts_missing:
        acct.fs_sign_convention = 1 if acct.normal_balance == "debit" else -1
    db.flush()
    return {"updated": len(accounts_missing)}
