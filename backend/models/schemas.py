from __future__ import annotations

from typing import Optional
from pydantic import BaseModel


class StateRisk(BaseModel):
    state_code: str
    state_name: str
    fema_region: Optional[int]

    final_risk_score: Optional[float]
    disaster_count_score: Optional[float]
    recent_activity_score: Optional[float]
    hurricane_exposure_score: Optional[float]
    spending_gap_score: Optional[float]
    explanation: Optional[str]

    total_declarations: Optional[int]
    major_disaster_declarations: Optional[int] = None
    emergency_declarations: Optional[int] = None
    hurricane_count: Optional[int]
    flood_count: Optional[int]
    fire_count: Optional[int]
    severe_storm_count: Optional[int]
    tornado_count: Optional[int]
    declarations_last_5_years: Optional[int]
    declarations_last_10_years: Optional[int] = None
    most_recent_disaster_year: Optional[int]

    model_config = {"from_attributes": True}


class StatesRiskResponse(BaseModel):
    states: list[StateRisk]
    count: int
