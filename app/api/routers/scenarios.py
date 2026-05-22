from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import ScenarioCreate, ScenarioOut, ScenarioUpdate
from app.models.scenario import Scenario

router = APIRouter(prefix="/scenarios", tags=["scenarios"])

VALID_TYPES = {"actual", "topside", "pro_forma", "elimination", "carveout", "budget", "forecast"}


@router.get("/", response_model=list[ScenarioOut])
def list_scenarios(
    organization_id: int | None = None,
    active: bool | None = None,
    scenario_type: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Scenario)
    if organization_id is not None:
        q = q.filter(Scenario.organization_id == organization_id)
    if active is not None:
        q = q.filter(Scenario.active == active)
    if scenario_type is not None:
        q = q.filter(Scenario.scenario_type == scenario_type)
    return q.order_by(Scenario.code).all()


@router.post("/", response_model=ScenarioOut, status_code=201)
def create_scenario(body: ScenarioCreate, db: Session = Depends(get_db)):
    if body.scenario_type not in VALID_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid scenario_type '{body.scenario_type}'. Must be one of: {sorted(VALID_TYPES)}",
        )
    existing = db.query(Scenario).filter_by(code=body.code).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Scenario code '{body.code}' already exists")
    scenario = Scenario(**body.model_dump())
    db.add(scenario)
    db.flush()
    db.refresh(scenario)
    return scenario


@router.get("/{scenario_id}", response_model=ScenarioOut)
def get_scenario(scenario_id: int, db: Session = Depends(get_db)):
    scenario = db.get(Scenario, scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail=f"Scenario {scenario_id} not found")
    return scenario


@router.patch("/{scenario_id}", response_model=ScenarioOut)
def update_scenario(scenario_id: int, body: ScenarioUpdate, db: Session = Depends(get_db)):
    scenario = db.get(Scenario, scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail=f"Scenario {scenario_id} not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(scenario, field, value)
    db.flush()
    db.refresh(scenario)
    return scenario


@router.delete("/{scenario_id}", status_code=204)
def delete_scenario(scenario_id: int, db: Session = Depends(get_db)):
    scenario = db.get(Scenario, scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail=f"Scenario {scenario_id} not found")
    # Soft delete — don't orphan journal entries
    scenario.active = False
    db.flush()
