from __future__ import annotations

from typing import Optional
from pydantic import BaseModel


class StateRisk(BaseModel):
    state_code: str
    state_name: str
    fema_region: Optional[int] = None

    final_risk_score: Optional[float] = None
    disaster_count_score: Optional[float] = None
    recent_activity_score: Optional[float] = None
    hurricane_exposure_score: Optional[float] = None
    spending_gap_score: Optional[float] = None
    explanation: Optional[str] = None

    total_declarations: Optional[int] = None
    major_disaster_declarations: Optional[int] = None
    emergency_declarations: Optional[int] = None
    hurricane_count: Optional[int] = None
    flood_count: Optional[int] = None
    fire_count: Optional[int] = None
    severe_storm_count: Optional[int] = None
    tornado_count: Optional[int] = None
    declarations_last_5_years: Optional[int] = None
    declarations_last_10_years: Optional[int] = None
    most_recent_disaster_year: Optional[int] = None

    obligation_amount: Optional[float] = None
    obligation_per_declaration: Optional[float] = None

    model_config = {"from_attributes": True}


class StatesRiskResponse(BaseModel):
    states: list[StateRisk]
    count: int
