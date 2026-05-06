from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.schemas import StateRisk, StatesRiskResponse

router = APIRouter(prefix="/api/states", tags=["states"])

_RISK_QUERY = text("""
    SELECT
        s.state_code,
        s.state_name,
        s.fema_region,
        srs.final_risk_score,
        srs.disaster_count_score,
        srs.recent_activity_score,
        srs.hurricane_exposure_score,
        srs.spending_gap_score,
        srs.explanation,
        sds.total_declarations,
        sds.major_disaster_declarations,
        sds.emergency_declarations,
        sds.hurricane_count,
        sds.flood_count,
        sds.fire_count,
        sds.severe_storm_count,
        sds.tornado_count,
        sds.declarations_last_5_years,
        sds.declarations_last_10_years,
        sds.most_recent_disaster_year
    FROM states s
    JOIN state_risk_scores srs ON s.state_code = srs.state_code
    JOIN state_disaster_summary sds ON s.state_code = sds.state_code
    ORDER BY srs.final_risk_score DESC NULLS LAST
""")


@router.get("/risk", response_model=StatesRiskResponse)
def get_all_state_risks(db: Session = Depends(get_db)):
    rows = db.execute(_RISK_QUERY).mappings().all()
    states = [StateRisk.model_validate(dict(r)) for r in rows]
    return StatesRiskResponse(states=states, count=len(states))


@router.get("/top", response_model=StatesRiskResponse)
def get_top_states(
    n: int = Query(default=3, ge=1, le=10, description="Number of top-risk states"),
    db: Session = Depends(get_db),
):
    rows = db.execute(_RISK_QUERY).mappings().all()
    states = [StateRisk.model_validate(dict(r)) for r in rows[:n]]
    return StatesRiskResponse(states=states, count=len(states))
