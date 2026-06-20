"""
Taxonomy library service.

Manages the Taxonomy + TaxonomyNode + AccountTaxonomyMapping triple:
- Seeding system taxonomies from JSON definitions
- Cloning system taxonomies into editable user copies
- Mapping accounts to taxonomy nodes (multi-taxonomy aware)
- Rule-based mapping suggestions

System taxonomies (is_system=True) are immutable; attempts to modify them
raise a TaxonomyImmutableError. Users must clone first.
"""
from __future__ import annotations
import json
from datetime import datetime
from pathlib import Path
from sqlalchemy.orm import Session
from app.models.taxonomy import Taxonomy, TaxonomyNode, AccountTaxonomyMapping


SEED_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "taxonomies"


class TaxonomyImmutableError(Exception):
    """Raised when a user attempts to edit a system taxonomy directly."""


class TaxonomyNotFoundError(Exception):
    """Raised when a requested taxonomy/node does not exist."""


# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------

def seed_system_taxonomies(db: Session, seed_dir: Path | None = None) -> dict:
    """
    Load all JSON files from data/taxonomies/ and seed system taxonomies.

    Idempotent: an existing system taxonomy with the same code is skipped
    (use force_reseed_system_taxonomy() to replace).

    Returns: {taxonomy_code: node_count}
    """
    seed_dir = seed_dir or SEED_DIR
    results = {}
    if not seed_dir.exists():
        return results

    for json_file in sorted(seed_dir.glob("*.json")):
        with open(json_file, encoding="utf-8") as f:
            data = json.load(f)
        code = data["code"]
        existing = db.query(Taxonomy).filter_by(code=code, is_system=True).first()
        if existing:
            results[code] = db.query(TaxonomyNode).filter_by(taxonomy_id=existing.id).count()
            continue
        count = _load_taxonomy_from_dict(db, data)
        results[code] = count

    db.commit()
    return results


def force_reseed_system_taxonomy(db: Session, code: str, seed_dir: Path | None = None) -> int:
    """Delete and reseed a single system taxonomy (admin op)."""
    seed_dir = seed_dir or SEED_DIR
    json_file = seed_dir / f"{code}.json"
    if not json_file.exists():
        raise TaxonomyNotFoundError(f"No seed file for {code}")
    existing = db.query(Taxonomy).filter_by(code=code, is_system=True).first()
    if existing:
        db.delete(existing)
        db.flush()
    with open(json_file, encoding="utf-8") as f:
        data = json.load(f)
    count = _load_taxonomy_from_dict(db, data)
    db.commit()
    return count


def _load_taxonomy_from_dict(db: Session, data: dict) -> int:
    """Load one taxonomy from a parsed JSON dict. Returns node count."""
    tx = Taxonomy(
        code=data["code"],
        name=data["name"],
        description=data.get("description"),
        industry=data.get("industry"),
        version=data.get("version"),
        is_system=True,
        is_active=True,
    )
    db.add(tx)
    db.flush()

    code_to_id: dict[str, int] = {}
    flat_nodes = _flatten_nodes(data.get("nodes", []), parent_code=None, level=0)
    flat_nodes.sort(key=lambda n: (n["_level"], n.get("sort_order", 0)))
    for n in flat_nodes:
        parent_id = code_to_id.get(n["_parent_code"]) if n["_parent_code"] else None
        node = TaxonomyNode(
            taxonomy_id=tx.id,
            parent_id=parent_id,
            code=n["code"],
            name=n["name"],
            description=n.get("description"),
            statement_type=n.get("statement_type"),
            financial_statement_section=n.get("financial_statement_section"),
            normal_balance=n.get("normal_balance"),
            sort_order=n.get("sort_order", 0),
            level=n["_level"],
            is_active=True,
            is_system=True,
            gaap_reference=n.get("gaap_reference"),
            ifrs_reference=n.get("ifrs_reference"),
            xbrl_tag=n.get("xbrl_tag"),
            cash_flow_classification=n.get("cash_flow_classification"),
            consolidation_treatment=n.get("consolidation_treatment"),
            kpi_eligible=n.get("kpi_eligible", False),
            industry=data.get("industry"),
        )
        db.add(node)
        db.flush()
        code_to_id[n["code"]] = node.id
    return len(flat_nodes)


