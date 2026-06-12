import json
from sqlalchemy.orm import Session

from app.data.issue_repository_data import ISSUE_REPOSITORY
from app.models.issue_template import IssueTemplate
from app.schemas.detection_rule import DetectionRule


def _row_to_dict(row: IssueTemplate) -> dict:
    return {
        "id": row.id,
        "code": row.code,
        "category": row.category,
        "subcategory": row.subcategory,
        "issue_type": row.issue_type,
        "name": row.name,
        "description": row.description,
        "risk_level": row.risk_level,
        "materiality_note": row.materiality_note,
        "detection_logic": row.detection_logic,
        "detection_logic_json": (
            json.loads(row.detection_logic_json)
            if row.detection_logic_json else None
        ),
        "potential_causes": json.loads(row.potential_causes_json or "[]"),
        "suggested_procedures": json.loads(row.suggested_procedures_json or "[]"),
        "suggested_ajes": json.loads(row.suggested_ajes_json or "[]"),
        "management_questions": json.loads(row.management_questions_json or "[]"),
        "affected_account_types": json.loads(row.affected_account_types_json or "[]"),
        "affected_statements": json.loads(row.affected_statements_json or "[]"),
        "audit_assertions": json.loads(row.audit_assertions_json or "[]"),
        "references": json.loads(row.references_json or "[]"),
        "sort_order": row.sort_order,
        "is_active": row.is_active,
        "is_system": row.is_system,
        "organization_id": row.organization_id,
    }


def seed_issue_templates(db: Session) -> int:
    existing_codes = {r[0] for r in db.query(IssueTemplate.code).all()}
    added = 0
    updated = 0
    for entry in ISSUE_REPOSITORY:
        rule_json = entry.get("detection_logic_json")
        rule_str = json.dumps(rule_json) if rule_json is not None else None

        if entry["code"] in existing_codes:
            # Back-fill detection_logic_json for rows that predate Sprint 3.14
            row = db.query(IssueTemplate).filter(
                IssueTemplate.code == entry["code"],
                IssueTemplate.detection_logic_json.is_(None),
            ).first()
            if row and rule_str:
                row.detection_logic_json = rule_str
                updated += 1
            continue

        row = IssueTemplate(
            code=entry["code"],
            category=entry["category"],
            subcategory=entry.get("subcategory"),
            issue_type=entry["issue_type"],
            name=entry["name"],
            description=entry["description"],
            risk_level=entry.get("risk_level", "moderate"),
            materiality_note=entry.get("materiality_note"),
            detection_logic=entry.get("detection_logic"),
            detection_logic_json=rule_str,
            potential_causes_json=json.dumps(entry.get("potential_causes", [])),
            suggested_procedures_json=json.dumps(entry.get("suggested_procedures", [])),
            suggested_ajes_json=json.dumps(entry.get("suggested_ajes", [])),
            management_questions_json=json.dumps(entry.get("management_questions", [])),
            affected_account_types_json=json.dumps(entry.get("affected_account_types", [])),
            affected_statements_json=json.dumps(entry.get("affected_statements", [])),
            audit_assertions_json=json.dumps(entry.get("audit_assertions", [])),
            references_json=json.dumps(entry.get("references", [])),
            sort_order=entry.get("sort_order", 0),
            is_active=True,
            is_system=True,
            organization_id=None,
        )
        db.add(row)
        added += 1

    db.commit()
    return added


def list_templates(
    db: Session,
    category: str | None = None,
    issue_type: str | None = None,
    risk_level: str | None = None,
    rule_type: str | None = None,
    search: str | None = None,
    organization_id: int | None = None,
) -> list[dict]:
    q = db.query(IssueTemplate).filter(IssueTemplate.is_active == True)
    q = q.filter(
        (IssueTemplate.organization_id == None) |
        (IssueTemplate.organization_id == organization_id)
    )
    if category:
        q = q.filter(IssueTemplate.category == category)
    if issue_type:
        q = q.filter(IssueTemplate.issue_type == issue_type)
    if risk_level:
        q = q.filter(IssueTemplate.risk_level == risk_level)
    if rule_type:
        from sqlalchemy import func
        q = q.filter(
            func.json_extract(IssueTemplate.detection_logic_json, "$.rule_type") == rule_type
        )
    if search:
        term = f"%{search}%"
        q = q.filter(
            IssueTemplate.name.ilike(term) |
            IssueTemplate.description.ilike(term) |
            IssueTemplate.code.ilike(term)
        )
    rows = q.order_by(IssueTemplate.category, IssueTemplate.sort_order).all()
    return [_row_to_dict(r) for r in rows]


def get_template(db: Session, code: str) -> dict | None:
    row = db.query(IssueTemplate).filter(IssueTemplate.code == code).first()
    return _row_to_dict(row) if row else None


def list_categories(db: Session) -> list[dict]:
    from sqlalchemy import func
    rows = (
        db.query(IssueTemplate.category, func.count(IssueTemplate.id))
        .filter(IssueTemplate.is_active == True)
        .group_by(IssueTemplate.category)
        .order_by(IssueTemplate.category)
        .all()
    )
    return [{"category": r[0], "count": r[1]} for r in rows]


def validate_repository_rules() -> dict:
    """
    Validate all DETECTION_RULES entries against the DetectionRule schema.
    Returns a summary dict with per-code validation results.
    Called from the /repository/validate-rules endpoint.
    """
    from app.data.issue_repository_data import DETECTION_RULES

    errors: dict[str, str] = {}
    valid_codes: list[str] = []

    for code, rule_dict in DETECTION_RULES.items():
        try:
            DetectionRule.model_validate(rule_dict)
            valid_codes.append(code)
        except Exception as exc:
            errors[code] = str(exc)

    all_codes = {t["code"] for t in ISSUE_REPOSITORY}
    missing = sorted(all_codes - set(DETECTION_RULES.keys()))

    return {
        "total_templates": len(all_codes),
        "total_rules": len(DETECTION_RULES),
        "valid": len(valid_codes),
        "errors": errors,
        "missing_rules": missing,
        "coverage_pct": round(100 * len(DETECTION_RULES) / len(all_codes), 1) if all_codes else 0,
    }
