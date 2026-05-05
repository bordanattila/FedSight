export interface StateRisk {
  state_code: string;
  state_name: string;
  fema_region: number | null;

  final_risk_score: number | null;
  disaster_count_score: number | null;
  recent_activity_score: number | null;
  hurricane_exposure_score: number | null;
  spending_gap_score: number | null;
  explanation: string | null;

  total_declarations: number | null;
  major_disaster_declarations: number | null;
  hurricane_count: number | null;
  declarations_last_5_years: number | null;
  most_recent_disaster_year: number | null;
}

export interface StatesRiskResponse {
  states: StateRisk[];
  count: number;
}
