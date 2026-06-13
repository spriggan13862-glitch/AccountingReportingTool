import json
from sqlalchemy.orm import Session

from app.data.issue_repository_data import ISSUE_REPOSITORY
from app.models.issue_template import IssueTemplate
from app.schemas.detection_rule import DetectionRule


def _row_to_dict(row: IssueTemplate) -> dict:
    rule_json = json.loads(row.detection_logic_json) if row.detection_logic_json else None
    execution_status = (
        "executable" if rule_json and rule_json.get("enabled") is not False
        else "manual_review_only"
    )
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
        "detection_logic_json": rule_json,
        "execution_status": execution_status,
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


def create_template(db: Session, data: dict, organization_id: int | None = None) -> dict:
    """Create a new custom issue template."""
    code = data["code"].upper()
    if db.query(IssueTemplate).filter(IssueTemplate.code == code).first():
        raise ValueError(f"Template {code} already exists")

    rule_json = data.get("detection_logic_json")
    row = IssueTemplate(
        code=code,
        category=data["category"],
        subcategory=data.get("subcategory"),
        issue_type=data.get("issue_type", "financial_analytics"),
        name=data["name"],
        description=data["description"],
        risk_level=data.get("risk_level", "moderate"),
        materiality_note=data.get("materiality_note"),
        detection_logic=data.get("detection_logic"),
        detection_logic_json=json.dumps(rule_json) if rule_json is not None else None,
        potential_causes_json=json.dumps(data.get("potential_causes", [])),
        suggested_procedures_json=json.dumps(data.get("suggested_procedures", [])),
        suggested_ajes_json=json.dumps(data.get("suggested_ajes", [])),
        management_questions_json=json.dumps(data.get("management_questions", [])),
        affected_account_types_json=json.dumps(data.get("affected_account_types", [])),
        affected_statements_json=json.dumps(data.get("affected_statements", [])),
        audit_assertions_json=json.dumps(data.get("audit_assertions", [])),
        references_json=json.dumps(data.get("references", [])),
        sort_order=data.get("sort_order", 0),
        is_active=True,
        is_system=False,
        organization_id=organization_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _row_to_dict(row)


_ARRAY_FIELDS = {
    "potential_causes", "suggested_procedures", "suggested_ajes",
    "management_questions", "affected_account_types", "affected_statements",
    "audit_assertions", "references",
}

_SCALAR_FIELDS = {
    "name", "description", "risk_level", "materiality_note",
    "detection_logic", "subcategory", "issue_type", "sort_order",
}


def update_template(db: Session, code: str, data: dict) -> dict:
    """Update editable fields of an existing template."""
    row = db.query(IssueTemplate).filter(IssueTemplate.code == code.upper()).first()
    if not row:
        raise ValueError(f"Template {code} not found")

    for field_name in _SCALAR_FIELDS:
        if field_name in data:
            setattr(row, field_name, data[field_name])

    if "detection_logic_json" in data:
        val = data["detection_logic_json"]
        row.detection_logic_json = json.dumps(val) if val is not None else None

    for field_name in _ARRAY_FIELDS:
        if field_name in data:
            setattr(row, f"{field_name}_json", json.dumps(data[field_name]))

    db.commit()
    db.refresh(row)
    return _row_to_dict(row)


def clone_template(
    db: Session,
    source_code: str,
    new_code: str,
    organization_id: int | None = None,
) -> dict:
    """Clone an existing template under a new code."""
    source = db.query(IssueTemplate).filter(IssueTemplate.code == source_code.upper()).first()
    if not source:
        raise ValueError(f"Source template {source_code} not found")

    new_code_upper = new_code.upper()
    if db.query(IssueTemplate).filter(IssueTemplate.code == new_code_upper).first():
        raise ValueError(f"Template {new_code_upper} already exists")

    row = IssueTemplate(
        code=new_code_upper,
        category=source.category,
        subcategory=source.subcategory,
        issue_type=source.issue_type,
        name=f"{source.name} (Copy)",
        description=source.description,
        risk_level=source.risk_level,
        materiality_note=source.materiality_note,
        detection_logic=source.detection_logic,
        detection_logic_json=source.detection_logic_json,
        potential_causes_json=source.potential_causes_json,
        suggested_procedures_json=source.suggested_procedures_json,
        suggested_ajes_json=source.suggested_ajes_json,
        management_questions_json=source.management_questions_json,
        affected_account_types_json=source.affected_account_types_json,
        affected_statements_json=source.affected_statements_json,
        audit_assertions_json=source.audit_assertions_json,
        references_json=source.references_json,
        sort_order=source.sort_order,
        is_active=True,
        is_system=False,
        organization_id=organization_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _row_to_dict(row)


def archive_template(db: Session, code: str) -> dict:
    """Deactivate a template (soft delete)."""
    row = db.query(IssueTemplate).filter(IssueTemplate.code == code.upper()).first()
    if not row:
        raise ValueError(f"Template {code} not found")
    row.is_active = False
    db.commit()
    db.refresh(row)
    return _row_to_dict(row)


_EXPORT_FIELDS = {
    "code", "category", "subcategory", "issue_type", "name", "description",
    "risk_level", "materiality_note", "detection_logic", "detection_logic_json",
    "potential_causes", "suggested_procedures", "suggested_ajes",
    "management_questions", "affected_account_types", "affected_statements",
    "audit_assertions", "references", "sort_order",
}


def export_templates(db: Session, category: str | None = None) -> list[dict]:
    """Export templates as portable dicts suitable for re-import."""
    return [
        {k: v for k, v in t.items() if k in _EXPORT_FIELDS}
        for t in list_templates(db, category=category)
    ]


def import_templates(
    db: Session,
    templates: list[dict],
    organization_id: int | None = None,
) -> dict:
    """
    Bulk-import template dicts.

    Skips codes that already exist. Returns counts and error details.
    """
    added: list[str] = []
    skipped: list[str] = []
    errors: list[dict] = []

    for t in templates:
        code = str(t.get("code", "")).upper()
        if not code:
            errors.append({"code": "", "error": "missing code"})
            continue
        try:
            if db.query(IssueTemplate).filter(IssueTemplate.code == code).first():
                skipped.append(code)
                continue
            create_template(db, {**t, "code": code}, organization_id=organization_id)
            added.append(code)
        except Exception as exc:
            errors.append({"code": code, "error": str(exc)})

    return {"added": added, "skipped": skipped, "errors": errors}


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