def _flatten_nodes(nodes: list, parent_code: str | None, level: int) -> list:
    out = []
    for n in nodes:
        children = n.pop("children", []) if "children" in n else []
        n["_parent_code"] = parent_code
        n["_level"] = level
        out.append(n)
        out.extend(_flatten_nodes(children, parent_code=n["code"], level=level + 1))
    return out


# ---------------------------------------------------------------------------
# Listing / retrieval
# ---------------------------------------------------------------------------

def list_taxonomies(db: Session, include_inactive: bool = False) -> list[Taxonomy]:
    q = db.query(Taxonomy)
    if not include_inactive:
        q = q.filter(Taxonomy.is_active.is_(True))
    return q.order_by(Taxonomy.is_system.desc(), Taxonomy.name).all()


def get_taxonomy(db: Session, taxonomy_id: int) -> Taxonomy:
    tx = db.query(Taxonomy).filter_by(id=taxonomy_id).first()
    if not tx:
        raise TaxonomyNotFoundError(f"Taxonomy {taxonomy_id} not found")
    return tx


def get_taxonomy_tree(db: Session, taxonomy_id: int) -> list[dict]:
    """Return taxonomy nodes as a nested tree (parent → children)."""
    tx = get_taxonomy(db, taxonomy_id)
    all_nodes = db.query(TaxonomyNode).filter_by(taxonomy_id=tx.id).order_by(TaxonomyNode.sort_order).all()
    by_id = {n.id: _node_to_dict(n) for n in all_nodes}
    roots: list[dict] = []
    for n in all_nodes:
        d = by_id[n.id]
        if n.parent_id and n.parent_id in by_id:
            by_id[n.parent_id]["children"].append(d)
        else:
            roots.append(d)
    return roots


def _node_to_dict(n: TaxonomyNode) -> dict:
    return {
        "id": n.id,
        "code": n.code,
        "name": n.name,
        "description": n.description,
        "statement_type": n.statement_type,
        "financial_statement_section": n.financial_statement_section,
        "normal_balance": n.normal_balance,
        "sort_order": n.sort_order,
        "level": n.level,
        "is_active": n.is_active,
        "is_system": n.is_system,
        "gaap_reference": n.gaap_reference,
        "ifrs_reference": n.ifrs_reference,
        "xbrl_tag": n.xbrl_tag,
        "cash_flow_classification": n.cash_flow_classification,
        "consolidation_treatment": n.consolidation_treatment,
        "kpi_eligible": n.kpi_eligible,
        "industry": n.industry,
        "parent_id": n.parent_id,
        "taxonomy_id": n.taxonomy_id,
        "children": [],
    }


# ---------------------------------------------------------------------------
# Cloning
# ---------------------------------------------------------------------------

def clone_taxonomy(db: Session, source_taxonomy_id: int, new_name: str, new_code: str | None = None) -> Taxonomy:
    """
    Clone a taxonomy (typically a system one) into a user-editable copy.
    Preserves parent_taxonomy_id back to the source.
    """
    source = get_taxonomy(db, source_taxonomy_id)
    code = new_code or _derive_clone_code(db, source.code)
    if db.query(Taxonomy).filter_by(code=code).first():
        raise ValueError(f"Taxonomy code {code} already in use")

    clone = Taxonomy(
        code=code,
        name=new_name,
        description=source.description,
        industry=source.industry,
        version=source.version,
        is_system=False,
        parent_taxonomy_id=source.id,
        is_active=True,
    )
    db.add(clone)
    db.flush()

    source_nodes = db.query(TaxonomyNode).filter_by(taxonomy_id=source.id).all()
    id_map: dict[int, int] = {}
    for sn in sorted(source_nodes, key=lambda n: (n.level, n.sort_order)):
        new_parent = id_map.get(sn.parent_id) if sn.parent_id else None
        new_node = TaxonomyNode(
            taxonomy_id=clone.id,
            parent_id=new_parent,
            code=sn.code,
            name=sn.name,
            description=sn.description,
            statement_type=sn.statement_type,
            financial_statement_section=sn.financial_statement_section,
            normal_balance=sn.normal_balance,
            sort_order=sn.sort_order,
            level=sn.level,
            is_active=sn.is_active,
            is_system=False,
            gaap_reference=sn.gaap_reference,
            ifrs_reference=sn.ifrs_reference,
            xbrl_tag=sn.xbrl_tag,
            cash_flow_classification=sn.cash_flow_classification,
            consolidation_treatment=sn.consolidation_treatment,
            kpi_eligible=sn.kpi_eligible,
            industry=sn.industry,
        )
        db.add(new_node)
        db.flush()
        id_map[sn.id] = new_node.id

    db.commit()
    db.refresh(clone)
    return clone


def _derive_clone_code(db: Session, source_code: str) -> str:
    base = f"{source_code}_custom"
    code = base
    suffix = 1
    while db.query(Taxonomy).filter_by(code=code).first():
        suffix += 1
        code = f"{base}_{suffix}"
    return code


# ---------------------------------------------------------------------------
# Node CRUD (user taxonomies only)
# ---------------------------------------------------------------------------

def _assert_editable(tx: Taxonomy) -> None:
    if tx.is_system:
        raise TaxonomyImmutableError(
            f"Taxonomy '{tx.name}' is system-owned and cannot be edited directly. "
            "Clone it first."
        )


def create_node(db: Session, taxonomy_id: int, payload: dict) -> TaxonomyNode:
    tx = get_taxonomy(db, taxonomy_id)
    _assert_editable(tx)
    node = TaxonomyNode(
        taxonomy_id=tx.id,
        is_system=False,
        is_active=True,
        **{k: v for k, v in payload.items() if hasattr(TaxonomyNode, k)},
    )
    db.add(node)
    db.commit()
    db.refresh(node)
    return node


def update_node(db: Session, node_id: int, payload: dict) -> TaxonomyNode:
    node = db.query(TaxonomyNode).filter_by(id=node_id).first()
    if not node:
        raise TaxonomyNotFoundError(f"Node {node_id} not found")
    tx = get_taxonomy(db, node.taxonomy_id)
    _assert_editable(tx)
    for k, v in payload.items():
        if hasattr(TaxonomyNode, k) and k not in ("id", "taxonomy_id", "is_system"):
            setattr(node, k, v)
    node.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(node)
    return node


def deactivate_node(db: Session, node_id: int) -> TaxonomyNode:
    return update_node(db, node_id, {"is_active": False})


# ---------------------------------------------------------------------------
# Mapping
# ---------------------------------------------------------------------------

def map_account(
    db: Session,
    account_id: int,
    taxonomy_id: int,
    taxonomy_node_id: int,
    *,
    mapping_source: str = "user_selected",
    mapping_type: str = "manual",
    confidence_score: float | None = None,
    is_primary: bool = False,
    mapped_by: int | None = None,
) -> AccountTaxonomyMapping:
    """Upsert mapping for (account_id, taxonomy_id) → taxonomy_node_id."""
    existing = (
        db.query(AccountTaxonomyMapping)
        .filter_by(account_id=account_id, taxonomy_id=taxonomy_id)
        .first()
    )
    if existing:
        existing.taxonomy_node_id = taxonomy_node_id
        existing.mapping_source = mapping_source
        existing.mapping_type = mapping_type
        existing.confidence_score = confidence_score
        existing.is_primary = is_primary
        existing.mapped_by = mapped_by
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing

    m = AccountTaxonomyMapping(
        account_id=account_id,
        taxonomy_id=taxonomy_id,
        taxonomy_node_id=taxonomy_node_id,
        mapping_source=mapping_source,
        mapping_type=mapping_type,
        confidence_score=confidence_score,
        is_primary=is_primary,
        mapped_by=mapped_by,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


def bulk_map_accounts(db: Session, mappings: list[dict]) -> int:
    """Bulk upsert mappings. Each dict: {account_id, taxonomy_id, taxonomy_node_id, ...}"""
    count = 0
    for m in mappings:
        map_account(db, **m)
        count += 1
    return count


def get_account_mappings(db: Session, account_id: int) -> list[AccountTaxonomyMapping]:
    return db.query(AccountTaxonomyMapping).filter_by(account_id=account_id).all()


def delete_account_mapping(db: Session, mapping_id: int) -> None:
    m = db.query(AccountTaxonomyMapping).filter_by(id=mapping_id).first()
    if m:
        db.delete(m)
        db.commit()
